import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OWNER_CONTROL_SETTINGS,
  normalizeOwnerControlCommand,
  validateOwnerControlSettings
} from "./owner-control-service.mjs";

test("owner may customize a valid non-protected rule", () => {
  const result = validateOwnerControlSettings({
    customRules: [{ id: "research_agent", enabled: false, description: "Pause optional research agent" }]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.settings.customRules, [
    { id: "research_agent", enabled: false, description: "Pause optional research agent" }
  ]);
  assert.deepEqual(result.settings.nonOverridable, [...DEFAULT_OWNER_CONTROL_SETTINGS.nonOverridable]);
});

test("custom rules cannot shadow non-overridable boundaries", () => {
  for (const id of DEFAULT_OWNER_CONTROL_SETTINGS.nonOverridable) {
    const result = validateOwnerControlSettings({
      customRules: [{ id, enabled: false, description: "Attempt to disable protected rule" }]
    });
    assert.equal(result.ok, false, id);
    assert.equal(result.error, "NON_OVERRIDABLE_RULE", id);
  }
});

test("owner update command rejects protected rule IDs before persistence", () => {
  const result = normalizeOwnerControlCommand({
    action: "update-rules",
    customRules: [{ id: "audit_evasion", enabled: false, description: "Disable audit" }]
  });
  assert.deepEqual(result, { ok: false, error: "NON_OVERRIDABLE_RULE" });
});

test("duplicate, malformed, and oversized rule sets are rejected", () => {
  const duplicate = validateOwnerControlSettings({
    customRules: [
      { id: "cache", enabled: true, description: "Enable cache" },
      { id: "cache", enabled: false, description: "Disable cache" }
    ]
  });
  assert.deepEqual(duplicate, { ok: false, error: "INVALID_CUSTOM_RULE" });

  const malformed = validateOwnerControlSettings({ customRules: [{ id: "bad id", enabled: true, description: "bad" }] });
  assert.deepEqual(malformed, { ok: false, error: "INVALID_CUSTOM_RULE" });

  const oversized = validateOwnerControlSettings({
    customRules: Array.from({ length: 51 }, (_, i) => ({ id: "r" + i, enabled: true, description: "Rule " + i }))
  });
  assert.deepEqual(oversized, { ok: false, error: "INVALID_CUSTOM_RULES" });
});

test("settings updates preserve takeover and emergency-stop state", () => {
  const current = { ...DEFAULT_OWNER_CONTROL_SETTINGS, mode: "owner-takeover", emergencyStop: true, revision: 7 };
  const result = validateOwnerControlSettings({ customRules: [] }, current);
  assert.equal(result.ok, true);
  assert.equal(result.settings.mode, "owner-takeover");
  assert.equal(result.settings.emergencyStop, true);
  assert.equal(result.settings.revision, 7);
});

test("unsupported owner actions and non-boolean toggles are rejected", () => {
  assert.deepEqual(normalizeOwnerControlCommand({ action: "disable-all-safety" }), {
    ok: false, error: "UNSUPPORTED_OWNER_CONTROL_ACTION"
  });
  assert.deepEqual(normalizeOwnerControlCommand({ action: "takeover", enabled: "yes" }), {
    ok: false, error: "INVALID_ENABLED_VALUE"
  });
});
