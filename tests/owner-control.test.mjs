import test from "node:test";
import assert from "node:assert/strict";
import {
  createOwnerControlState,
  setOwnerTakeover,
  setEmergencyStop,
  authorizeOwnerCommand
} from "../central-agent/architecture/owner-control.mjs";

test("takeover cannot be enabled without an authenticated owner", () => {
  const state = createOwnerControlState();
  const result = setOwnerTakeover(state, true);
  assert.equal(result.allowed, false);
  assert.equal(result.code, "OWNER_AUTH_REQUIRED");
  assert.equal(result.state, state);
});

test("authenticated owner can enable takeover and receive priority", () => {
  const state = createOwnerControlState();
  const enabled = setOwnerTakeover(state, true, { ownerAuthenticated: true });
  assert.equal(enabled.allowed, true);
  assert.equal(enabled.state.mode, "owner-takeover");
  const decision = authorizeOwnerCommand(enabled.state, { riskClass: "ordinary" }, {
    ownerAuthenticated: true, capabilityAvailable: true
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.priority, "owner");
});

test("takeover does not grant an unconfigured capability", () => {
  const state = setOwnerTakeover(createOwnerControlState(), true, { ownerAuthenticated: true }).state;
  const decision = authorizeOwnerCommand(state, { riskClass: "ordinary" }, { ownerAuthenticated: true });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "CAPABILITY_NOT_CONFIGURED");
});

test("owner priority cannot override non-overridable guardrails", () => {
  const state = setOwnerTakeover(createOwnerControlState(), true, { ownerAuthenticated: true }).state;
  const decision = authorizeOwnerCommand(state, { riskClass: "audit_evasion" }, {
    ownerAuthenticated: true, capabilityAvailable: true, explicitApproval: true
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "NON_OVERRIDABLE_GUARDRAIL");
});

test("external side effects require explicit approval even during takeover", () => {
  const state = setOwnerTakeover(createOwnerControlState(), true, { ownerAuthenticated: true }).state;
  const command = { riskClass: "ordinary", externalSideEffect: true };
  const denied = authorizeOwnerCommand(state, command, { ownerAuthenticated: true, capabilityAvailable: true });
  assert.equal(denied.allowed, false);
  assert.equal(denied.code, "EXPLICIT_APPROVAL_REQUIRED");
  const approved = authorizeOwnerCommand(state, command, {
    ownerAuthenticated: true, capabilityAvailable: true, explicitApproval: true
  });
  assert.equal(approved.allowed, true);
  assert.equal(approved.auditRequired, true);
});

test("emergency stop blocks commands and takeover cannot bypass it", () => {
  const stopped = setEmergencyStop(createOwnerControlState(), true, { ownerAuthenticated: true });
  assert.equal(stopped.state.mode, "emergency-stop");
  const takeover = setOwnerTakeover(stopped.state, true, { ownerAuthenticated: true });
  assert.equal(takeover.allowed, false);
  assert.equal(takeover.code, "EMERGENCY_STOP_ACTIVE");
  const decision = authorizeOwnerCommand(stopped.state, { riskClass: "ordinary" }, {
    ownerAuthenticated: true, capabilityAvailable: true, explicitApproval: true
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "EMERGENCY_STOP_ACTIVE");
});

test("unauthenticated callers cannot clear emergency stop", () => {
  const stopped = setEmergencyStop(createOwnerControlState(), true, { ownerAuthenticated: true }).state;
  const result = setEmergencyStop(stopped, false);
  assert.equal(result.allowed, false);
  assert.equal(result.state.emergencyStop, true);
});
