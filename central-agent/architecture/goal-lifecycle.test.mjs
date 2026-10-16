import test from "node:test";
import assert from "node:assert/strict";
import { GoalError, normalizeGoalPlan, validateGoalApproval, GOAL_APPROVAL_PHRASE, transitionGoal } from "./goal-lifecycle.mjs";

test("goal plan normalization bounds steps and allows only registered actions", () => {
  const plan = normalizeGoalPlan({
    title: "  Research and index  ",
    steps: [
      { action: "knowledge_search", description: "Search approved public sources" },
      { action: "mcp_discovery", description: "List configured MCP tools" }
    ],
    rollbackPlan: [{ stepIndex: 0, compensation: "Mark derived notes for review" }]
  });
  assert.equal(plan.title, "Research and index");
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].status, "planned");
  assert.equal(plan.rollbackPlan[0].status, "not_required");
  assert.throws(() => normalizeGoalPlan({ title: "bad", steps: [{ action: "delete_everything", description: "unsafe" }] }),
    error => error instanceof GoalError && error.code === "INVALID_GOAL_STEP_0");
  assert.throws(() => normalizeGoalPlan({ title: "bad", steps: [] }),
    error => error instanceof GoalError && error.code === "GOAL_STEPS_MUST_BE_1_TO_10");
});

test("goal approval must match the exact canonical plan and one-use UUID nonce", () => {
  const plan = normalizeGoalPlan({ title: "Research", steps: [{ action: "knowledge_search", description: "Find public docs" }] });
  const canonical = JSON.stringify({
    title: plan.title,
    steps: plan.steps.map(({index, action, description}) => ({index, action, description})),
    rollbackPlan: []
  });
  const approval = {
    approved: true, action: "goal_chain", confirmation: GOAL_APPROVAL_PHRASE,
    planDigest: canonical, nonce: "550e8400-e29b-41d4-a716-446655440000"
  };
  assert.equal(validateGoalApproval(canonical, approval), true);
  assert.equal(validateGoalApproval(canonical, { ...approval, planDigest: "{}" }), false);
  assert.equal(validateGoalApproval(canonical, { ...approval, action: "deploy" }), false);
  assert.equal(validateGoalApproval(canonical, { ...approval, nonce: "replay" }), false);
});

test("completed goal transition requires evidence for every planned step", async () => {
  const row = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    status: "running",
    stepsJson: JSON.stringify([{ action: "knowledge_search" }, { action: "mcp_discovery" }]),
    rollbackJson: "[]",
    currentStep: 0,
    version: 1
  };
  let batches = 0;
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() { return { meta: { changes: 0 } }; },
        async first() { return sql.includes("SELECT id,status") ? row : null; }
      };
    },
    async batch(statements) {
      batches++;
      assert.equal(statements.length, 2);
      return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }];
    }
  };
  const env = { DB: db };
  await assert.rejects(
    transitionGoal(env, row.id, "completed", {}),
    error => error instanceof GoalError && error.code === "COMPLETION_EVIDENCE_REQUIRED"
  );
  assert.equal(batches, 0);
  const result = await transitionGoal(env, row.id, "completed", {
    completedStepCount: 2, evidenceRef: "test-run:verified-steps-1-2"
  });
  assert.equal(result.status, "completed");
  assert.equal(result.executionPerformed, false);
  assert.equal(batches, 1);
});

test("rollback completion requires explicit compensation evidence", async () => {
  const row = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    status: "rollback_requested",
    stepsJson: JSON.stringify([{ action: "knowledge_search" }]),
    rollbackJson: JSON.stringify([{ compensation: "manual review", status: "pending_manual_compensation" }]),
    currentStep: 0,
    version: 2
  };
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() { return { meta: { changes: 0 } }; },
        async first() { return sql.includes("SELECT id,status") ? row : null; }
      };
    },
    async batch() { return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }]; }
  };
  await assert.rejects(
    transitionGoal({ DB: db }, row.id, "rolled_back", {}),
    error => error instanceof GoalError && error.code === "ROLLBACK_EVIDENCE_REQUIRED"
  );
});
