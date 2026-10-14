import test from "node:test";
import assert from "node:assert/strict";
import { classifyAction, mayExecute, describePolicy } from "./policy.mjs";

test("read-only planning is non-destructive but still cannot run unimplemented tools", () => {
  assert.equal(classifyAction("plan"), "read-only");
  assert.equal(mayExecute("plan", { ownerApproved: false, toolImplemented: true }), true);
  assert.equal(mayExecute("research_external", { ownerApproved: false, toolImplemented: true }), false);
});

test("side effects require explicit owner approval and an implemented tool", () => {
  assert.equal(classifyAction("write_file"), "side-effect");
  assert.equal(mayExecute("write_file", { ownerApproved: false, toolImplemented: true }), false);
  assert.equal(mayExecute("write_file", { ownerApproved: true, toolImplemented: false }), false);
  assert.equal(mayExecute("write_file", { ownerApproved: true, toolImplemented: true }), true);
});

test("unknown actions fail closed", () => {
  assert.equal(classifyAction("anything_unknown"), "blocked");
  assert.equal(mayExecute("anything_unknown", { ownerApproved: true, toolImplemented: true }), false);
});

test("child agent creation always requires owner approval and a bounded role", () => {
  assert.equal(mayExecute("create_child_agent", { ownerApproved: false, toolImplemented: true, role: "testing" }), false);
  assert.equal(mayExecute("create_child_agent", { ownerApproved: true, toolImplemented: true, role: "testing" }), true);
  assert.equal(mayExecute("create_child_agent", { ownerApproved: true, toolImplemented: true, role: "root-admin" }), false);
});

test("policy description states fail-closed defaults", () => {
  const policy = describePolicy();
  assert.equal(policy.defaultDecision, "deny");
  assert.equal(policy.selfGrantPermissions, false);
  assert.equal(policy.childAgentCreationRequiresOwnerApproval, true);
});