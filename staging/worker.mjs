import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

const CHALLENGE_TTL_SECONDS = 300;
const SESSION_TTL_SECONDS = 3600;
const OWNER_ID = 1;

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
      "access-control-allow-methods": "GET, POST, OPTIONS",
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
  return await request.json();
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
  return json({ authenticated: true, token, expiresIn: SESSION_TTL_SECONDS, authMethod: "webauthn-passkey" });
}

async function authStatus(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ authenticated: false }, 401);
  const session = await env.SESSIONS.get(`owner-session:${await hash(token)}`);
  if (!session) return json({ authenticated: false }, 401);
  return json({ authenticated: true, session: JSON.parse(session) });
}

async function logout(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token) await env.SESSIONS.delete(`owner-session:${await hash(token)}`);
  return json({ loggedOut: true });
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
    try {
      requireAllowedOrigin(request, env);
      if (request.method !== "POST" && !(request.method === "GET" && path === "/auth/status")) return json({ error: "Not found" }, 404, headers);
      let response;
      if (request.method === "POST" && path === "/passkey/register/options") response = await registerOptions(request, env);
      else if (request.method === "POST" && path === "/passkey/register/verify") response = await registerVerify(request, env);
      else if (request.method === "POST" && path === "/passkey/login/options") response = await loginOptions(request, env);
      else if (request.method === "POST" && path === "/passkey/login/verify") response = await loginVerify(request, env);
      else if (request.method === "GET" && path === "/auth/status") response = await authStatus(request, env);
      else if (request.method === "POST" && path === "/auth/logout") response = await logout(request, env);
      else response = json({ error: "Not found" }, 404);
      const merged = new Headers(response.headers);
      for (const [key, value] of Object.entries(headers)) merged.set(key, value);
      return new Response(response.body, { status: response.status, headers: merged });
    } catch (error) {
      // Never return exception internals or credential material to the client.
      return json({ error: "Request rejected" }, 400, headers);
    }
  },
};
