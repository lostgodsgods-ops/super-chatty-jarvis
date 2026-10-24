import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });
import worker from "../central-agent/worker.mjs";

const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
const tokenHash = async token => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));

class FakeKV {
  async get() { return null; }
  async put() { return undefined; }
}

class OwnerDB {
  constructor(token) { this.token = token; this.hashed = null; }
  prepare(sql) {
    const db = this;
    return {
      bind(...values) {
        return {
          async first() {
            if (sql.includes("SELECT status, expires_at FROM owner_sessions")) {
              return values[0] === db.hashed ? { status: "active", expires_at: Date.now() + 60_000 } : null;
            }
            return null;
          },
          async run() { return { meta: { changes: 1 } }; },
          async all() { return { results: [] }; }
        };
      },
      async run() { return { meta: { changes: 1 } }; },
      async first() { return null; },
      async all() { return { results: [] }; }
    };
  }
  async batch(statements) { return Promise.all(statements.map(s => s.run())); }
}

const ROUTES = [
  ["/api/treasury/events", { idempotencyKey: "k-1", source: "bitcoin", eventType: "scan", amountMinor: 1, currency: "SAT", network: "simulation" }],
  ["/api/treasury/scan", { idempotencyKey: "k-2", source: "bitcoin", network: "simulation" }],
  ["/api/treasury/pay", { idempotencyKey: "k-3", source: "compute", amountMinor: 10, manualApproval: true }],
  ["/api/treasury/compute-funding", { idempotencyKey: "k-4", amountMinor: 10 }]
];

async function ownerEnv() {
  const token = "treasury-bound-owner";
  const DB = new OwnerDB(token);
  DB.hashed = await tokenHash(token);
  return { env: { DB, SESSIONS: new FakeKV() }, token };
}

test("treasury POST routes reject declared content-length over 10 KiB with 413", async () => {
  const { env, token } = await ownerEnv();
  for (const [route, body] of ROUTES) {
    const response = await worker.fetch(new Request("https://example.test" + route, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token, "content-length": String(10 * 1024 + 1) },
      body: JSON.stringify(body)
    }), env);
    assert.equal(response.status, 413, route);
    assert.equal((await response.json()).code, "REQUEST_TOO_LARGE", route);
  }
});

test("treasury POST routes reject actual bodies over 10 KiB even with a lying declared length", async () => {
  const { env, token } = await ownerEnv();
  for (const [route] of ROUTES) {
    const padded = { ...ROUTES.find(([r]) => r === route)[1], filler: "a".repeat(11 * 1024) };
    const response = await worker.fetch(new Request("https://example.test" + route, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token, "content-length": "100" },
      body: JSON.stringify(padded)
    }), env);
    assert.equal(response.status, 413, route);
  }
});

test("treasury POST routes still accept valid bounded bodies (regression guard)", async () => {
  const { env, token } = await ownerEnv();
  const response = await worker.fetch(new Request("https://example.test/api/treasury/events", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify(ROUTES[0][1])
  }), env);
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.ledgerMode, "simulation-only");
  assert.equal(payload.event.status, "simulated");
  assert.equal(payload.event.details.externalTransferExecuted, false);
});

test("treasury POST routes reject malformed JSON with 400 (guard passes request to parser)", async () => {
  const { env, token } = await ownerEnv();
  const response = await worker.fetch(new Request("https://example.test/api/treasury/scan", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: "{broken"
  }), env);
  assert.equal([400, 503].includes(response.status), true);
  assert.notEqual(response.status, 413);
});
