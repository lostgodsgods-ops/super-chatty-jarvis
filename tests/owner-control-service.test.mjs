import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OWNER_CONTROL_SETTINGS,
  validateOwnerControlSettings,
  normalizeOwnerControlCommand
} from "../central-agent/architecture/owner-control-service.mjs";

test("default owner settings expose normal mode and immutable guardrails", () => {
  assert.equal(DEFAULT_OWNER_CONTROL_SETTINGS.mode, "normal");
  assert.equal(DEFAULT_OWNER_CONTROL_SETTINGS.emergencyStop, false);
  assert.ok(Array.isArray(DEFAULT_OWNER_CONTROL_SETTINGS.customRules));
  assert.ok(DEFAULT_OWNER_CONTROL_SETTINGS.nonOverridable.includes("audit_evasion"));
});

test("owner can customize bounded rules without removing core guardrails", () => {
  const result = validateOwnerControlSettings({
    customRules: [{ id: "quiet-hours", enabled: true, description: "Pause routine tasks at night" }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.settings.customRules[0].id, "quiet-hours");
  assert.ok(result.settings.nonOverridable.includes("audit_evasion"));
});

test("invalid or oversized rules are rejected", () => {
  assert.equal(validateOwnerControlSettings({ customRules: "not-an-array" }).ok, false);
  assert.equal(validateOwnerControlSettings({ customRules: Array.from({ length: 51 }, (_, i) => ({ id: "r" + i, enabled: true, description: "rule" })) }).ok, false);
  assert.equal(validateOwnerControlSettings({ customRules: [{ id: "bad id", enabled: true, description: "rule" }] }).ok, false);
});

test("command normalization accepts only supported owner-control commands", () => {
  assert.equal(normalizeOwnerControlCommand({ action: "takeover", enabled: true }).ok, true);
  assert.equal(normalizeOwnerControlCommand({ action: "emergency-stop", enabled: true }).ok, true);
  assert.equal(normalizeOwnerControlCommand({ action: "unknown", enabled: true }).ok, false);
});

test("client payload cannot directly assert authentication or capability grants", () => {
  const command = normalizeOwnerControlCommand({ action: "takeover", enabled: true, ownerAuthenticated: true, capabilities: ["everything"] });
  assert.equal(command.ok, true);
  assert.equal("ownerAuthenticated" in command.command, false);
  assert.equal("capabilities" in command.command, false);
});
