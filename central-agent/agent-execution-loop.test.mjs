import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanDigest, normalizeExecutionPlan, runExecutionLoop } from './agent-execution-loop.mjs';

const validPlan = () => ({ version: 1, goal: 'Find current Cloudflare Workers documentation', steps: [{ id: 'search_docs', tool: 'read_only_search', input: { query: 'Cloudflare Workers documentation' } }] });
const validApproval = async (plan, nonce = '7d444840-9b3c-4a5e-8eaf-81d3e0e7c812') => ({ approved: true, planDigest: await createPlanDigest(plan), nonce });
const setup = async (overrides = {}) => {
  const plan = validPlan();
  const auditEvents = [];
  const used = new Set();
  return {
    plan,
    auditEvents,
    approval: await validApproval(plan),
    ownerVerified: true,
    approvalStore: { async consumeOnce(nonce, digest) { if (used.has(nonce)) return false; used.add(nonce); return digest === await createPlanDigest(overrides.plan || plan); } },
    tools: { read_only_search: async ({ query }) => ({ sources: [{ title: 'Docs', url: 'https://developers.cloudflare.com/workers/', query }] }) },
    verifyStep: async ({ result }) => Array.isArray(result.sources) && result.sources.every(source => /^https?:\/\//.test(source.url)),
    audit: async event => { auditEvents.push(event); },
    ...overrides
  };
};

test('normalizes a valid plan and rejects unknown plan versions', () => {
  assert.equal(normalizeExecutionPlan(validPlan()).steps.length, 1);
  assert.throws(() => normalizeExecutionPlan({ ...validPlan(), version: 2 }), /PLAN_VERSION_UNSUPPORTED/);
});

test('rejects malformed plans and duplicate step ids before any execution', async () => {
  const s = await setup({ plan: { ...validPlan(), steps: [{ id: 'same', tool: 'read_only_search', input: {} }, { id: 'same', tool: 'read_only_search', input: {} }] } });
  const result = await runExecutionLoop(s);
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'PLAN_INVALID');
});

test('requires a verified owner session before consuming approval or running tools', async () => {
  let called = false;
  const s = await setup({ ownerVerified: false, approvalStore: { async consumeOnce() { called = true; return true; } } });
  const result = await runExecutionLoop(s);
  assert.equal(result.code, 'OWNER_SESSION_REQUIRED');
  assert.equal(called, false);
});

test('requires approval bound to the exact plan digest', async () => {
  const s = await setup({ approval: { ...(await validApproval(validPlan())), planDigest: 'wrong-digest' } });
  const result = await runExecutionLoop(s);
  assert.equal(result.code, 'APPROVAL_DIGEST_MISMATCH');
});

test('rejects replayed approval nonces without running a tool', async () => {
  const s = await setup();
  await runExecutionLoop(s);
  let calls = 0;
  s.tools.read_only_search = async () => { calls++; return {}; };
  const result = await runExecutionLoop(s);
  assert.equal(result.code, 'APPROVAL_REPLAYED');
  assert.equal(calls, 0);
});

test('fails closed when approval storage or audit is unavailable', async () => {
  const s = await setup({ approvalStore: null });
  assert.equal((await runExecutionLoop(s)).code, 'APPROVAL_STORE_UNAVAILABLE');
  const t = await setup({ audit: null });
  assert.equal((await runExecutionLoop(t)).code, 'AUDIT_UNAVAILABLE');
});

test('rejects a tool outside the trusted server-side allowlist', async () => {
  const s = await setup({ plan: { ...validPlan(), steps: [{ id: 'do_it', tool: 'arbitrary_shell', input: {} }] } });
  s.approval = await validApproval(s.plan);
  const result = await runExecutionLoop(s);
  assert.equal(result.code, 'TOOL_NOT_ALLOWLISTED');
});

test('records state transitions and only completes after verifier success', async () => {
  const s = await setup();
  const result = await runExecutionLoop(s);
  assert.equal(result.status, 'completed');
  assert.deepEqual(s.auditEvents.map(e => e.state), ['queued', 'running', 'verifying', 'step_completed', 'completed']);
});

test('verifier failure prevents completion', async () => {
  const s = await setup({ verifyStep: async () => false });
  const result = await runExecutionLoop(s);
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'STEP_VERIFICATION_FAILED');
  assert.notEqual(result.status, 'completed');
});

test('emergency stop prevents the next step', async () => {
  const plan = { ...validPlan(), steps: [{ id: 'first', tool: 'read_only_search', input: { query: 'one' } }, { id: 'second', tool: 'read_only_search', input: { query: 'two' } }] };
  let calls = 0;
  const s = await setup({ plan, tools: { read_only_search: async () => { calls++; return { ok: true }; } }, verifyStep: async () => true });
  s.approval = await validApproval(plan);
  s.signal = AbortSignal.abort('emergency-stop');
  const result = await runExecutionLoop(s);
  assert.equal(result.status, 'cancelled');
  assert.equal(calls, 0);
});

test('timeout is bounded and reported as a failure', async () => {
  const s = await setup({ timeoutMs: 10, tools: { read_only_search: async () => new Promise(() => {}) } });
  const result = await runExecutionLoop(s);
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'STEP_TIMEOUT');
});

test('emergency stop interrupts an in-flight tool instead of waiting for timeout', async () => {
  const controller = new AbortController();
  const s = await setup({ timeoutMs: 1000, signal: controller.signal, tools: { read_only_search: async (_input, context) => new Promise((resolve, reject) => {
    context.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    setTimeout(() => controller.abort(), 5);
  }) } });
  const result = await runExecutionLoop(s);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.code, 'EMERGENCY_STOP');
});

test('audit failure after tool execution blocks completion', async () => {
  const s = await setup({ audit: async event => { if (event.state === 'verifying') throw new Error('D1 unavailable'); } });
  const result = await runExecutionLoop(s);
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'AUDIT_WRITE_FAILED');
});
