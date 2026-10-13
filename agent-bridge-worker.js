/**
 * Super Chatty Jarvis — Unified Agent Relay (v1)
 *
 * Scope: authenticated data/task-message relay only.
 * This Worker does NOT execute tools, run deployments, access Gmail accounts,
 * or grant either model access to the other's private tools/conversations.
 *
 * Required secret: RELAY_SECRET (Cloudflare Worker secret binding)
 * Required binding: JARVIS_KV (KV namespace)
 * Optional vars: ALLOWED_ORIGINS, AUTHORIZED_EMAIL_SENDERS
 *
 * Production note: KV is eventually consistent and does not provide atomic
 * queue claiming. Use Cloudflare Queues + a Durable Object or D1 for reliable
 * delivery, deduplication, leases, and concurrent workers.
 */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const MAX_BODY_BYTES = 32 * 1024;
const MAX_DATA_BYTES = 16 * 1024;
const MAX_POLL_ITEMS = 50;
const ALLOWED_TYPES = new Set(["DATA_SYNC", "TASK_COMMAND", "TOOL_EXECUTION", "EMAIL_TASK"]);
const ALLOWED_STATUS = new Set(["DONE", "FAILED"]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!origin || allowed.includes(origin)) {
    return {
      ...(origin && allowed.includes(origin) ? { "access-control-allow-origin": origin, "vary": "Origin" } : {}),
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, X-Jarvis-Auth, Authorization",
      "access-control-max-age": "600"
    };
  }
  return null;
}

function isAuthorized(request, env) {
  const expected = env.RELAY_SECRET;
  if (typeof expected !== "string" || expected.length < 32) return false;
  const x = request.headers.get("X-Jarvis-Auth") || "";
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // Exact comparison only; never accept a substring or a default credential.
  return x === expected || bearer === expected;
}

async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > MAX_BODY_BYTES) throw new Error("Request body too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("Request body too large");
  try { return JSON.parse(text); } catch { throw new Error("Invalid JSON body"); }
}

function validAgent(value) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_-]{1,39}$/.test(value);
}

function makeId(prefix = "payload") {
  return prefix + "_" + crypto.randomUUID();
}

