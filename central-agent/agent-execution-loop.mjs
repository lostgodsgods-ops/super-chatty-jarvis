const MAX_GOAL_LENGTH = 400;
const MAX_STEPS = 8;
const MAX_INPUT_BYTES = 4000;
const MAX_RESULT_BYTES = 12000;
const DEFAULT_STEP_TIMEOUT_MS = 8000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[a-z][a-z0-9_-]{0,39}$/;

function fail(code) { const error = new Error(code); error.code = code; throw error; }

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(key => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
}

export function normalizeExecutionPlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('PLAN_INVALID');
  if (input.version !== 1) fail('PLAN_VERSION_UNSUPPORTED');
  if (typeof input.goal !== 'string') fail('PLAN_INVALID');
  const goal = input.goal.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!goal || goal.length > MAX_GOAL_LENGTH || !Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > MAX_STEPS) fail('PLAN_INVALID');
  const seen = new Set();
  const steps = input.steps.map(step => {
    if (!step || typeof step !== 'object' || Array.isArray(step) || !IDENTIFIER.test(step.id || '') || !IDENTIFIER.test(step.tool || '')) fail('PLAN_INVALID');
    if (seen.has(step.id)) fail('PLAN_INVALID');
    seen.add(step.id);
    if (!step.input || typeof step.input !== 'object' || Array.isArray(step.input)) fail('PLAN_INVALID');
    let encoded;
    try { encoded = JSON.stringify(step.input); } catch { fail('PLAN_INVALID'); }
    if (!encoded || encoded.length > MAX_INPUT_BYTES) fail('PLAN_INVALID');
    const parsed = JSON.parse(encoded);
    if (Object.keys(parsed).some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) fail('PLAN_INVALID');
    return { id: step.id, tool: step.tool, input: parsed };
  });
  return { version: 1, goal, steps };
}

export async function createPlanDigest(plan) {
  const normalized = normalizeExecutionPlan(plan);
  const bytes = new TextEncoder().encode(canonicalize(normalized));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function safeResult(value) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch { fail('STEP_RESULT_NOT_SERIALIZABLE'); }
  if (typeof encoded !== 'string' || encoded.length > MAX_RESULT_BYTES) fail('STEP_RESULT_TOO_LARGE');
  return JSON.parse(encoded);
}

async function auditState(audit, event) {
  try { await audit({ ...event, timestamp: new Date().toISOString() }); return true; }
  catch { return false; }
}

async function runWithTimeout(handler, input, context, timeoutMs) {
  let timer;
  let abortHandler;
  const timeoutController = new AbortController();
  const combinedSignal = context.signal ? AbortSignal.any([context.signal, timeoutController.signal]) : timeoutController.signal;
  const interrupted = new Promise((_, reject) => {
    if (context.signal?.aborted) {
      reject(Object.assign(new Error('EMERGENCY_STOP'), { code: 'EMERGENCY_STOP' }));
      return;
    }
    if (context.signal) {
      abortHandler = () => reject(Object.assign(new Error('EMERGENCY_STOP'), { code: 'EMERGENCY_STOP' }));
      context.signal.addEventListener('abort', abortHandler, { once: true });
    }
  });
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timeoutController.abort('STEP_TIMEOUT');
      reject(Object.assign(new Error('STEP_TIMEOUT'), { code: 'STEP_TIMEOUT' }));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => handler(input, { ...context, signal: combinedSignal })),
      timedOut,
      interrupted
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abortHandler && context.signal) context.signal.removeEventListener('abort', abortHandler);
  }
}

/**
 * Bounded execution kernel. tools, approvalStore, and audit must be supplied by trusted server code,
 * never by request payloads. The caller must have already authenticated the owner session.
 * No persistence or HTTP route is added by this module; approvalStore.consumeOnce must be atomic.
 */
