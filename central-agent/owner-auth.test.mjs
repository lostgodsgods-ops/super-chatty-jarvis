import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";

// Cloudflare Workers provide Web Crypto globally; make the same API explicit in Node tests.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });
import worker, { parseSetupToken, PASSWORD_ITERATIONS } from "./worker.mjs";
import { base64url, fromBase64url } from "./webauthn.mjs";

class FakeKV {
  constructor() { this.values = new Map(); this.failSessionWritesOnly = false; this.failWebAuthnWrites = false; }
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { if ((this.failSessionWritesOnly && key.startsWith("session:")) || (this.failWebAuthnWrites && key.startsWith("webauthn:"))) throw new Error("KV daily write quota exhausted"); this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
  async list({ prefix = "" } = {}) {
    return { keys: [...this.values.keys()].filter(name => name.startsWith(prefix)).map(name => ({ name })) };
  }
}
class FakeDB {
  constructor() { this.row = null; this.passkeys = []; this.sessions = new Map(); this.webauthnChallenges = new Map(); this.recoveryCodes = new Map(); this.identity = null; }
  async batch(statements) { const snapshot = new Map(this.recoveryCodes); try { const results = []; for (const statement of statements) results.push(await statement.run()); return results; } catch (error) { this.recoveryCodes = snapshot; throw error; } }
  prepare(sql) {
    const db = this;
    const statement = {
      params: [],
      bind(...params) { this.params = params; return this; },
      async first() {
        if (sql.includes("SELECT owner_key, display_name FROM owner_identity")) return db.identity;
        if (sql.includes("SELECT salt")) return db.row ? { salt: db.row.salt, password_hash: db.row.password_hash } : null;
        if (sql.includes("SELECT status, expires_at FROM owner_sessions")) return db.sessions.get(this.params[0]) || null;
        if (sql.includes("SELECT challenge FROM owner_webauthn_challenges")) return [...db.webauthnChallenges.values()].find(row => row.session_hash === this.params[0] && row.purpose === this.params[1] && row.expires_at > this.params[2]) || null;
        if (sql.includes("DELETE FROM owner_webauthn_challenges") && sql.includes("RETURNING")) { const row = db.webauthnChallenges.get(this.params[0]); if (!row || row.purpose !== this.params[1] || row.expires_at <= this.params[2] || row.session_hash !== this.params[3]) return null; db.webauthnChallenges.delete(this.params[0]); return { challenge: row.challenge }; }
        if (sql.includes("UPDATE owner_recovery_codes") && sql.includes("RETURNING")) { const row = db.recoveryCodes.get(this.params[1]); if (!row || row.used_at !== null) return null; row.used_at = this.params[0]; return { code_hash: this.params[1] }; }
        if (sql.includes("SELECT code_hash FROM owner_recovery_codes")) { const row = db.recoveryCodes.get(this.params[0]); return row && row.used_at === null ? { code_hash: this.params[0] } : null; }
        return null;
      },
      async all() {
        if (sql.includes("SELECT credential_id FROM owner_passkeys")) {
          return { results: db.passkeys.map(item => ({ credential_id: item.credential_id })) };
        }
        return { results: [] };
      },
      async run() {
        if (sql.includes("INSERT OR IGNORE INTO owner_identity")) { if (!db.identity) db.identity = { owner_key: this.params[0], display_name: this.params[1] }; return { meta: { changes: 1 } }; }
        if (sql.includes("INSERT INTO owner_credentials")) {
          if (db.row) return { meta: { changes: 0 } };
          db.row = { id: 1, salt: this.params[0], password_hash: this.params[1], created_at: this.params[2] };
          return { meta: { changes: 1 } };
        }
        if (sql.includes("UPDATE owner_credentials")) {
          if (!db.row) return { meta: { changes: 0 } };
          db.row.salt = this.params[0];
          db.row.password_hash = this.params[1];
          return { meta: { changes: 1 } };
        }
        if (sql.includes("INSERT INTO owner_recovery_codes")) { db.recoveryCodes.set(this.params[0], { code_hash: this.params[0], created_at: this.params[1], used_at: null }); return { meta: { changes: 1 } }; }
        if (sql.includes("DELETE FROM owner_recovery_codes")) { if (sql.includes("NOT IN")) { const keep = new Set(this.params); for (const key of db.recoveryCodes.keys()) if (!keep.has(key)) db.recoveryCodes.delete(key); } else db.recoveryCodes.clear(); return { meta: { changes: 1 } }; }
        if (sql.includes("INSERT INTO owner_webauthn_challenges")) { db.webauthnChallenges.set(this.params[0], { challenge: this.params[0], purpose: this.params[1], session_hash: this.params[2], expires_at: this.params[3] }); return { meta: { changes: 1 } }; }
        if (sql.includes("DELETE FROM owner_webauthn_challenges")) { const found = [...db.webauthnChallenges.values()].find(row => row.challenge === this.params[0] && row.purpose === this.params[1] && row.expires_at > this.params[2] && (this.params[3] == null || row.session_hash === this.params[3])); if (found) db.webauthnChallenges.delete(found.challenge); return { meta: { changes: found ? 1 : 0 }, results: found ? [found] : [] }; }
        if (sql.includes("INSERT INTO owner_sessions")) {
          db.sessions.set(this.params[0], { token_hash: this.params[0], expires_at: this.params[1], status: sql.includes("'revoked'") ? "revoked" : "active" });
          return { meta: { changes: 1 } };
        }
        if (sql.includes("UPDATE owner_sessions SET status = 'revoked'")) { for (const row of db.sessions.values()) if (row.status === "active") row.status = "revoked"; return { meta: { changes: 1 } }; }
        if (sql.includes("DELETE FROM owner_sessions WHERE token_hash")) return { meta: { changes: db.sessions.delete(this.params[0]) ? 1 : 0 } };
        if (sql.includes("DELETE FROM owner_sessions")) { const changes = db.sessions.size; db.sessions.clear(); return { meta: { changes } }; }
        return { meta: { changes: 0 } };
      }
    };
    return statement;
  }
}
function env() {
  return { DB: new FakeDB(), SESSIONS: new FakeKV(), OWNER_SETUP_TOKEN: "test-bootstrap-code", ALLOWED_ORIGINS: "https://example.test" };
}
async function call(envObj, path, body, token) {
  return worker.fetch(new Request("https://central.example.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: "Bearer " + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), envObj);
}

test("WebAuthn base64url encoding is URL-safe and round-trips bytes", () => {
  const bytes = Uint8Array.from([251, 255, 255]);
  const encoded = base64url(bytes);
  assert.equal(encoded, "-___");
  assert.deepEqual([...fromBase64url(encoded)], [...bytes]);
});

test("owner setup requires the one-time setup token and a memorable but strong password", async () => {
  const e = env();
  const denied = await call(e, "/auth/setup", { setupToken: "wrong", password: "a-long-memorable-password" });
  assert.equal(denied.status, 403);
  const weak = await call(e, "/auth/setup", { setupToken: "test-bootstrap-code", password: "short" });
  assert.equal(weak.status, 400);
  const good = await call(e, "/auth/setup", { setupToken: "test-bootstrap-code", password: "a-long-memorable-password" });
  assert.equal(good.status, 201);
  assert.equal(e.DB.row.password_hash.includes("a-long-memorable-password"), false);
});

test("owner password can be used to log in, and login creates a session", async () => {
  const e = env();
  await call(e, "/auth/setup", { setupToken: "test-bootstrap-code", password: "a-long-memorable-password" });
  const bad = await call(e, "/auth/login", { password: "wrong-password" });
  assert.equal(bad.status, 401);
  const login = await call(e, "/auth/login", { password: "a-long-memorable-password" });
  assert.equal(login.status, 200);
  const payload = await login.json();
  assert.equal(typeof payload.token, "string");
  assert.ok(payload.token.length > 20);
});


test("owner login falls back to expiring D1 sessions when KV session writes hit the daily quota", async () => {
  const e = env();
  await call(e, "/auth/setup", { setupToken: "test-bootstrap-code", password: "a-long-memorable-password" });
  e.SESSIONS.failSessionWritesOnly = true;
  const login = await call(e, "/auth/login", { password: "a-long-memorable-password" });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.equal(e.DB.sessions.size, 1);
  assert.equal((await call(e, "/policy", undefined, token)).status, 200);
  const logout = await call(e, "/auth/logout", {}, token);
  assert.equal(logout.status, 200);
  assert.equal((await call(e, "/policy", undefined, token)).status, 401);
  assert.equal([...e.DB.sessions.values()][0]?.status, "revoked");
});

test("first-time setup is one-time and fails closed without storage or bootstrap token", async () => {
  const e = env();
  e.OWNER_SETUP_TOKEN = "";
  assert.equal((await call(e, "/auth/setup", { setupToken: "anything", password: "a-long-memorable-password" })).status, 503);
  e.OWNER_SETUP_TOKEN = "test-bootstrap-code";
  await call(e, "/auth/setup", { setupToken: "test-bootstrap-code", password: "a-long-memorable-password" });
  assert.equal((await call(e, "/auth/setup", { setupToken: "test-bootstrap-code", password: "another-long-memorable-password" })).status, 409);
});

test("protected endpoints reject requests without a valid owner session", async () => {
  const e = env();
  await call(e, "/auth/setup", { setupToken: "test-bootstrap-code", password: "a-long-memorable-password" });
  assert.equal((await call(e, "/policy")).status, 401);
  const login = await call(e, "/auth/login", { password: "a-long-memorable-password" });
  const { token } = await login.json();
  assert.equal((await call(e, "/policy", undefined, token)).status, 200);
});


test("setup token parser accepts URL-safe tokens and percent-encoded spaces", () => {
  assert.equal(parseSetupToken("#setup=abc123XYZ_-%"), "abc123XYZ_-%");
  assert.equal(parseSetupToken("#setup=alpha%20beta%20123"), "alpha beta 123");
  assert.equal(parseSetupToken("#other=abc123"), "");
});

test("owner page provides a manual setup-token field when the fragment is missing", async () => {
  const response = await call(env(), "/owner");
  const html = await response.text();
  assert.match(html, /id="setupTokenInput"/);
  assert.match(html, /new URLSearchParams\(location\.hash\.slice\(1\)\)/);
});


async function ownerToken(e) {
  await call(e, "/auth/setup", { setupToken: "test-bootstrap-code", password: "a-long-memorable-password" });
  const response = await call(e, "/auth/login", { password: "a-long-memorable-password" });
  return (await response.json()).token;
}

test("Tavily search requires an authenticated owner session", async () => {
  const e = env();
  e.SEARCH_API_KEY = "test-tavily-key";
  const response = await call(e, "/search", { query: "Cloudflare Workers" });
  assert.equal(response.status, 401);
});

test("Tavily search fails closed when the API key is not configured", async () => {
  const e = env();
  const token = await ownerToken(e);
  const response = await call(e, "/search", { query: "Cloudflare Workers" }, token);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "Search is not configured.");
});

test("Tavily search validates query and sends bounded requests with source URLs", async () => {
  const e = env();
  e.SEARCH_API_KEY = "test-tavily-key";
  const token = await ownerToken(e);
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestOptions = options;
    return new Response(JSON.stringify({ results: [
      { title: "Cloudflare docs", url: "https://developers.cloudflare.com/workers/", content: "Workers documentation", score: 0.98 },
      { title: "Invalid result", url: "javascript:alert(1)", content: "discard me" }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const bad = await call(e, "/search", { query: " " }, token);
    assert.equal(bad.status, 400);
    const tooLong = await call(e, "/search", { query: "x".repeat(401) }, token);
    assert.equal(tooLong.status, 400);
    const response = await call(e, "/search", { query: "Cloudflare Workers", searchDepth: "advanced" }, token);
    assert.equal(response.status, 200);
    assert.equal(requestedUrl, "https://api.tavily.com/search");
    assert.equal(requestOptions.method, "POST");
    assert.equal(requestOptions.headers.authorization, "Bearer test-tavily-key");
    const sent = JSON.parse(requestOptions.body);
    assert.equal(sent.query, "Cloudflare Workers");
    assert.equal(sent.search_depth, "advanced");
    assert.equal(sent.max_results, 5);
    assert.equal(sent.include_raw_content, false);
    const payload = await response.json();
    assert.equal(payload.provider, "tavily");
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].url, "https://developers.cloudflare.com/workers/");
    assert.equal(JSON.stringify(payload).includes("test-tavily-key"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Tavily provider errors return a generic error without leaking response body", async () => {
  const e = env();
  e.SEARCH_API_KEY = "test-tavily-key";
  const token = await ownerToken(e);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("private provider diagnostic", { status: 401 });
  try {
    const response = await call(e, "/search", { query: "test" }, token);
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.equal(body.includes("private provider diagnostic"), false);
    assert.equal(body.includes("test-tavily-key"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("logout is idempotent without a session and revokes an authenticated session", async () => {
  const e = env();
  const anonymousLogout = await call(e, "/auth/logout", {});
  assert.equal(anonymousLogout.status, 200);
  assert.deepEqual(await anonymousLogout.json(), { ok: true });
  assert.match(anonymousLogout.headers.get("set-cookie") || "", /Max-Age=0/);

  const token = await ownerToken(e);
  assert.equal((await call(e, "/auth/session", undefined, token)).status, 200);
  const logout = await call(e, "/auth/logout", {}, token);
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { ok: true });
  assert.equal((await call(e, "/auth/session", undefined, token)).status, 401);
});

test("owner session endpoint reports only the current bearer session", async () => {
  const e = env();
  const token = await ownerToken(e);
  const session = await call(e, "/auth/session", undefined, token);
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { ok: true, authenticated: true, expiresIn: 3600 });
  const denied = await call(e, "/auth/session");
  assert.equal(denied.status, 401);
});

test("owner can change password with the current password and old password stops working", async () => {
  const e = env();
  const token = await ownerToken(e);
  const changed = await call(e, "/auth/change-password", {
    currentPassword: "a-long-memorable-password",
    newPassword: "another-long-memorable-password"
  }, token);
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).ok, true);
  assert.equal((await call(e, "/auth/login", { password: "a-long-memorable-password" })).status, 401);
  assert.equal((await call(e, "/policy", undefined, token)).status, 401, "password change revokes the prior session");
  assert.equal((await call(e, "/auth/login", { password: "another-long-memorable-password" })).status, 200);
});

test("password change rejects weak or incorrect current passwords", async () => {
  const e = env();
  const token = await ownerToken(e);
  assert.equal((await call(e, "/auth/change-password", {
    currentPassword: "wrong-password", newPassword: "another-long-memorable-password"
  }, token)).status, 401);
  assert.equal((await call(e, "/auth/change-password", {
    currentPassword: "a-long-memorable-password", newPassword: "short"
  }, token)).status, 400);
});


test("owner login page does not persist passwords or session tokens in browser storage", async () => {
  const response = await call(env(), "/owner");
  const html = await response.text();
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
  assert.match(html, /let ownerSessionToken=""/);
});

test("PBKDF2 iteration count stays within the Cloudflare Workers Web Crypto limit", () => {
  assert.ok(PASSWORD_ITERATIONS <= 100000, "Cloudflare Workers rejects PBKDF2 iterations above 100000");
  assert.ok(PASSWORD_ITERATIONS >= 100000, "Use the highest iteration count supported by Cloudflare Workers");
});

test("owner-authenticated research query returns sourced evidence and rejects anonymous requests", async () => {
  const e = env();
  e.SEARCH_API_KEY = "test-search-key";
  await call(e, "/auth/setup", { setupToken: "test-bootstrap-code", password: "a-long-memorable-password" });
  const anonymous = await call(e, "/research/query", { query: "Kamala Hydro Electric Project 1720 MW CCEA" });
  assert.equal(anonymous.status, 401);

  const login = await call(e, "/auth/login", { password: "a-long-memorable-password" });
  const { token } = await login.json();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), "https://api.tavily.com/search");
    assert.equal(options.method, "POST");
    return new Response(JSON.stringify({ results: [
      { title: "Official CCEA release", url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2250042", content: "CCEA approved the 1720 MW Kamala Hydro Electric Project on 8 April 2026.", published_date: "2026-04-08" }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await call(e, "/research/query", { query: "Kamala Hydro Electric Project 1720 MW CCEA" }, token);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.sourceCount, 1);
    assert.equal(payload.sources[0].url, "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2250042");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authenticated research query retries upstream rate limits before returning evidence", async () => {
  const e = env();
  e.SEARCH_API_KEY = "test-search-key";
  await call(e, "/auth/setup", { setupToken: "test-bootstrap-code", password: "a-long-memorable-password" });
  const login = await call(e, "/auth/login", { password: "a-long-memorable-password" });
  const { token } = await login.json();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls < 3) return new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers: { "retry-after": "0", "content-type": "application/json" } });
    return new Response(JSON.stringify({ results: [
      { title: "Government source", url: "https://www.pib.gov.in/example", content: "Evidence excerpt" }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await call(e, "/research/query", { query: "Kamala 1720 MW CCEA" }, token);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 3);
    assert.equal(payload.sourceCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("password, passkey, and device-biometric option routes remain independently reachable", async () => {
  const e = env();
  e.DB.passkeys = [{ credential_id: "Y3JlZGVudGlhbA" }];
  const passkeyResponse = await call(e, "/auth/passkey/login/options", {});
  const biometricResponse = await call(e, "/auth/biometric/login/options", {});
  assert.equal(passkeyResponse.status, 200);
  assert.equal(biometricResponse.status, 200);
  const passkeyOptions = await passkeyResponse.json();
  const biometricOptions = await biometricResponse.json();
  assert.equal(passkeyOptions.userVerification, "required");
  assert.equal(biometricOptions.userVerification, "required");
  assert.deepEqual(passkeyOptions.allowCredentials, [], "discoverable passkeys should work across synced devices");
  assert.deepEqual(biometricOptions.allowCredentials, [], "device verification should use discoverable credentials");
  assert.ok([...e.DB.webauthnChallenges.values()].some(row => row.purpose === "login"));
  assert.ok([...e.DB.webauthnChallenges.values()].some(row => row.purpose === "biometric"));
});


test("owner page exposes independent password, passkey, and biometric sign-in tabs", async () => {
  const response = await call(env(), "/owner");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const id of ["passwordTab", "passkeyTab", "biometricTab", "passwordPanel", "passkeyPanel", "biometricPanel", "passkeyLoginButton", "biometricLoginButton", "registerPasskeyButton"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing owner auth control: " + id);
  }
  assert.ok(html.includes("/auth/passkey/login/options"));
  assert.ok(html.includes("/auth/biometric/login/options"));
  assert.ok(html.includes('function selectAuthTab(selected)'));
  assert.ok(html.includes('You can change your password here') || html.includes('Change your password here'));
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
});

test("owner page locks the in-memory session and revokes it when backgrounded", async () => {
  const response = await call(env(), "/owner");
  const html = await response.text();
  assert.ok(html.includes('document.addEventListener("visibilitychange"'));
  assert.ok(html.includes('document.addEventListener("freeze"'));
  assert.ok(html.includes('function lockOwnerPage(message)'));
  assert.ok(html.includes('keepalive:true'));
  assert.ok(html.includes('ownerSessionToken=""'));
});

test("PWA exposes the golden neural core, quick-chat drawer, cinematic viewer, and background lock", async () => {
  const html = await readFile(new URL("../jarvis/index.html", import.meta.url), "utf8");
  for (const id of ["coreWrap","quickChatToggle","quickChatDrawer","quickChatText","articleOpen","cinemaOverlay","cinemaStage","cinemaClose"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing immersive HUD control: " + id);
  }
  assert.ok(html.includes("lockOwnerOnBackground"));
  assert.ok(html.includes('sandbox="allow-forms allow-popups"'));
  assert.ok(html.includes('document.addEventListener("visibilitychange"'));
  const resumeStart = html.indexOf("async function resumeOwnerSession()");
  const resumeEnd = html.indexOf("function decodeB64url", resumeStart);
  const resumeBody = html.slice(resumeStart, resumeEnd);
  assert.ok(resumeBody.includes('method: "POST"'), "startup must revoke any cookie-backed session");
  assert.equal(resumeBody.includes('state.ownerToken = "cookie-session"'), false, "startup must not restore a cookie session");
});


test("owner chat endpoint requires authentication and returns a natural persona reply", async () => {
  const e = env();
  e.AI = {
    async run(model, input) {
      assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fast");
      assert.equal(input.messages[0].role, "system");
      assert.match(input.messages[0].content, /Loss Gods/);
      assert.equal(input.messages[1].content, "Namaste, Chatty");
      return { response: "Namaste, Loss Gods. I am ready." };
    }
  };
  const denied = await call(e, "/api/chat", { message: "Namaste, Chatty", language: "hi-IN" });
  assert.equal(denied.status, 401);
  const token = await ownerToken(e);
  const response = await call(e, "/api/chat", { message: "Namaste, Chatty", language: "hi-IN" }, token);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.reply, "Namaste, Loss Gods. I am ready.");
  assert.equal(payload.core.externalActionsPerformed, false);
});

test("owner chat endpoint validates empty and oversized messages and fails closed without AI", async () => {
  const e = env();
  const token = await ownerToken(e);
  assert.equal((await call(e, "/api/chat", { message: " " }, token)).status, 400);
  assert.equal((await call(e, "/api/chat", { message: "x".repeat(8001) }, token)).status, 400);
  const unavailable = await call(e, "/api/chat", { message: "Hello" }, token);
  assert.equal(unavailable.status, 503);
});


test("passkey login challenge creation survives exhausted KV writes by using D1", async () => {
  const e = env();
  e.DB.passkeys = [{ credential_id: "Y3JlZGVudGlhbA" }];
  e.SESSIONS.failWebAuthnWrites = true;
  const response = await call(e, "/auth/passkey/login/options", {});
  assert.equal(response.status, 200);
  const options = await response.json();
  assert.ok(options.challenge);
  const row = e.DB.webauthnChallenges.get(options.challenge);
  assert.equal(row?.purpose, "login");
  assert.ok(row?.expires_at > Date.now());
  assert.equal([...e.SESSIONS.values.keys()].some(key => key.startsWith("webauthn:login:")), false);
});

test("passkey registration uses the immutable Loss Gods owner label and a discoverable credential", async () => {
  const e = env();
  const token = await ownerToken(e);
  e.SESSIONS.failWebAuthnWrites = true;
  const response = await call(e, "/auth/passkey/register/options", {}, token);
  assert.equal(response.status, 200);
  const options = await response.json();
  assert.equal(options.user.name, "loss-gods");
  assert.equal(options.user.displayName, "Loss Gods");
  assert.equal(options.authenticatorSelection.residentKey, "required");
  assert.equal(options.authenticatorSelection.userVerification, "required");
  const row = [...e.DB.webauthnChallenges.values()].find(item => item.purpose === "register");
  assert.ok(row?.challenge === options.challenge);
  assert.ok(row?.session_hash);
});


test("owner recovery codes are one-time, hashed in D1, and can restore a session without password or email", async () => {
  const e = env();
  const token = await ownerToken(e);
  const issued = await call(e, "/auth/recovery/codes", {}, token);
  assert.equal(issued.status, 200);
  const payload = await issued.json();
  assert.equal(payload.codes.length, 8);
  assert.equal(e.DB.recoveryCodes.size, 8);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload.codes[0]));
  const codeHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  assert.ok(e.DB.recoveryCodes.has(codeHash), "D1 must store the hash of the issued recovery code");
  assert.equal([...e.DB.recoveryCodes.keys()].includes(payload.codes[0]), false, "raw recovery codes must not be stored");
  e.SESSIONS.failSessionWritesOnly = true;
  const login = await call(e, "/auth/recovery/login", { code: payload.codes[0] });
  assert.equal(login.status, 200, JSON.stringify(await login.clone().json()));
  const recovered = await login.json();
  assert.ok(recovered.token);
  assert.equal((await call(e, "/policy", undefined, recovered.token)).status, 200);
  const replay = await call(e, "/auth/recovery/login", { code: payload.codes[0] });
  assert.equal(replay.status, 401);
});

test("recovery-code rotation invalidates the previous unused set", async () => {
  const e = env();
  const token = await ownerToken(e);
  const first = await (await call(e, "/auth/recovery/codes", {}, token)).json();
  const second = await (await call(e, "/auth/recovery/codes", {}, token)).json();
  assert.equal(e.DB.recoveryCodes.size, 8);
  assert.equal((await call(e, "/auth/recovery/login", { code: first.codes[0] })).status, 401);
  const recovered = await call(e, "/auth/recovery/login", { code: second.codes[0] });
  assert.equal(recovered.status, 200, JSON.stringify(await recovered.clone().json()));
});


test("passkey challenge creation survives exhausted KV writes", async () => {
  const e = env();
  e.DB.passkeys = [{ credential_id: "Y3JlZGVudGlhbA" }];
  e.SESSIONS.failWebAuthnWrites = true;
  const options = await call(e, "/auth/passkey/login/options", {});
  assert.equal(options.status, 200);
  const login = await call(e, "/auth/recovery/login", { code: "A".repeat(48) });
  assert.notEqual(login.status, 503, "invalid codes should be rejected without requiring KV");
});


test("successful owner authentication seeds and validates the stable Loss Gods identity in D1", async () => {
  const e = env();
  await ownerToken(e);
  assert.deepEqual(e.DB.identity, { owner_key: "loss-gods", display_name: "Loss Gods" });
});


test("PWA exposes one-time recovery controls without persisting recovery codes or session tokens", async () => {
  const html = await readFile(new URL("../jarvis/index.html", import.meta.url), "utf8");
  for (const id of ["ownerRecoveryGenerate","ownerRecoveryCodes","ownerRecoveryInput","ownerRecoveryLogin"]) assert.ok(html.includes('id="' + id + '"'));
  assert.ok(html.includes('"/auth/recovery/login"'));
  assert.ok(html.includes('"/auth/recovery/codes"'));
  assert.ok(html.includes('els.ownerRecoveryCodes.textContent = "";'));
});