function originForBody(body, defaultValue) {
  return validAgent(body?.recipient) ? body.recipient : defaultValue;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (!cors) return json({ error: "Origin not allowed" }, 403);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ status: "ONLINE", service: "Super Chatty Jarvis Agent Relay", version: "relay-v1", authenticated: false }, 200, cors);
    }

    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401, cors);
    }
    if (!env.JARVIS_KV) return json({ error: "Storage binding JARVIS_KV is not configured" }, 503, cors);

    if (request.method === "POST" && url.pathname === "/relay/publish") {
      try {
        const body = await readJson(request);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "JSON object required" }, 400, cors);
        const type = ALLOWED_TYPES.has(body.type) ? body.type : "DATA_SYNC";
        const data = body.data ?? {};
        const dataText = JSON.stringify(data);
        if (new TextEncoder().encode(dataText).byteLength > MAX_DATA_BYTES) return json({ error: "data payload too large" }, 413, cors);

        const record = {
          id: makeId(),
          sender: validAgent(body.sender) ? body.sender : "UNSPECIFIED_AGENT",
          recipient: body.recipient === "ALL" ? "ALL" : originForBody(body, "CHATGPT_DEPLOYER"),
          type,
          toolName: typeof body.toolName === "string" ? body.toolName.slice(0, 80) : null,
          data,
          status: "QUEUED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await env.JARVIS_KV.put(record.id, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 7 });
        return json({ success: true, payloadId: record.id, status: record.status, note: "Queued only; no tool was executed." }, 201, cors);
      } catch (error) {
        return json({ error: error.message || "Could not publish payload" }, 400, cors);
      }
    }

    if (request.method === "GET" && url.pathname === "/relay/poll") {
      const recipient = url.searchParams.get("agent") || "CHATGPT_DEPLOYER";
      if (recipient !== "ALL" && !validAgent(recipient)) return json({ error: "Invalid agent name" }, 400, cors);
      const requested = Number(url.searchParams.get("limit") || "20");
      const limit = Number.isFinite(requested) ? Math.max(1, Math.min(MAX_POLL_ITEMS, Math.floor(requested))) : 20;
      try {
        const page = await env.JARVIS_KV.list({ prefix: "payload_", limit: 100 });
        const items = [];
        for (const key of page.keys) {
          if (items.length >= limit) break;
          const raw = await env.JARVIS_KV.get(key.name);
          if (!raw) continue;
          try {
            const item = JSON.parse(raw);
            if ((item.recipient === recipient || item.recipient === "ALL") && item.status === "QUEUED") items.push(item);
          } catch { /* ignore malformed legacy records */ }
        }
        return json({ success: true, count: items.length, items, truncated: Boolean(page.list_complete === false || page.cursor) }, 200, cors);
      } catch {
        return json({ error: "Unable to read relay queue" }, 503, cors);
      }
    }

    if (request.method === "POST" && url.pathname === "/relay/ack") {
      try {
        const body = await readJson(request);
        if (typeof body.payloadId !== "string" || !/^payload_[a-f0-9-]{36}$/.test(body.payloadId)) {
          return json({ error: "Invalid payloadId" }, 400, cors);
        }
        if (!ALLOWED_STATUS.has(body.status)) return json({ error: "status must be DONE or FAILED" }, 400, cors);
        const raw = await env.JARVIS_KV.get(body.payloadId);
        if (!raw) return json({ error: "Payload not found" }, 404, cors);
        const record = JSON.parse(raw);
        if (record.status !== "QUEUED") return json({ error: "Payload already acknowledged", status: record.status }, 409, cors);
        record.status = body.status;
        record.updatedAt = new Date().toISOString();
        record.resultSummary = typeof body.resultSummary === "string" ? body.resultSummary.slice(0, 1000) : "";
        await env.JARVIS_KV.put(record.id, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 7 });
        return json({ success: true, payloadId: record.id, status: record.status, note: "Acknowledgement is best-effort; KV does not provide atomic queue claims." }, 200, cors);
      } catch (error) {
        return json({ error: error.message || "Unable to acknowledge payload" }, 400, cors);
      }
    }

    return json({ error: "Route not found" }, 404, cors);
  },

  async email(message, env, ctx) {
    // Configure exact addresses in AUTHORIZED_EMAIL_SENDERS, e.g. "owner@example.com".
    // A subject tag alone is not authentication. Never execute instructions from email.
    const allowed = (env.AUTHORIZED_EMAIL_SENDERS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const sender = String(message.from || "").trim().toLowerCase();
    if (!allowed.length || !allowed.includes(sender)) {
      console.log("Skipped email from non-allowlisted sender");
      return;
    }
    if (!env.JARVIS_KV) {
      console.log("Email relay skipped: JARVIS_KV binding is missing");
      return;
    }
    try {
      const subject = String(message.headers.get("subject") || "").slice(0, 200);
      const rawBody = await new Response(message.raw).text();
      const emailPayload = {
        id: makeId("email"),
        sender: "EMAIL_INGESTION",
        recipient: "ALL",
        type: "EMAIL_TASK",
        data: {
          from: sender,
          subject,
          contentSnippet: rawBody.slice(0, 1500),
          requiresHumanApproval: true,
          instructionsAreUntrusted: true
        },
        status: "QUEUED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await env.JARVIS_KV.put(emailPayload.id, JSON.stringify(emailPayload), { expirationTtl: 60 * 60 * 24 * 7 });
      console.log("Email task queued for review");
    } catch {
      console.log("Email ingestion failed");
      throw new Error("Email ingestion failed");
    }
  }
};
