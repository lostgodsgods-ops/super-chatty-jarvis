import test from "node:test";
import assert from "node:assert/strict";
import worker from "../staging/worker.mjs";

test("staging Worker exposes a non-sensitive health response", async () => {
  const response = await worker.fetch(new Request("https://staging.example/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, component: "passkey-auth-staging", production: false });
});

test("staging Worker rejects cross-origin passkey API calls before touching the database", async () => {
  const request = new Request("https://staging.example/passkey/login/options", {
    method: "POST",
    headers: { Origin: "https://attacker.example", "content-type": "application/json" },
    body: "{}",
  });
  let dbTouched = false;
  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: "https://owner.example",
    DB: { prepare() { dbTouched = true; throw new Error("DB should not be reached"); } },
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Request rejected" });
  assert.equal(dbTouched, false, "cross-origin requests must be rejected before database access");
});

test("staging Worker rejects preflight from an unapproved origin", async () => {
  const request = new Request("https://staging.example/passkey/login/options", {
    method: "OPTIONS",
    headers: { Origin: "https://attacker.example" },
  });
  const response = await worker.fetch(request, { ALLOWED_ORIGIN: "https://owner.example" });
  assert.equal(response.status, 403);
});

test("Owner page is served with a restrictive same-origin policy and native passkey controls", async () => {
  const response = await worker.fetch(new Request("https://staging.example/owner"), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const html = await response.text();
  assert.match(html, /Set up this device's passkey/);
  assert.match(html, /Sign in with passkey/);
  assert.match(html, /navigator\.credentials\.create/);
  assert.match(html, /navigator\.credentials\.get/);
});

test("authenticated status never discloses internal session metadata", async () => {
  const request = new Request("https://staging.example/auth/status", {
    headers: { cookie: "scj_owner_session=test-session-token" },
  });
  const env = {
    AUTH_RATE_LIMITER: { async limit() { return { success: true }; } },
    SESSIONS: {
      async get() {
        return JSON.stringify({ ownerId: 1, credentialId: "private-credential-id", createdAt: "2026-10-14T00:00:00.000Z" });
      },
    },
  };
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
});

test("passkey verification rejects oversized JSON even without Content-Length", async () => {
  const body = JSON.stringify({ challengeId: "test", response: { id: "x", padding: "x".repeat(65_000) } });
  const request = new Request("https://staging.example/passkey/login/verify", {
    method: "POST",
    headers: { Origin: "https://owner.example", "content-type": "application/json" },
    body,
  });
  const response = await worker.fetch(request, { ALLOWED_ORIGIN: "https://owner.example", AUTH_RATE_LIMITER: { async limit() { return { success: true }; } } });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Request rejected" });
});

test("logout revokes a cookie-backed Owner session without a JavaScript bearer token", async () => {
  let deletedKey = "";
  const request = new Request("https://staging.example/auth/logout", {
    method: "POST",
    headers: { Origin: "https://owner.example", cookie: "scj_owner_session=test-session-token" },
    body: "{}",
  });
  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: "https://owner.example",
    AUTH_RATE_LIMITER: { async limit() { return { success: true }; } },
    SESSIONS: { async delete(key) { deletedKey = key; } },
  });
  assert.equal(response.status, 200);
  assert.match(deletedKey, /^owner-session:/);
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
});


test("legacy JavaScript bearer tokens are not accepted as Owner sessions", async () => {
  const request = new Request("https://staging.example/auth/status", {
    headers: { authorization: "Bearer legacy-token" },
  });
  const response = await worker.fetch(request, {
    AUTH_RATE_LIMITER: { async limit() { return { success: true }; } },
    SESSIONS: { async get() { return JSON.stringify({ ownerId: 1 }); } },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { authenticated: false });
});


test("Owner auth fails closed if its rate limiter binding is missing", async () => {
  const request = new Request("https://staging.example/passkey/login/options", {
    method: "POST",
    headers: { Origin: "https://owner.example", "content-type": "application/json" },
    body: "{}",
  });
  const response = await worker.fetch(request, { ALLOWED_ORIGIN: "https://owner.example" });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Authentication rate limiting unavailable" });
});

test("Owner auth rejects requests when the rate limiter reports a limit exceeded", async () => {
  const request = new Request("https://staging.example/passkey/login/options", {
    method: "POST",
    headers: { Origin: "https://owner.example", "CF-Connecting-IP": "192.0.2.10", "content-type": "application/json" },
    body: "{}",
  });
  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: "https://owner.example",
    AUTH_RATE_LIMITER: { async limit(input) { assert.equal(input.key, "192.0.2.10:/passkey/login/options"); return { success: false }; } },
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual(await response.json(), { error: "Rate limit exceeded" });
});


test("expired or revoked Owner sessions are rejected", async () => {
  const request = new Request("https://staging.example/auth/status", {
    headers: { cookie: "scj_owner_session=expired-token" },
  });
  const response = await worker.fetch(request, {
    AUTH_RATE_LIMITER: { async limit() { return { success: true }; } },
    SESSIONS: { async get() { return null; } },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("unknown passkey credentials cannot create an Owner session", async () => {
  const request = new Request("https://staging.example/passkey/login/verify", {
    method: "POST",
    headers: { Origin: "https://owner.example", "content-type": "application/json" },
    body: JSON.stringify({ challengeId: "challenge-1", response: { id: "unknown-credential" } }),
  });
  let sessionCreated = false;
  const env = {
    ALLOWED_ORIGIN: "https://owner.example",
    AUTH_RATE_LIMITER: { async limit() { return { success: true }; } },
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.startsWith("UPDATE webauthn_challenges")) return { challenge: "expected-challenge" };
                if (sql.startsWith("SELECT credential_id")) return null;
                throw new Error("Unexpected SQL query");
              },
            };
          },
        };
      },
    },
    SESSIONS: { async put() { sessionCreated = true; } },
  };
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unknown passkey credential" });
  assert.equal(sessionCreated, false);
});

test("a WebAuthn challenge can be claimed only once under concurrent login attempts", async () => {
  let consumed = false;
  const makeRequest = () => new Request("https://staging.example/passkey/login/verify", {
    method: "POST",
    headers: { Origin: "https://owner.example", "content-type": "application/json" },
    body: JSON.stringify({ challengeId: "shared-challenge", response: { id: "unknown-credential" } }),
  });
  const env = {
    ALLOWED_ORIGIN: "https://owner.example",
    AUTH_RATE_LIMITER: { async limit() { return { success: true }; } },
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.startsWith("UPDATE webauthn_challenges")) {
                  if (consumed) return null;
                  consumed = true;
                  return { challenge: "expected-challenge" };
                }
                if (sql.startsWith("SELECT credential_id")) return null;
                throw new Error("Unexpected SQL query");
              },
            };
          },
        };
      },
    },
    SESSIONS: { async put() { throw new Error("Unknown credential must never create a session"); } },
  };
  const responses = await Promise.all([worker.fetch(makeRequest(), env), worker.fetch(makeRequest(), env)]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(responses.filter((response) => response.status === 401).length, 1);
  assert.equal(responses.filter((response) => response.status === 400).length, 1);
  assert.ok(bodies.some((body) => body.error === "Unknown passkey credential"));
  assert.ok(bodies.some((body) => body.error === "Request rejected"));
});
