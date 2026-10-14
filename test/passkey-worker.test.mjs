import test from "node:test";
import assert from "node:assert/strict";
import worker from "../staging/worker.mjs";

test("staging Worker exposes a non-sensitive health response", async () => {
  const response = await worker.fetch(new Request("https://staging.example/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, component: "passkey-auth-staging", production: false });
});

test("staging Worker rejects cross-origin passkey API calls", async () => {
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
  assert.equal(dbTouched, false, "oversized body must be rejected before database access");
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
  const response = await worker.fetch(request, { ALLOWED_ORIGIN: "https://owner.example" });
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
    SESSIONS: { async get() { return JSON.stringify({ ownerId: 1 }); } },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { authenticated: false });
});
