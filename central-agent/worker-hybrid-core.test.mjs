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


test("universal tool registry status is owner-session gated", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/tools/registry", { method: "GET" }), env(new FakeDB()));
  assert.equal(response.status, 401);
});

test("universal tool registry reports binding presence without exposing secret values", async () => {
  const token = "valid-owner-session-for-registry-test";
  const DB = new FakeDB({ token_hash: await tokenHash(token), status: "active", expires_at: Date.now() + 60_000 });
  const response = await worker.fetch(new Request("https://example.test/api/tools/registry", {
    headers: { authorization: "Bearer " + token }
  }), { ...env(DB), OPENAI_API_KEY: "never-return-this" });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  const openai = payload.providers.find(provider => provider.id === "openai");
  assert.equal(openai.status, "configured_not_verified");
  assert.equal(openai.liveVerified, false);
  assert.equal(JSON.stringify(payload).includes("never-return-this"), false);
});


test("treasury endpoints reject requests without an owner session", async () => {
  for (const path of ["/api/treasury/events", "/api/treasury/scan", "/api/treasury/pay", "/api/treasury/compute-funding"]) {
    const response = await worker.fetch(new Request("https://example.test" + path, {
      method: path.endsWith("/events") ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      ...(path.endsWith("/events") ? {} : { body: JSON.stringify({}) })
    }), env(new FakeDB()));
    assert.equal(response.status, 401, path);
    assert.equal((await response.json()).code, "OWNER_SESSION_REQUIRED", path);
  }
});

test("treasury payment endpoint records only a bounded simulation intent", async () => {
  const token = "valid-owner-session-for-treasury-test";
  const DB = new FakeDB({ token_hash: await tokenHash(token), status: "active", expires_at: Date.now() + 60_000 });
  const response = await worker.fetch(request("/api/treasury/pay", {
    token,
    body: {
      idempotencyKey: "manual-pay-1", source: "web3", eventType: "payment_intent",
      amountMinor: 100, currency: "TOKEN_MINOR", network: "sepolia",
      contractAddress: "0x1234567890123456789012345678901234567890", manualApproval: true
    }
  }), env(DB));
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.ledgerMode, "simulation-only");
  assert.equal(payload.externalTransferExecuted, false);
  assert.equal(payload.event.details.livePaymentsEnabled, false);
});

test("treasury payment endpoint denies a request that asks for a live transfer", async () => {
  const token = "valid-owner-session-for-live-denial";
  const DB = new FakeDB({ token_hash: await tokenHash(token), status: "active", expires_at: Date.now() + 60_000 });
  const response = await worker.fetch(request("/api/treasury/pay", {
    token,
    body: {
      idempotencyKey: "manual-pay-live", source: "web3", eventType: "payment_intent",
      amountMinor: 100, currency: "TOKEN_MINOR", network: "sepolia",
      contractAddress: "0x1234567890123456789012345678901234567890",
      manualApproval: true, livePayment: true
    }
  }), env(DB));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "TREASURY_LIVE_TRANSFERS_DISABLED");
});

test("quantum endpoint is owner-session gated and rejects malformed jobs", async () => {
  const denied = await worker.fetch(request("/api/quantum/execute", {
    body: { job: { qubits: 2, shots: 10, algorithm: "qaoa" }, fallback: { task: "summarize", text: "test" } }
  }), env(new FakeDB()));
  assert.equal(denied.status, 401);

  const token = "valid-owner-session-for-quantum-test";
  const DB = new FakeDB({ token_hash: await tokenHash(token), status: "active", expires_at: Date.now() + 60_000 });
  const invalid = await worker.fetch(request("/api/quantum/execute", { token, body: { job: {}, fallback: { text: "test" } } }), env(DB));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "QUANTUM_QUBIT_LIMIT_EXCEEDED");
});
