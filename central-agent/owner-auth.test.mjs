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
  async list({ prefix = "" } = {}) {
    return { keys: [...this.values.keys()].filter(name => name.startsWith(prefix)).map(name => ({ name })) };
  }
}
class FakeDB {
  constructor() { this.row = null; }
  prepare(sql) {
    const db = this;
    const statement = {
      params: [],
      bind(...params) { this.params = params; return this; },
      async first() {
        if (sql.includes("SELECT salt")) return db.row ? { salt: db.row.salt, password_hash: db.row.password_hash } : null;
        return null;
      },
      async run() {
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
