/**
 * Server-side execution gate backed by the persisted Owner Control state.
 * It only decides whether execution may proceed; it never executes a task itself.
 */
const CREATE_STATE_TABLE = "CREATE TABLE IF NOT EXISTS owner_control_state (id INTEGER PRIMARY KEY CHECK (id = 1), state_json TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)";

function denied(reason) {
  return {
    ok: false,
    reason,
    mode: "unavailable",
    priority: "none",
    allowOwnerActions: false,
    allowBackgroundTasks: false
  };
}

export async function readOwnerExecutionGate(env = {}) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return denied("OWNER_CONTROL_STORE_UNAVAILABLE");
  }

  try {
    await env.DB.prepare(CREATE_STATE_TABLE).run();
    const row = await env.DB.prepare("SELECT state_json, revision FROM owner_control_state WHERE id = 1").first();
    if (!row?.state_json) {
      return {
        ok: true,
        reason: "NORMAL_MODE",
        mode: "normal",
        priority: "standard",
        revision: 0,
        allowOwnerActions: true,
        allowBackgroundTasks: true
      };
    }

    const state = JSON.parse(row.state_json);
    if (!state || typeof state !== "object" || Array.isArray(state) ||
        !["normal", "owner-takeover", "emergency-stop"].includes(state.mode) ||
        typeof state.emergencyStop !== "boolean" ||
        !Number.isSafeInteger(Number(row.revision ?? state.revision)) ||
        Number(row.revision ?? state.revision) < 0) {
      return denied("OWNER_CONTROL_STATE_CORRUPT");
    }

    const revision = Number(row.revision ?? state.revision);
    if (state.emergencyStop || state.mode === "emergency-stop") {
      return {
        ok: true,
        reason: "EMERGENCY_STOP_ACTIVE",
        mode: "emergency-stop",
        priority: "none",
        revision,
        allowOwnerActions: false,
        allowBackgroundTasks: false
      };
    }

    if (state.mode === "owner-takeover") {
      return {
        ok: true,
        reason: "OWNER_TAKEOVER_ACTIVE",
        mode: "owner-takeover",
        priority: "owner",
        revision,
        allowOwnerActions: true,
        allowBackgroundTasks: false
      };
    }

    return {
      ok: true,
      reason: "NORMAL_MODE",
      mode: "normal",
      priority: "standard",
      revision,
      allowOwnerActions: true,
      allowBackgroundTasks: true
    };
  } catch {
    return denied("OWNER_CONTROL_STORE_UNAVAILABLE");
  }
}
