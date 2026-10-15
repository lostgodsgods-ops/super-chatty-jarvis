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
    if (request.method === "GET" && path === "/manifest.webmanifest") {
      return new Response(JSON.stringify({ id: "/app", name: "Super Chatty Jarvis", short_name: "Super Chatty", description: "Voice-first owner-controlled AI assistant", start_url: "/app", scope: "/", display: "standalone", background_color: "#07111f", theme_color: "#07111f", orientation: "portrait", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }] }), { status: 200, headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" } });
    }
    if (request.method === "GET" && path === "/icon.svg") {
      const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#07111f"/><circle cx="256" cy="256" r="174" fill="#0c3b61" stroke="#35d8ff" stroke-width="14"/><path d="M256 110 292 220 402 256 292 292 256 402 220 292 110 256 220 220Z" fill="#35d8ff"/><circle cx="256" cy="256" r="38" fill="#eef7ff"/></svg>';
      return new Response(icon, { status: 200, headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
    }
    if (request.method === "GET" && path === "/service-worker.js") {
      const source = "const CACHE=\"scj-pwa-v2\";\nself.addEventListener(\"install\",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([\"/download\",\"/manifest.webmanifest\",\"/icon.svg\"])).then(()=>self.skipWaiting())));\nself.addEventListener(\"activate\",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(\"scj-pwa-\")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));\nself.addEventListener(\"fetch\",event=>{const request=event.request;const url=new URL(request.url);if(request.method!==\"GET\"||url.origin!==self.location.origin||url.pathname.startsWith(\"/api/\")||url.pathname.startsWith(\"/auth/\")||url.pathname.startsWith(\"/passkey/\")||url.pathname===\"/owner\"||url.pathname.startsWith(\"/tasks\")||url.pathname.startsWith(\"/results\")||url.pathname===\"/memory\"||url.pathname===\"/audit\")return;if(url.pathname===\"/app\"&&request.mode===\"navigate\"){event.respondWith(fetch(request).then(async response=>{if(response.status===200&&response.headers.get(\"content-type\")?.includes(\"text/html\")){const cache=await caches.open(CACHE);await cache.put(request,response.clone());}return response;}).catch(async()=>{const cached=await caches.match(request);if(cached)return cached;const install=await caches.match(\"/download\");return install||Response.error();}));return;}event.respondWith(fetch(request).catch(()=>caches.match(request).then(hit=>hit||(request.mode===\"navigate\"?caches.match(\"/download\"):undefined)).then(hit=>hit||Response.error())));});"
      return new Response(source, { status: 200, headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache", "service-worker-allowed": "/", "x-content-type-options": "nosniff" } });
    }
    if (request.method === "GET" && (path === "/download" || path === "/app/install")) {
      const html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"theme-color\" content=\"#07111f\"><link rel=\"manifest\" href=\"/manifest.webmanifest\"><link rel=\"icon\" href=\"/icon.svg\" type=\"image/svg+xml\"><title>Install Super Chatty Jarvis</title><style>body{margin:0;padding:24px;background:#07111f;color:#eef7ff;font:16px/1.6 system-ui,sans-serif}main{max-width:520px;margin:6vh auto;padding:24px;border:1px solid #24506c;border-radius:18px;background:#0d1b2d}a,button{color:#fff}button,a.btn{display:inline-block;padding:12px 16px;border-radius:10px;border:1px solid #24506c;background:#145b9b;text-decoration:none;font:inherit;font-weight:700;margin:8px 8px 8px 0}small{color:#a8bfd4}</style></head><body><main><h1>Install Super Chatty Jarvis</h1><p>Install the mobile PWA from your browser when supported. Sign in with your Owner passkey to use the protected voice app.</p><button id=\"install\" hidden>Install app</button><a class=\"btn\" href=\"/app\">Open Super Chatty</a><p id=\"status\" role=\"status\">If Install is unavailable, open your browser menu and choose “Install app” or “Add to Home screen”.</p><p><small>This is an installable web app, not a signed native APK. The protected assistant and AI features require a network connection.</small></p></main><script>let deferred;const b=document.getElementById(\"install\"),s=document.getElementById(\"status\");if(\"serviceWorker\" in navigator)navigator.serviceWorker.register(\"/service-worker.js\").catch(()=>{});window.addEventListener(\"beforeinstallprompt\",e=>{e.preventDefault();deferred=e;b.hidden=false;s.textContent=\"Ready to install.\";});b.addEventListener(\"click\",async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice;deferred=null;b.hidden=true;});window.addEventListener(\"appinstalled\",()=>{s.textContent=\"Super Chatty Jarvis was installed.\";});</script></body></html>";
      return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; manifest-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
    }
    if (request.method === "GET" && path === "/owner") return new Response(OWNER_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } });
    if (request.method === "GET" && path === "/app") {
      const session = await getOwnerSession(request, env);
      if (!session) return Response.redirect(new URL("/owner", request.url).toString(), 303);
      const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; media-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
      return new Response(APP_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "content-security-policy": csp } });
    }
    try {
      const safeReadRoute = request.method === "GET" && ["/auth/status", "/tasks", "/results", "/memory", "/audit"].includes(path);
      const serviceResultRoute = request.method === "POST" && ["/results", "/tasks/claim"].includes(path);
      if (!safeReadRoute && !serviceResultRoute) requireAllowedOrigin(request, env);
      if (!["GET", "POST", "DELETE"].includes(request.method)) return json({ error: "Not found" }, 404, headers);
      const bootstrapRoute = request.method === "POST" && (path === "/passkey/register/options" || path === "/passkey/register/verify");
      const ownerRoute = (request.method === "POST" && (path === "/passkey/login/options" || path === "/passkey/login/verify" || path === "/auth/logout" || path === "/api/chat" || path === "/api/tts")) || (request.method === "GET" && path === "/auth/status") || isModuleRoute(request.method, path);
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
      else if (request.method === "POST" && path === "/api/tts") {
        const session = await getOwnerSession(request, env);
        if (!session) response = json({ error: "Owner authentication required" }, 401);
        else {
          const body = await readJson(request);
          const text = typeof body?.text === "string" ? body.text.trim() : "";
          const language = body?.language;
          const voiceProfile = body?.voiceProfile || "standard";
          if (!text || text.length > 1200) response = json({ error: "Text must contain 1-1200 characters" }, 400);
          else if (!["hi-IN", "en-IN", "en-US"].includes(language)) response = json({ error: "Unsupported language" }, 400);
          else if (!["standard", "male", "female", "child", "senior"].includes(voiceProfile)) response = json({ error: "Unsupported voice profile" }, 400);
          else if (env.CHAT_API_ENABLED !== "true" || !env.AI || typeof env.AI.run !== "function") response = json({ error: "AI speech is not configured", code: "TTS_NOT_CONFIGURED" }, 503);
          else {
            try {
              let result;
              if (language === "hi-IN") result = await env.AI.run("@cf/myshell-ai/melotts", { prompt: text, lang: "hi" });
              else {
                const speaker = voiceProfile === "male" ? "orion" : "asteria";
                result = await env.AI.run("@cf/deepgram/aura-1", { text, speaker });
              }
              let audio = result && typeof result === "object" && "audio" in result ? result.audio : result;
              let bytes;
              if (audio instanceof ReadableStream) response = new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
              else {
                if (audio instanceof ArrayBuffer) bytes = new Uint8Array(audio);
                else if (ArrayBuffer.isView(audio)) bytes = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
                else if (typeof audio === "string") {
                  const encoded = audio.replace(/^data:audio\/[^;]+;base64,/i, "");
                  try { const binary = atob(encoded); bytes = Uint8Array.from(binary, c => c.charCodeAt(0)); } catch { bytes = null; }
                }
                if (bytes && bytes.byteLength) response = new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
                else response = json({ error: "AI speech returned no audio", code: "TTS_EMPTY_AUDIO" }, 502);
              }
            } catch { response = json({ error: "AI speech temporarily unavailable", code: "TTS_PROVIDER_UNAVAILABLE" }, 502); }
          }
        }
      }
      else if (request.method === "POST" && path === "/api/chat") {
        const session = await getOwnerSession(request, env);
        if (!session) response = json({ error: "Owner authentication required" }, 401);
        else {
          const body = await readJson(request);
          if (typeof body?.message !== "string" || !body.message.trim() || body.message.length > 8000) response = json({ error: "Message must contain 1-8000 characters" }, 400);
          else if (!["hi-IN", "en-IN", "en-US"].includes(body.language)) response = json({ error: "Unsupported language" }, 400);
          else if (env.CHAT_API_ENABLED === "false" || !env.AI || typeof env.AI.run !== "function") {
            response = json({ error: "Chat provider is not configured in staging", code: "CHAT_PROVIDER_NOT_CONFIGURED" }, 503);
          } else {
            const defaultModel = "@cf/meta/llama-3.1-8b-instruct";
            const fallbackModels = [
              defaultModel,
              "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
              "@cf/meta/llama-4-scout-17b-16e-instruct",
            ];
            const configuredModel = typeof env.CHAT_MODEL === "string" && env.CHAT_MODEL.trim()
              ? env.CHAT_MODEL.trim()
              : defaultModel;
            const models = [...new Set([configuredModel, ...fallbackModels])];
            const systemPrompt = "You are Super Chatty Jarvis. Reply in the user's selected language (" + body.language + "). Be helpful, concise, and honest. Never claim you performed external actions or accessed accounts unless the system actually did so. Ask for explicit Owner approval before sensitive actions.";
            const input = {
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: body.message.trim() },
              ],
              max_tokens: 500,
              temperature: 0.4,
            };
            const readReply = (result) => typeof result?.response === "string"
              ? result.response.trim()
              : typeof result?.choices?.[0]?.message?.content === "string"
                ? result.choices[0].message.content.trim()
                : typeof result?.result?.response === "string"
                  ? result.result.response.trim()
                  : "";
            let reply = "";
            let usedModel = "";
            let lastFailure = "AI_PROVIDER_UNAVAILABLE";
            for (const model of models) {
              try {
                const result = await env.AI.run(model, input);
                reply = readReply(result);
                if (reply) {
                  usedModel = model;
                  break;
                }
                lastFailure = "AI_PROVIDER_EMPTY_RESPONSE";
                console.warn("SCJ_CHAT_PROVIDER_EMPTY_RESPONSE", { model, inputMode: "messages" });
              } catch (error) {
                lastFailure = "AI_PROVIDER_UNAVAILABLE";
                console.error("SCJ_CHAT_PROVIDER_ATTEMPT_FAILED", {
                  model,
                  inputMode: "messages",
                  errorName: typeof error?.name === "string" ? error.name : "Error",
                });
              }
            }
            // Some model/runtime combinations accept prompt input more reliably than chat messages.
            // Try the same known-good model set once more with prompt input before returning an error.
            if (!reply) {
              const prompt = systemPrompt + "\n\nUser: " + body.message.trim() + "\n\nAssistant:";
              for (const model of models) {
                try {
                  const result = await env.AI.run(model, { prompt, max_tokens: 500, temperature: 0.4 });
                  reply = readReply(result);
                  if (reply) {
                    usedModel = model;
                    break;
                  }
                  lastFailure = "AI_PROVIDER_EMPTY_RESPONSE";
                  console.warn("SCJ_CHAT_PROVIDER_EMPTY_RESPONSE", { model, inputMode: "prompt" });
                } catch (error) {
                  lastFailure = "AI_PROVIDER_UNAVAILABLE";
                  console.error("SCJ_CHAT_PROVIDER_ATTEMPT_FAILED", {
                    model,
                    inputMode: "prompt",
                    errorName: typeof error?.name === "string" ? error.name : "Error",
                  });
                }
              }
            }
            response = reply
              ? json({ ok: true, reply, model: usedModel })
              : json({
                  error: lastFailure === "AI_PROVIDER_EMPTY_RESPONSE"
                    ? "AI provider returned no reply"
                    : "AI provider temporarily unavailable",
                  code: lastFailure,
                }, 502);
          }
        }
      }
      else {
        const moduleResponse = isModuleRoute(request.method, path)
          ? await handleModuleRoute(request, env, path, request.method === "POST" && ["/results", "/tasks/claim", "/tasks/execute"].includes(path) ? null : await getOwnerSession(request, env))
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
