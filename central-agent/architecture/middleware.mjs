/**
 * Ordered middleware chain. No middleware has implicit permission to cause side effects.
 */
export function createMiddlewarePipeline(middleware = []) {
  if (!Array.isArray(middleware) || middleware.some(fn => typeof fn !== "function")) throw new TypeError("Middleware must be an array of functions.");
  return async function run(context) {
    let current = context;
    for (const hook of middleware) {
      const result = await hook(current);
      if (!result || result.ok === false) return { ok: false, status: result?.status || 403, code: result?.code || "MIDDLEWARE_DENIED", context: current };
      if (result.context !== undefined) current = result.context;
      else if (result !== true) current = result;
    }
    return { ok: true, context: current };
  };
}
export function requireOwnerApproval(context) {
  if (context?.sideEffect !== true) return { ok: true, context };
  const approval = context?.ownerApproval;
  if (!approval || approval.approved !== true || approval.action !== context?.action || typeof approval.nonce !== "string" || !approval.nonce) {
    return { ok: false, status: 403, code: "OWNER_APPROVAL_REQUIRED" };
  }
  return { ok: true, context };
}
export function enforceBudget(context) {
  const maxSteps = Number.isInteger(context?.budget?.maxSteps) ? context.budget.maxSteps : 0;
  const stepsUsed = Number.isInteger(context?.budget?.stepsUsed) ? context.budget.stepsUsed : 0;
  if (maxSteps < 1 || stepsUsed >= maxSteps) return { ok: false, status: 429, code: "AGENT_BUDGET_EXHAUSTED" };
  return { ok: true, context };
}
