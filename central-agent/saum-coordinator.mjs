/**
 * Agent Saum: bounded delegation policy for RESULTRON.
 * This module validates plans; it never grants permissions or executes side effects.
 */
const MAX_TASKS = 3;
const MAX_GOAL_LENGTH = 1200;
const MAX_TASK_INPUT = 2400;
const ALLOWED_ROLES = new Set(["global_scraper", "code_mutator", "api_orchestrator", "testing"]);

function cleanText(value, limit) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function normalizeSaumDelegation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.tasks)) {
    return { ok: false, error: "SAUM_PLAN_INVALID" };
  }
  if (value.tasks.length < 1) return { ok: false, error: "SAUM_PLAN_EMPTY" };
  if (value.tasks.length > MAX_TASKS) return { ok: false, error: "SAUM_TOO_MANY_TASKS" };

  const tasks = [];
  for (const task of value.tasks) {
    if (!task || typeof task !== "object" || Array.isArray(task) || typeof task.role !== "string") {
      return { ok: false, error: "SAUM_TASK_INVALID" };
    }
    if (!ALLOWED_ROLES.has(task.role)) return { ok: false, error: "SAUM_ROLE_NOT_ALLOWED" };
    const input = cleanText(task.input, MAX_TASK_INPUT);
    if (!input || typeof task.input !== "string" || task.input.trim().length > MAX_TASK_INPUT) {
      return { ok: false, error: "SAUM_TASK_INPUT_INVALID" };
    }
    // Whitelist only role + input; model-generated permissions and tool names are discarded.
    tasks.push({ role: task.role, input });
  }
  return { ok: true, tasks };
}

export function fallbackSaumPlan(goal) {
  const normalizedGoal = cleanText(goal, MAX_GOAL_LENGTH);
  if (!normalizedGoal || typeof goal !== "string" || goal.trim().length > MAX_GOAL_LENGTH) {
    return { ok: false, error: "SAUM_GOAL_INVALID" };
  }
  return {
    ok: true,
    tasks: [
      { role: "global_scraper", input: "Research reliable evidence and existing solutions for this RESULTRON goal: " + normalizedGoal },
      { role: "api_orchestrator", input: "Create a bounded implementation plan, dependencies, and risks for this RESULTRON goal: " + normalizedGoal },
      { role: "testing", input: "Define test cases, acceptance criteria, and regressions to verify for this RESULTRON goal: " + normalizedGoal }
    ]
  };
}

export const SAUM_LIMITS = Object.freeze({ maxTasks: MAX_TASKS, maxGoalLength: MAX_GOAL_LENGTH, maxTaskInput: MAX_TASK_INPUT });