export async function runExecutionLoop({ plan: rawPlan, approval, ownerVerified, approvalStore, tools, verifyStep, audit, signal, timeoutMs = DEFAULT_STEP_TIMEOUT_MS }) {
  let plan;
  try { plan = normalizeExecutionPlan(rawPlan); }
  catch (error) { return { ok: false, status: 'blocked', code: error?.code || 'PLAN_INVALID' }; }
  if (ownerVerified !== true) return { ok: false, status: 'blocked', code: 'OWNER_SESSION_REQUIRED' };
  if (typeof audit !== 'function') return { ok: false, status: 'blocked', code: 'AUDIT_UNAVAILABLE' };
  if (!approvalStore || typeof approvalStore.consumeOnce !== 'function') return { ok: false, status: 'blocked', code: 'APPROVAL_STORE_UNAVAILABLE' };
  if (!tools || typeof tools !== 'object' || Array.isArray(tools)) return { ok: false, status: 'blocked', code: 'TOOL_REGISTRY_UNAVAILABLE' };
  if (typeof verifyStep !== 'function') return { ok: false, status: 'blocked', code: 'VERIFIER_UNAVAILABLE' };
  for (const step of plan.steps) if (typeof tools[step.tool] !== 'function') return { ok: false, status: 'blocked', code: 'TOOL_NOT_ALLOWLISTED', stepId: step.id };
  const timeout = Number.isFinite(timeoutMs) ? Math.max(10, Math.min(30000, Math.floor(timeoutMs))) : DEFAULT_STEP_TIMEOUT_MS;
  const runId = globalThis.crypto.randomUUID();
  const planDigest = await createPlanDigest(plan);
  if (!approval || approval.approved !== true || typeof approval.nonce !== 'string' || !UUID_V4.test(approval.nonce)) return { ok: false, status: 'blocked', code: 'APPROVAL_REQUIRED', runId, planDigest };
  if (approval.planDigest !== planDigest) return { ok: false, status: 'blocked', code: 'APPROVAL_DIGEST_MISMATCH', runId, planDigest };
  let consumed;
  try { consumed = await approvalStore.consumeOnce(approval.nonce, planDigest); }
  catch { return { ok: false, status: 'blocked', code: 'APPROVAL_STORE_UNAVAILABLE', runId, planDigest }; }
  if (consumed !== true) return { ok: false, status: 'blocked', code: 'APPROVAL_REPLAYED', runId, planDigest };

  const emit = async (state, details = {}) => auditState(audit, { runId, state, planDigest, ...details });
  if (!await emit('queued')) return { ok: false, status: 'blocked', code: 'AUDIT_WRITE_FAILED', runId, planDigest };
  if (signal?.aborted) {
    if (!await emit('cancelled', { code: 'EMERGENCY_STOP' })) return { ok: false, status: 'blocked', code: 'AUDIT_WRITE_FAILED', runId, planDigest };
    return { ok: false, status: 'cancelled', code: 'EMERGENCY_STOP', runId, planDigest, steps: [] };
  }
  if (!await emit('running')) return { ok: false, status: 'blocked', code: 'AUDIT_WRITE_FAILED', runId, planDigest };
  const completedSteps = [];
  for (const step of plan.steps) {
    if (signal?.aborted) {
      if (!await emit('cancelled', { stepId: step.id, code: 'EMERGENCY_STOP' })) return { ok: false, status: 'blocked', code: 'AUDIT_WRITE_FAILED', runId, planDigest, steps: completedSteps };
      return { ok: false, status: 'cancelled', code: 'EMERGENCY_STOP', runId, planDigest, steps: completedSteps };
    }
    let result;
    try {
      result = safeResult(await runWithTimeout(tools[step.tool], step.input, { runId, stepId: step.id, planDigest, signal }, timeout));
    } catch (error) {
      if (signal?.aborted || error?.code === 'EMERGENCY_STOP') {
        if (!await emit('cancelled', { stepId: step.id, code: 'EMERGENCY_STOP' })) return { ok: false, status: 'blocked', code: 'AUDIT_WRITE_FAILED', runId, planDigest, steps: completedSteps };
        return { ok: false, status: 'cancelled', code: 'EMERGENCY_STOP', runId, planDigest, steps: completedSteps };
      }
      const code = error?.code === 'STEP_TIMEOUT' ? 'STEP_TIMEOUT' : 'STEP_EXECUTION_FAILED';
      if (!await emit('failed', { stepId: step.id, code })) return { ok: false, status: 'blocked', code: 'AUDIT_WRITE_FAILED', runId, planDigest, steps: completedSteps };
      return { ok: false, status: 'failed', code, runId, planDigest, steps: completedSteps };
    }
    if (!await emit('verifying', { stepId: step.id })) return { ok: false, status: 'blocked', code: 'AUDIT_WRITE_FAILED', runId, planDigest, steps: completedSteps };
    let verified = false;
    try { verified = await verifyStep({ plan, step, result, runId, planDigest }); } catch { verified = false; }
    if (verified !== true) {
      if (!await emit('failed', { stepId: step.id, code: 'STEP_VERIFICATION_FAILED' })) return { ok: false, status: 'blocked', code: 'AUDIT_WRITE_FAILED', runId, planDigest, steps: completedSteps };
      return { ok: false, status: 'failed', code: 'STEP_VERIFICATION_FAILED', runId, planDigest, steps: completedSteps };
    }
    completedSteps.push({ stepId: step.id, result });
    if (!await emit('step_completed', { stepId: step.id })) return { ok: false, status: 'blocked', code: 'AUDIT_WRITE_FAILED', runId, planDigest, steps: completedSteps };
  }
  if (!await emit('completed')) return { ok: false, status: 'blocked', code: 'AUDIT_WRITE_FAILED', runId, planDigest, steps: completedSteps };
  return { ok: true, status: 'completed', runId, planDigest, steps: completedSteps };
}
