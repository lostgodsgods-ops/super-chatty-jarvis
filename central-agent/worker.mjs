/**
 * Super Chatty Central Agent v1
 * Minimal owner-authenticated AI gateway. No arbitrary tool execution.
 * Secrets are read only from Worker bindings and are never returned.
 */
const VERSION = "1.0.0";
const MODEL = "@cf/meta/llama-3.1-8b-instruct";

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

function equalSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function authorized(request, env) {
  const header = request.headers.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  return equalSecret(supplied, env.OWNER_API_KEY);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "super-chatty-central-agent",
        version: VERSION,
        capabilities: {
          aiChat: Boolean(env.AI),
          ownerAuthentication: Boolean(env.OWNER_API_KEY),
          durableTaskQueue: false,
          externalToolExecution: false
        }
      }, 200, cors);
    }

    if (!env.OWNER_API_KEY) {
      return json({ error: "Owner authentication is not configured." }, 503, cors);
    }
    if (!authorized(request, env)) {
      return json({ error: "Unauthorized" }, 401, cors);
    }

    if (url.pathname === "/agents" && request.method === "GET") {
      return json({
        leader: "super-chatty-central-agent",
        agents: [
          { id: "research", status: "planned", permissions: ["read-only research"] },
          { id: "development", status: "planned", permissions: ["propose code changes"] },
          { id: "integration", status: "planned", permissions: ["propose integrations"] },
          { id: "testing", status: "planned", permissions: ["run configured tests"] }
        ],
        note: "These are planned roles, not running agents. No child agent is granted execution permissions by this endpoint."
      }, 200, cors);
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      if (!env.AI) return json({ error: "Workers AI binding is not configured." }, 503, cors);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Expected JSON body." }, 400, cors); }
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message || message.length > 8000) {
        return json({ error: "message must contain 1–8000 characters." }, 400, cors);
      }

      try {
        const result = await env.AI.run(MODEL, {
          messages: [
            {
              role: "system",
              content: "You are Super Chatty Central Agent, a careful coordinator for the Super Chatty Jarvis project. Follow owner instructions only within configured permissions. Never claim an external action, API key creation, integration, test, or deployment succeeded unless a tool result proves it. Do not request secrets in chat. You cannot execute external tools from this endpoint."
            },
            { role: "user", content: message }
          ],
          max_tokens: 700
        });
        return json({ ok: true, answer: result?.response || result?.output_text || "The model returned no text.", model: MODEL }, 200, cors);
      } catch {
        return json({ error: "AI request failed. Check Workers AI access and model availability." }, 502, cors);
      }
    }

    if (url.pathname === "/tasks" && request.method === "POST") {
      return json({
        error: "Durable task queue is not configured yet.",
        nextStep: "Configure a Cloudflare KV namespace and add the JARVIS_KV binding before enabling task persistence."
      }, 503, cors);
    }

    if (url.pathname === "/results" && request.method === "GET") {
      return json({
        error: "Task results are unavailable because the durable task queue is not configured."
      }, 503, cors);
    }

    return json({ error: "Not found" }, 404, cors);
  }
};
