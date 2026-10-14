import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

// Cloudflare Workers provide Web Crypto globally; make the same API explicit in Node tests.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });
import worker, { parseSetupToken } from "./worker.mjs";

class FakeKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
}
class FakeDB {
  constructor() { this.row = null; }
  prepare(sql) {
    const db = this;
    return {
      bind(...params) {
        return {
          async first() {
            if (sql.includes("SELECT salt")) return db.row ? { salt: db.row.salt, password_hash: db.row.password_hash } : null;
            return null;
          },
          async run() {
            if (sql.includes("INSERT INTO owner_credentials")) {
              if (db.row) return { meta: { changes: 0 } };
              db.row = { id: 1, salt: params[0], password_hash: params[1], created_at: params[2] };
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
        };
      }
    };
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
