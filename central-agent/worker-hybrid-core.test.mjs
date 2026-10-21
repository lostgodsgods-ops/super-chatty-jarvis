import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });
import worker from "./worker.mjs";

const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
async function tokenHash(token) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}
class FakeKV {
  async get() { return null; }
  async put() { return undefined; }
}
class FakeDB {
  constructor(session = null) { this.session = session; }
  prepare(sql) {
    const db = this;
    return {
      run: async () => ({ success: true, meta: { changes: 1 } }),
      bind(...values) {
        return {
          run: async () => ({ success: true, meta: { changes: 1 } }),
          first: async () => sql.includes("SELECT status, expires_at FROM owner_sessions") &&
            db.session?.token_hash === values[0]
            ? { status: db.session.status, expires_at: db.session.expires_at }
            : null,
          all: async () => ({ results: [] })
        };
      }
    };
  }
}
function request(path, { token, body } = {}) {
  return new Request("https://example.test" + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {})
    },
    body: JSON.stringify(body ?? {})
  });
}
function env(DB) { return { DB, SESSIONS: new FakeKV() }; }

test("hybrid execution rejects callers without an owner session", async () => {
  const response = await worker.fetch(request("/api/hybrid/execute", {
    body: { task: "summarize", text: "owner-only" }
  }), env(new FakeDB()));
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.notEqual(payload.ok, true);
});

test("hybrid execution rejects unsupported tasks before contacting Python", async () => {
  const token = "valid-owner-session-for-hybrid-test";
  const DB = new FakeDB({ token_hash: await tokenHash(token), status: "active", expires_at: Date.now() + 60_000 });
  const response = await worker.fetch(request("/api/hybrid/execute", {
    token, body: { task: "execute_shell", text: "whoami" }
  }), env(DB));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "HYBRID_TASK_NOT_ALLOWED");
});
