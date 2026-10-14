/**
 * Super Chatty Central Agent v1
 * Owner-authenticated coordinator with optional Gemini and Workers AI providers.
 * Secrets are read only from Worker bindings and are never returned.
 */
import { describePolicy } from "./policy.mjs";

const VERSION = "1.2.0";
const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

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
    "access-control-max-age": "600",
    "vary": "Origin"
  };
}

async function runGemini(message, env) {
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "You are Super Chatty Central Agent, a coordinator for the Super Chatty Jarvis project. You may plan and propose work, but cannot execute tools, spawn child agents, change files, create keys, or deploy. Never claim an action or integration succeeded unless verified. Never ask the user to paste secrets into chat." }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: { maxOutputTokens: 700, temperature: 0.3 }
    })
  });
  if (!response.ok) throw new Error("Gemini provider request failed");
  const data = await response.json();
  const answer = (data.candidates || []).flatMap(c => c.content?.parts || []).map(p => p.text || "").join("").trim();
  if (!answer) throw new Error("Gemini returned no text");
  return { answer, model };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "super-chatty-central-agent",
        version: VERSION,
        capabilities: {
          workersAIConfigured: Boolean(env.AI),
          geminiConfigured: Boolean(env.GEMINI_API_KEY),
          ownerAuthentication: Boolean(env.OWNER_API_KEY),
          policyEndpoint: true,
          durableTaskQueue: false,
          childAgentExecution: false,
          externalToolExecution: false,
          selfGrantedPermissions: false
        }
      }, 200, cors);
    }

    if (!env.OWNER_API_KEY) return json({ error: "Owner authentication is not configured." }, 503, cors);
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401, cors);

    if (url.pathname === "/policy" && request.method === "GET") {
      return json({ policy: describePolicy() }, 200, cors);
    }

    if (url.pathname === "/agents" && request.method === "GET") {
      return json({
        leader: "super-chatty-central-agent",
        agents: [
          { id: "research", status: "planned", permissions: ["read-only research"], ownerApprovalRequiredToActivate: true },
          { id: "development", status: "planned", permissions: ["propose code changes"], ownerApprovalRequiredToActivate: true },
          { id: "integration", status: "planned", permissions: ["propose integrations"], ownerApprovalRequiredToActivate: true },
          { id: "testing", status: "planned", permissions: ["run configured tests"], ownerApprovalRequiredToActivate: true }
        ],
        note: "Role catalogue only. No child agents are running or can be spawned by this endpoint. Activation and side effects require explicit, scoped owner approval and a separately tested executor."
      }, 200, cors);
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Expected JSON body." }, 400, cors); }
      const message = typeof body.message === "string" ? body.message.trim() : "";
      const provider = body.provider === undefined ? "workers-ai" : body.provider;
      if (!message || message.length > 8000) return json({ error: "message must contain 1–8000 characters." }, 400, cors);
      if (provider !== "workers-ai" && provider !== "gemini") return json({ error: "provider must be workers-ai or gemini." }, 400, cors);

      try {
        if (provider === "gemini") {
          if (!env.GEMINI_API_KEY) return json({ error: "Gemini is not configured. Add GEMINI_API_KEY as a Worker secret." }, 503, cors);
          const result = await runGemini(message, env);
          return json({ ok: true, answer: result.answer, provider: "gemini", model: result.model }, 200, cors);
        }
        if (!env.AI) return json({ error: "Workers AI binding is not configured." }, 503, cors);
        const result = await env.AI.run(env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL, {
          messages: [
            {
              role: "system",
              content: "You are Super Chatty Central Agent, a coordinator for the Super Chatty Jarvis project. Never bypass or expand the owner's permissions. Never self-grant permissions. You may plan and propose work, but this endpoint cannot execute tools, spawn child agents, change files, connect providers, create API keys, or deploy. Every external side effect requires explicit, action-scoped owner approval through a separately implemented executor. Never claim an action, integration, test, or deployment succeeded unless verified. Never ask the user to paste secrets into chat."
            },
            { role: "user", content: message }
          ],
          max_tokens: 700
        });
        return json({ ok: true, answer: result?.response || result?.output_text || "The model returned no text.", provider: "workers-ai", model: env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL }, 200, cors);
      } catch {
        return json({ error: "AI request failed. Check provider key, quota, network access, and model availability." }, 502, cors);
      }
    }

    if (url.pathname === "/tasks" && request.method === "POST") {
      return json({
        error: "Task persistence and approval-token consumption are not implemented; no task was queued.",
        requiredBeforeEnablement: ["durable queue binding", "single-use action-scoped owner approval", "audit log", "executor allowlist", "tests"]
      }, 503, cors);
    }

    if (url.pathname === "/results" && request.method === "GET") {
      return json({ error: "Task results are unavailable because the durable task queue is not configured." }, 503, cors);
    }

    return json({ error: "Not found" }, 404, cors);
  }
};
