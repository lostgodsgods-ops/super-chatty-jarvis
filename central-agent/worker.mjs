/**
 * Super Chatty Central Agent v1.3.0
 * Owner-defined password setup, PBKDF2 password hashing, and expiring sessions.
 * No Gemini integration. Secrets are read only from Worker bindings.
 */
import { describePolicy } from "./policy.mjs";

const VERSION = "1.3.0";
const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const PASSWORD_ITERATIONS = 210000;
const SESSION_TTL_SECONDS = 3600;

export function parseSetupToken(hash) {
  if (typeof hash !== "string" || !hash.startsWith("#")) return "";
  try { return new URLSearchParams(hash.slice(1)).get("setup") || ""; }
  catch { return ""; }
}

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

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function derivePasswordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: fromBase64url(salt),
    iterations: PASSWORD_ITERATIONS,
    hash: "SHA-256"
  }, key, 256);
  return base64url(new Uint8Array(bits));
}

async function getCredentials(env) {
  if (!env.DB) return null;
  return env.DB.prepare("SELECT salt, password_hash FROM owner_credentials WHERE id = 1").first();
}

async function authorized(request, env) {
  if (!env.SESSIONS) return false;
  const header = request.headers.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supplied || supplied.length > 256) return false;
  const key = "session:" + await sha256Hex(supplied);
  return (await env.SESSIONS.get(key)) === "active";
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

