/**
 * Validation helpers for the owner-control API.
 * Authentication, persistence and audit remain responsibilities of the Worker.
 */
export const DEFAULT_OWNER_CONTROL_SETTINGS = Object.freeze({
  mode: "normal",
  emergencyStop: false,
  ownerPriority: true,
  revision: 0,
  customRules: Object.freeze([]),
  nonOverridable: Object.freeze([
    "unauthorized_access",
    "harmful_action",
    "weaponized_control",
    "audit_evasion",
    "impossible_capability"
  ])
});

const ALLOWED_ACTIONS = new Set(["takeover", "emergency-stop", "update-rules"]);

export function normalizeOwnerControlCommand(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "INVALID_COMMAND" };
  }
  if (!ALLOWED_ACTIONS.has(input.action)) return { ok: false, error: "UNSUPPORTED_OWNER_CONTROL_ACTION" };

  if (input.action === "update-rules") {
    const validated = validateOwnerControlSettings({ customRules: input.customRules });
    if (!validated.ok) return validated;
    return { ok: true, command: { action: "update-rules", customRules: validated.settings.customRules } };
  }
  if (typeof input.enabled !== "boolean") return { ok: false, error: "INVALID_ENABLED_VALUE" };
  return { ok: true, command: { action: input.action, enabled: input.enabled } };
}

export function validateOwnerControlSettings(input, current = DEFAULT_OWNER_CONTROL_SETTINGS) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "INVALID_SETTINGS" };
  }
  const rules = input.customRules;
  if (!Array.isArray(rules) || rules.length > 50) {
    return { ok: false, error: "INVALID_CUSTOM_RULES" };
  }
  const seen = new Set();
  const normalized = [];
  for (const rule of rules) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule) ||
        typeof rule.id !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(rule.id) ||
        seen.has(rule.id) || typeof rule.enabled !== "boolean" ||
        typeof rule.description !== "string" || !rule.description.trim() ||
        rule.description.length > 240) {
      return { ok: false, error: "INVALID_CUSTOM_RULE" };
    }
    seen.add(rule.id);
    normalized.push({ id: rule.id, enabled: rule.enabled, description: rule.description.trim() });
  }
  return {
    ok: true,
    settings: {
      mode: current.mode === "owner-takeover" ? "owner-takeover" : "normal",
      emergencyStop: current.emergencyStop === true,
      ownerPriority: true,
      revision: Number.isSafeInteger(current.revision) ? current.revision : 0,
      customRules: normalized,
      nonOverridable: [...DEFAULT_OWNER_CONTROL_SETTINGS.nonOverridable]
    }
  };
}
