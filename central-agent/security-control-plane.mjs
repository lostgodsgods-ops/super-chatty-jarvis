/**
 * Fail-closed request parser for REDULTRON.
 *
 * This validates request shape and asks an independent server-side authorization
 * callback before privileged work. It deliberately does not use keyword/regex
 * matching as an authorization mechanism. Callers must still enforce permissions
 * again at the tool/action handler boundary.
 */
const ALLOWED_ACTIONS = new Set(["query", "execute_privileged"]);
const MAX_RAW_BYTES = 16_384;
const MAX_PAYLOAD_CHARS = 8_000;

export class RedultronSecurityEngine {
  constructor({ authorizeAction } = {}) {
    this.systemState = "SECURE_LOCKED";
    this.failedAttempts = 0;
    this.authorizeAction = authorizeAction;
  }

  async validateAndParse(rawInputJson, context = {}) {
    if (typeof rawInputJson !== "string" || rawInputJson.length === 0 ||
        new TextEncoder().encode(rawInputJson).byteLength > MAX_RAW_BYTES) {
      this.failedAttempts += 1;
      return { status: "REJECTED", reason: "Invalid or oversized JSON input." };
    }

    let data;
    try {
      data = JSON.parse(rawInputJson);
    } catch {
      this.failedAttempts += 1;
      return { status: "REJECTED", reason: "Malformed JSON structure." };
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      this.failedAttempts += 1;
      return { status: "REJECTED", reason: "Request must be a JSON object." };
    }

    const keys = Object.keys(data);
    if (keys.some(key => !["action", "payload", "request_id"].includes(key))) {
      this.failedAttempts += 1;
      return { status: "REJECTED", reason: "Unknown request field." };
    }

    const action = data.action === undefined ? "query" : data.action;
    const payload = data.payload === undefined ? "" : data.payload;
    if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action)) {
      this.failedAttempts += 1;
      return { status: "REJECTED", reason: "Unsupported action." };
    }
    if (typeof payload !== "string" || payload.length > MAX_PAYLOAD_CHARS) {
      this.failedAttempts += 1;
      return { status: "REJECTED", reason: "Payload must be a string of at most 8000 characters." };
    }
    if (data.request_id !== undefined &&
        (typeof data.request_id !== "string" || data.request_id.length > 128)) {
      this.failedAttempts += 1;
      return { status: "REJECTED", reason: "Invalid request_id." };
    }

    if (action === "execute_privileged") {
      if (this.systemState !== "AUTHORIZED" ||
          typeof this.authorizeAction !== "function") {
        this.failedAttempts += 1;
        return {
          status: "UNAUTHORIZED_TOOL_CALL",
          message: "Independent server-side authorization is required."
        };
      }
      let allowed = false;
      try {
        allowed = await this.authorizeAction({
          action,
          subject: context.subject ?? null,
          requestId: data.request_id ?? null,
          approval: context.approval ?? null
        }) === true;
      } catch {
        allowed = false;
      }
      if (!allowed) {
        this.failedAttempts += 1;
        return {
          status: "UNAUTHORIZED_TOOL_CALL",
          message: "Independent server-side authorization failed."
        };
      }
    }

    return {
      status: "PASS",
      executed_action: action,
      sanitized_data: payload,
      request_id: data.request_id ?? null,
      side_effects_performed: false
    };
  }
}