function ownerPage() {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#07111f"><title>Super Chatty — Owner Access</title>
<style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#07111f;color:#e8f2ff}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(ellipse at top,#12304a,#07111f 60%)}main{width:min(100%,440px);padding:24px;border:1px solid #25465f;border-radius:22px;background:#0b1928;box-shadow:0 20px 70px #0006}h1{font-size:1.5rem;margin:0 0 8px}p{color:#a9bfd2;line-height:1.5}.tag{color:#55e0d0;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase}label{display:block;margin:16px 0 7px;font-size:.92rem}input{width:100%;padding:14px;border-radius:12px;border:1px solid #35546b;background:#06111d;color:#fff;font:inherit}button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:12px;background:#55e0d0;color:#06202a;font:700 1rem system-ui;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.status{margin-top:16px;padding:12px;border-radius:10px;background:#102638;overflow-wrap:anywhere}.hidden{display:none}.hint{font-size:.84rem}
</style></head><body><main><div class="tag">Super Chatty Jarvis</div><h1>Owner Access</h1><p>Set a password only you know, then use it to sign in. Your password is stored as a salted PBKDF2 hash, not as readable text. Sessions expire after one hour.</p>
<section id="setup"><h2>Set your password</h2><p class="hint">Use at least 12 characters. This one-time setup page must be opened using your private setup link.</p>
<form id="setupForm"><label for="setupTokenInput">One-time setup token</label><input id="setupTokenInput" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="setupTokenHelp" required><p id="setupTokenHelp" class="hint">Paste the token from Cloudflare here, or open your private setup link. The token is never displayed.</p><label for="password">Choose password</label><input id="password" type="password" minlength="12" maxlength="256" autocomplete="new-password" required><label for="confirm">Confirm password</label><input id="confirm" type="password" minlength="12" maxlength="256" autocomplete="new-password" required><button id="setupButton" type="submit">Save Password</button></form></section>
<section id="login" class="hidden"><h2>Owner login</h2><form id="loginForm"><label for="loginPassword">Password</label><input id="loginPassword" type="password" autocomplete="current-password" required><button type="submit">Sign in</button></form></section>
<div id="status" class="status" role="status" aria-live="polite">Checking setup status…</div></main>
<script>
const statusBox=document.getElementById("status");
const setupSection=document.getElementById("setup");
const loginSection=document.getElementById("login");
const setupTokenInput=document.getElementById("setupTokenInput");
const initialSetupToken=new URLSearchParams(location.hash.slice(1)).get("setup")||"";
if(initialSetupToken) setupTokenInput.value=initialSetupToken;
history.replaceState(null,"",location.pathname);
function say(message){statusBox.textContent=message}
async function send(path,data){const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});const payload=await response.json().catch(()=>({error:"Unexpected server response"}));if(!response.ok)throw new Error(payload.error||"Request failed");return payload}
(async()=>{try{const response=await fetch("/auth/status",{cache:"no-store"});const info=await response.json();if(!response.ok)throw new Error(info.error||"Unable to check setup");if(info.setupRequired){setupSection.classList.remove("hidden");loginSection.classList.add("hidden");if(!setupTokenInput.value){say("Paste your one-time setup token above, or open the private setup link.");}else say("Choose a password you will remember.");}else{setupSection.classList.add("hidden");loginSection.classList.remove("hidden");say("Owner password is set. Sign in to continue.");}}catch(error){say(error.message)}})();
document.getElementById("setupForm").addEventListener("submit",async event=>{event.preventDefault();const password=document.getElementById("password").value;const confirm=document.getElementById("confirm").value;if(password!==confirm){say("Passwords do not match.");return}if(password.length<12){say("Use at least 12 characters.");return}const setupToken=setupTokenInput.value;if(!setupToken){say("Enter your one-time setup token.");return}try{await send("/auth/setup",{setupToken,password});setupTokenInput.value="";setupSection.classList.add("hidden");loginSection.classList.remove("hidden");document.getElementById("password").value="";document.getElementById("confirm").value="";say("Password saved securely. Sign in with your new password.");}catch(error){say(error.message)}});
document.getElementById("loginForm").addEventListener("submit",async event=>{event.preventDefault();try{const result=await send("/auth/login",{password:document.getElementById("loginPassword").value});sessionStorage.setItem("superChattyOwnerSession",result.token);document.getElementById("loginPassword").value="";say("Signed in. Owner session saved for this browser tab for up to one hour. You can now use this session with protected API requests.");}catch(error){say(error.message)}});
</script></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/owner" && request.method === "GET") return ownerPage();

    if (url.pathname === "/health" && request.method === "GET") {
      let passwordConfigured = false;
      try { passwordConfigured = Boolean(await getCredentials(env)); } catch {}
      return json({
        ok: true,
        service: "super-chatty-central-agent",
        version: VERSION,
        capabilities: {
          workersAIConfigured: Boolean(env.AI),
          passwordAuthentication: Boolean(env.DB && env.SESSIONS),
          ownerAuthentication: passwordConfigured,
          policyEndpoint: true,
          durableTaskQueue: false,
          childAgentExecution: false,
          externalToolExecution: false,
          selfGrantedPermissions: false
        }
      }, 200, cors);
    }

    if (url.pathname === "/auth/status" && request.method === "GET") {
      if (!env.DB) return json({ error: "Owner credential storage is not configured." }, 503, cors);
      try {
        const credentials = await getCredentials(env);
        return json({ setupRequired: !credentials }, 200, cors);
      } catch {
        return json({ error: "Owner credential storage is unavailable." }, 503, cors);
      }
    }

    if (url.pathname === "/auth/setup" && request.method === "POST") {
      if (!env.DB || !env.OWNER_SETUP_TOKEN) return json({ error: "Owner setup is not configured. Ask the project owner to finish the private setup configuration." }, 503, cors);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Expected JSON body." }, 400, cors); }
      const setupToken = typeof body.setupToken === "string" ? body.setupToken : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!equalSecret(setupToken, env.OWNER_SETUP_TOKEN)) return json({ error: "Invalid or expired setup link." }, 403, cors);
      if (password.length < 12 || password.length > 256) return json({ error: "Password must contain 12–256 characters." }, 400, cors);
      try {
        if (await getCredentials(env)) return json({ error: "Owner password is already set. Setup can only be completed once." }, 409, cors);
        const saltBytes = crypto.getRandomValues(new Uint8Array(16));
        const salt = base64url(saltBytes);
        const passwordHash = await derivePasswordHash(password, salt);
        const inserted = await env.DB.prepare("INSERT INTO owner_credentials (id, salt, password_hash, created_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
          .bind(salt, passwordHash, new Date().toISOString()).run();
        if (!inserted?.meta || inserted.meta.changes !== 1) return json({ error: "Owner password is already set. Setup can only be completed once." }, 409, cors);
        return json({ ok: true, message: "Owner password saved securely." }, 201, cors);
      } catch (error) {
        // Log the runtime/SQL exception and stack for diagnosis. Never log request bodies,
        // setup tokens, passwords, salts, or password hashes.
        console.error("owner_setup_failed", error);
        return json({ error: "Unable to save owner password securely." }, 503, cors);
      }
    }

    if (url.pathname === "/auth/login" && request.method === "POST") {
      if (!env.DB || !env.SESSIONS) return json({ error: "Owner authentication storage is not configured." }, 503, cors);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Expected JSON body." }, 400, cors); }
      const password = typeof body.password === "string" ? body.password : "";
      try {
        const credentials = await getCredentials(env);
        if (!credentials) return json({ error: "Owner password has not been set." }, 409, cors);
        const candidate = await derivePasswordHash(password, credentials.salt);
        if (!equalSecret(candidate, credentials.password_hash)) return json({ error: "Invalid password." }, 401, cors);
        const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
        await env.SESSIONS.put("session:" + await sha256Hex(token), "active", { expirationTtl: SESSION_TTL_SECONDS });
        return json({ ok: true, token, expiresIn: SESSION_TTL_SECONDS }, 200, cors);
      } catch {
        return json({ error: "Owner login is temporarily unavailable." }, 503, cors);
      }
    }

    if (!env.DB || !env.SESSIONS) return json({ error: "Owner authentication storage is not configured." }, 503, cors);
    if (!(await authorized(request, env))) return json({ error: "Unauthorized. Sign in with your Owner password." }, 401, cors);

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
      if (!message || message.length > 8000) return json({ error: "message must contain 1–8000 characters." }, 400, cors);
      try {
        if (!env.AI) return json({ error: "Workers AI binding is not configured." }, 503, cors);
        const result = await env.AI.run(env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL, {
          messages: [
            { role: "system", content: "You are Super Chatty Central Agent, a coordinator for the Super Chatty Jarvis project. Never bypass or expand the owner's permissions. Never self-grant permissions. You may plan and propose work, but this endpoint cannot execute tools, spawn child agents, change files, connect providers, create API keys, or deploy. Every external side effect requires explicit, action-scoped owner approval through a separately implemented executor. Never claim an action, integration, test, or deployment succeeded unless verified. Never ask the user to paste secrets into chat." },
            { role: "user", content: message }
          ],
          max_tokens: 700
        });
        return json({ ok: true, answer: result?.response || result?.output_text || "The model returned no text.", provider: "workers-ai", model: env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL }, 200, cors);
      } catch {
        return json({ error: "AI request failed. Check provider quota, network access, and model availability." }, 502, cors);
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

    if (url.pathname === "/auth/logout" && request.method === "POST") {
      const header = request.headers.get("authorization") || "";
      const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (supplied) await env.SESSIONS.delete("session:" + await sha256Hex(supplied));
      return json({ ok: true }, 200, cors);
    }

    return json({ error: "Not found" }, 404, cors);
  }
};
