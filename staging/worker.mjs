import { APP_HTML } from "./app.mjs";
import { handleModuleRoute, isModuleRoute } from "./modules.mjs";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

const CHALLENGE_TTL_SECONDS = 300;
const SESSION_TTL_SECONDS = 3600;
const OWNER_ID = 1;

const OWNER_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#07111f"><title>Super Chatty Jarvis · Owner Passkey</title>
<style>
:root{color-scheme:dark;--bg:#07111f;--panel:#10243b;--line:#24506c;--text:#eef7ff;--muted:#a8bfd4;--cyan:#35d8ff;--blue:#245bd5}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 15% 0%,#102b4c,transparent 45%),var(--bg);color:var(--text);font:16px/1.55 system-ui,sans-serif;padding:22px}
main{max-width:520px;margin:6vh auto}.panel{background:#0d1b2d;border:1px solid var(--line);border-radius:18px;padding:22px}
h1{font-size:1.6rem;margin:0 0 8px}p{color:var(--muted)}label{display:block;margin:16px 0 6px}input{width:100%;padding:13px;border-radius:10px;border:1px solid var(--line);background:#07111f;color:var(--text)}button{width:100%;padding:13px;margin-top:12px;border-radius:10px;border:1px solid var(--line);background:linear-gradient(120deg,#087eb7,#235bd5);color:white;font-weight:750;font-size:1rem}button.secondary{background:#10243b}button:disabled{opacity:.5}#status{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:16px;min-height:48px;color:var(--cyan)}small{color:var(--muted)}
</style></head>
<body><main><section class="panel">
<h1>Super Chatty Jarvis</h1><p>Owner authentication · Passkey first · Password not required for this setup</p>
<label for="setupToken">One-time Owner setup token (only for first enrollment)</label>
<input id="setupToken" type="password" autocomplete="off" spellcheck="false" placeholder="Enter token privately">
<button id="enroll">Set up this device's passkey</button>
<button id="login" class="secondary">Sign in with passkey</button>
<button id="check" class="secondary">Check Owner session</button>
<button id="openApp" class="secondary">Open Voice-First Chatty</button>
<button id="logout" class="secondary">Lock / log out</button>
<div id="status" role="status" aria-live="polite">Ready. Use HTTPS and a browser that supports passkeys.</div>
<p><small>Fingerprint/face verification stays with the device's passkey provider. This page never receives biometric templates. Keep the setup token private; do not share it in chat.</small></p>
</section></main>
<script>
const el=(id)=>document.getElementById(id);
const say=(text)=>{el("status").textContent=text;};
const enc=(buf)=>{const bytes=new Uint8Array(buf);let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");};
const dec=(s)=>{const b=s.replace(/-/g,"+").replace(/_/g,"/");const raw=atob(b+"=".repeat((4-b.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer;};
const api=async(path,opts={})=>{const res=await fetch(path,{cache:"no-store",...opts,headers:{"content-type":"application/json",...(opts.headers||{})}});const data=await res.json().catch(()=>({error:"Invalid server response"}));if(!res.ok)throw new Error(data.error||("HTTP "+res.status));return data;};
const serialize=(cred,mode)=>{const r=cred.response;const response={clientDataJSON:enc(r.clientDataJSON)};if(mode==="register"){response.attestationObject=enc(r.attestationObject);response.transports=typeof r.getTransports==="function"?r.getTransports():[];}else{response.authenticatorData=enc(r.authenticatorData);response.signature=enc(r.signature);response.userHandle=r.userHandle?enc(r.userHandle):null;}return{id:cred.id,rawId:enc(cred.rawId),type:cred.type,response,clientExtensionResults:cred.getClientExtensionResults(),authenticatorAttachment:cred.authenticatorAttachment||null};};
const prepare=(options)=>{options.challenge=dec(options.challenge);if(options.user)options.user.id=dec(options.user.id);for(const key of ["excludeCredentials","allowCredentials"]){if(Array.isArray(options[key]))options[key]=options[key].map(c=>({...c,id:dec(c.id)}));}return options;};
el("enroll").addEventListener("click",async()=>{el("enroll").disabled=true;try{if(!window.PublicKeyCredential||!navigator.credentials)throw new Error("Passkeys are not supported in this browser.");const token=el("setupToken").value;if(!token)throw new Error("Enter the one-time setup token on this private page.");say("Requesting registration challenge…");const start=await api("/passkey/register/options",{method:"POST",headers:{"x-owner-setup-token":token},body:"{}"});const cred=await navigator.credentials.create({publicKey:prepare(start.options)});if(!cred)throw new Error("Passkey enrollment cancelled.");say("Verifying passkey registration…");const result=await api("/passkey/register/verify",{method:"POST",headers:{"x-owner-setup-token":token},body:JSON.stringify({challengeId:start.challengeId,response:serialize(cred,"register")})});el("setupToken").value="";say(result.message||"Passkey enrolled. Now sign in with passkey.");}catch(e){say("Enrollment not completed: "+e.message);}finally{el("enroll").disabled=false;}});
el("login").addEventListener("click",async()=>{el("login").disabled=true;try{if(!window.PublicKeyCredential||!navigator.credentials)throw new Error("Passkeys are not supported in this browser.");say("Requesting sign-in challenge…");const start=await api("/passkey/login/options",{method:"POST",body:"{}"});const cred=await navigator.credentials.get({publicKey:prepare(start.options)});if(!cred)throw new Error("Passkey sign-in cancelled.");say("Verifying signature and creating a short-lived session…");const result=await api("/passkey/login/verify",{method:"POST",body:JSON.stringify({challengeId:start.challengeId,response:serialize(cred,"login")})});say("Owner authenticated with passkey. Secure session expires in "+Math.round(result.expiresIn/60)+" minutes.");}catch(e){say("Sign-in not completed: "+e.message);}finally{el("login").disabled=false;}});
el("check").addEventListener("click",async()=>{try{const result=await api("/auth/status");say(result.authenticated?"Owner session is active.":"No active Owner session.");}catch(e){say("Session check: "+e.message);}});
el("logout").addEventListener("click",async()=>{try{await api("/auth/logout",{method:"POST",body:"{}"});}catch(e){}finally{say("Owner session revoked and browser cookie cleared.");}});
el("openApp").addEventListener("click",()=>{location.href="/app";});
</script></body></html>`;

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});

const b64url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromB64url = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const hash = async (value) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const randomToken = (bytes = 32) => {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return b64url(value);
};

function originHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && origin === env.ALLOWED_ORIGIN) {
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-owner-setup-token",
      "access-control-allow-credentials": "true",
      "vary": "Origin",
    };
  }
  return {};
}

function requireAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.ALLOWED_ORIGIN) throw new Error("Origin not allowed");
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("HTTPS origin required");
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > 64_000) throw new Error("Request too large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 64_000) throw new Error("Request too large");
  return JSON.parse(raw);
}

async function claimChallenge(env, challengeId, ceremony) {
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    "UPDATE webauthn_challenges SET consumed_at = ? WHERE id = ? AND ceremony = ? AND consumed_at IS NULL AND expires_at > ? RETURNING challenge"
  ).bind(now, challengeId, ceremony, now).first();
  if (!result?.challenge) throw new Error("Challenge missing, expired, or already used");
  return result.challenge;
}

async function credentialsCount(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM owner_passkey_credentials WHERE owner_id = ?").bind(OWNER_ID).first();
  return Number(row?.n || 0);
}

async function registerOptions(request, env) {
  if (!env.OWNER_SETUP_TOKEN || request.headers.get("x-owner-setup-token") !== env.OWNER_SETUP_TOKEN) {
    return json({ error: "Owner bootstrap authorization failed" }, 401);
  }
  if (await credentialsCount(env) !== 0) return json({ error: "Passkey already enrolled; additional enrollment requires an authenticated owner session" }, 409);

  const options = await generateRegistrationOptions({
    rpName: env.RP_NAME || "Super Chatty Jarvis",
    rpID: env.RP_ID,
    userID: new TextEncoder().encode("super-chatty-owner"),
    userName: "owner",
    userDisplayName: "Super Chatty Owner",
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    supportedAlgorithmIDs: [-7],
  });
  const challengeId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO webauthn_challenges (id, challenge, ceremony, expires_at, consumed_at) VALUES (?, ?, 'register', ?, NULL)"
  ).bind(challengeId, options.challenge, now + CHALLENGE_TTL_SECONDS).run();
  return json({ challengeId, options });
}

async function registerVerify(request, env) {
  if (!env.OWNER_SETUP_TOKEN || request.headers.get("x-owner-setup-token") !== env.OWNER_SETUP_TOKEN) {
    return json({ error: "Owner bootstrap authorization failed" }, 401);
  }
  if (await credentialsCount(env) !== 0) return json({ error: "Passkey already enrolled" }, 409);
  const body = await readJson(request);
  if (!body?.challengeId || !body?.response) return json({ error: "challengeId and response are required" }, 400);
  const expectedChallenge = await claimChallenge(env, body.challengeId, "register");
  const verification = await verifyRegistrationResponse({
    response: body.response,
    expectedChallenge,
    expectedOrigin: env.ALLOWED_ORIGIN,
    expectedRPID: env.RP_ID,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) return json({ error: "Passkey registration verification failed" }, 401);

  const credential = verification.registrationInfo.credential;
  const transports = Array.isArray(body.response?.response?.transports) ? body.response.response.transports : [];
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO owner_passkey_credentials (credential_id, owner_id, public_key_b64, sign_count, transports_json, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(credential.id, OWNER_ID, b64url(credential.publicKey), credential.counter, JSON.stringify(transports), now, now).run();
  return json({ verified: true, passkeyEnrolled: true, message: "Passkey enrolled. Biometric data remains on the device." });
}

async function loginOptions(request, env) {
  if (await credentialsCount(env) === 0) return json({ error: "No passkey enrolled yet" }, 409);
  const options = await generateAuthenticationOptions({
    rpID: env.RP_ID,
    userVerification: "required",
    allowCredentials: [],
  });
  const challengeId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO webauthn_challenges (id, challenge, ceremony, expires_at, consumed_at) VALUES (?, ?, 'login', ?, NULL)"
  ).bind(challengeId, options.challenge, now + CHALLENGE_TTL_SECONDS).run();
  return json({ challengeId, options });
}

async function loginVerify(request, env) {
  const body = await readJson(request);
  if (!body?.challengeId || !body?.response?.id) return json({ error: "challengeId and assertion response are required" }, 400);
  const expectedChallenge = await claimChallenge(env, body.challengeId, "login");
  const credential = await env.DB.prepare(
    "SELECT credential_id, public_key_b64, sign_count, transports_json FROM owner_passkey_credentials WHERE credential_id = ? AND owner_id = ?"
  ).bind(body.response.id, OWNER_ID).first();
  if (!credential) return json({ error: "Unknown passkey credential" }, 401);

  const transports = JSON.parse(credential.transports_json || "[]");
  const verification = await verifyAuthenticationResponse({
    response: body.response,
    expectedChallenge,
    expectedOrigin: env.ALLOWED_ORIGIN,
    expectedRPID: env.RP_ID,
    credential: {
      id: credential.credential_id,
      publicKey: fromB64url(credential.public_key_b64),
      counter: Number(credential.sign_count || 0),
      transports,
    },
    requireUserVerification: true,
  });
  if (!verification.verified) return json({ error: "Passkey assertion verification failed" }, 401);

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE owner_passkey_credentials SET sign_count = ?, last_used_at = ? WHERE credential_id = ?")
    .bind(verification.authenticationInfo.newCounter, now, credential.credential_id).run();

  const token = randomToken();
  const tokenHash = await hash(token);
  await env.SESSIONS.put(`owner-session:${tokenHash}`, JSON.stringify({ ownerId: OWNER_ID, credentialId: credential.credential_id, createdAt: now }), { expirationTtl: SESSION_TTL_SECONDS });
  return json({ authenticated: true, expiresIn: SESSION_TTL_SECONDS, authMethod: "webauthn-passkey" }, 200, {
    "set-cookie": `scj_owner_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`
  });
}

function sessionTokenFromRequest(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("scj_owner_session="));
  const cookieToken = match ? decodeURIComponent(match.slice("scj_owner_session=".length)) : "";
  const bearerToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return cookieToken;
}

async function getOwnerSession(request, env) {
  const token = sessionTokenFromRequest(request);
  if (!token) return null;
  const raw = await env.SESSIONS.get("owner-session:" + await hash(token));
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    return session?.ownerId === OWNER_ID ? session : null;
  } catch {
    return null;
  }
}

async function authStatus(request, env) {
  const session = await getOwnerSession(request, env);
  if (!session) return json({ authenticated: false }, 401);
  return json({ authenticated: true });
}

async function logout(request, env) {
  const token = sessionTokenFromRequest(request);
  if (token) await env.SESSIONS.delete(`owner-session:${await hash(token)}`);
  return json({ loggedOut: true }, 200, { "set-cookie": "scj_owner_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
}

export default {
  async fetch(request, env) {
    const headers = originHeaders(request, env);
    if (request.method === "OPTIONS") {
      if (!request.headers.get("Origin") || request.headers.get("Origin") !== env.ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers });
    }
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") return json({ ok: true, component: "passkey-auth-staging", production: false }, 200, headers);
    if (request.method === "GET" && path === "/owner") return new Response(OWNER_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } });
    if (request.method === "GET" && path === "/app") {
      const session = await getOwnerSession(request, env);
      if (!session) return Response.redirect(new URL("/owner", request.url).toString(), 303);
      const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
      return new Response(APP_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "content-security-policy": csp } });
    }
    try {
      const safeReadRoute = request.method === "GET" && ["/auth/status", "/tasks", "/results", "/memory", "/audit"].includes(path);
      const serviceResultRoute = request.method === "POST" && ["/results", "/tasks/claim"].includes(path);
      if (!safeReadRoute && !serviceResultRoute) requireAllowedOrigin(request, env);
      if (!["GET", "POST", "DELETE"].includes(request.method)) return json({ error: "Not found" }, 404, headers);
      const bootstrapRoute = request.method === "POST" && (path === "/passkey/register/options" || path === "/passkey/register/verify");
      const ownerRoute = (request.method === "POST" && (path === "/passkey/login/options" || path === "/passkey/login/verify" || path === "/auth/logout" || path === "/api/chat")) || (request.method === "GET" && path === "/auth/status") || isModuleRoute(request.method, path);
      if (bootstrapRoute || ownerRoute) {
        const limiter = bootstrapRoute ? env.BOOTSTRAP_RATE_LIMITER : env.AUTH_RATE_LIMITER;
        if (!limiter || typeof limiter.limit !== "function") return json({ error: "Authentication rate limiting unavailable" }, 503, headers);
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const rate = await limiter.limit({ key: `${ip}:${path}` });
        if (!rate?.success) return json({ error: "Rate limit exceeded" }, 429, { ...headers, "retry-after": "60" });
      }
      let response;
      if (request.method === "POST" && path === "/passkey/register/options") response = await registerOptions(request, env);
      else if (request.method === "POST" && path === "/passkey/register/verify") response = await registerVerify(request, env);
      else if (request.method === "POST" && path === "/passkey/login/options") response = await loginOptions(request, env);
      else if (request.method === "POST" && path === "/passkey/login/verify") response = await loginVerify(request, env);
      else if (request.method === "GET" && path === "/auth/status") response = await authStatus(request, env);
      else if (request.method === "POST" && path === "/auth/logout") response = await logout(request, env);
      else if (request.method === "POST" && path === "/api/chat") {
        const session = await getOwnerSession(request, env);
        if (!session) response = json({ error: "Owner authentication required" }, 401);
        else {
          const body = await readJson(request);
          if (typeof body?.message !== "string" || !body.message.trim() || body.message.length > 8000) response = json({ error: "Message must contain 1-8000 characters" }, 400);
          else if (!["hi-IN", "en-IN", "en-US"].includes(body.language)) response = json({ error: "Unsupported language" }, 400);
          else response = json({ error: "Chat provider is not configured in staging", code: "CHAT_PROVIDER_NOT_CONFIGURED" }, 503);
        }
      }
      else {
        const moduleResponse = isModuleRoute(request.method, path)
          ? await handleModuleRoute(request, env, path, request.method === "POST" && ["/results", "/tasks/claim"].includes(path) ? null : await getOwnerSession(request, env))
          : null;
        response = moduleResponse || json({ error: "Not found" }, 404);
      }
      const merged = new Headers(response.headers);
      for (const [key, value] of Object.entries(headers)) merged.set(key, value);
      return new Response(response.body, { status: response.status, headers: merged });
    } catch (error) {
      // Never return exception internals or credential material to the client.
      return json({ error: "Request rejected" }, 400, headers);
    }
  },
};
