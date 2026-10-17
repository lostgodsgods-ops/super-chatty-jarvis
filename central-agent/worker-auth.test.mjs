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
  constructor({ session = null, challenge = null, passkey = null } = {}) {
    this.session = session;
    this.challenge = challenge;
    this.passkey = passkey;
  }
  prepare(sql) {
    const db = this;
    return {
      run: async () => ({ success: true, meta: { changes: 1 } }),
      bind(...values) {
        return {
          run: async () => ({ success: true, meta: { changes: 1 } }),
          first: async () => {
            if (sql.includes("SELECT status, expires_at FROM owner_sessions")) {
              return db.session && db.session.token_hash === values[0]
                ? { status: db.session.status, expires_at: db.session.expires_at }
                : null;
            }
            if (sql.includes("DELETE FROM owner_webauthn_challenges") && sql.includes("RETURNING challenge")) {
              const [challenge, purpose, now, sessionHash] = values;
              const row = db.challenge;
              if (row && row.challenge === challenge && row.purpose === purpose &&
                  row.expires_at > now && row.session_hash === sessionHash) {
                db.challenge = null;
                return { challenge: row.challenge };
              }
              return null;
            }
            if (sql.includes("SELECT credential_id, public_key_json, sign_count FROM owner_passkeys")) {
              return db.passkey && db.passkey.credential_id === values[0] ? db.passkey : null;
            }
            return null;
          },
          all: async () => ({ results: [] })
        };
      }
    };
  }
}
function env(DB) { return { DB, SESSIONS: new FakeKV() }; }
function request(path, { method = "GET", headers = {}, body } = {}) {
  return new Request("https://example.test" + path, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test("GET /auth/session rejects missing credentials with 401", async () => {
  const response = await worker.fetch(request("/auth/session"), env(new FakeDB()));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).authenticated, undefined);
});

test("GET /auth/session rejects an unknown/non-owner token with 401", async () => {
  const response = await worker.fetch(request("/auth/session", {
    headers: { authorization: "Bearer not-a-valid-owner-session" }
  }), env(new FakeDB()));
  assert.equal(response.status, 401);
});

test("GET /auth/session accepts a valid active owner session", async () => {
  const token = "valid-owner-session-token";
  const DB = new FakeDB({
    session: { token_hash: await tokenHash(token), status: "active", expires_at: Date.now() + 60_000 }
  });
  const response = await worker.fetch(request("/auth/session", {
    headers: { authorization: "Bearer " + token }
  }), env(DB));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).authenticated, true);
});

test("a reused WebAuthn login challenge is rejected with 401", async () => {
  const challenge = "server-issued-single-use-challenge";
  const DB = new FakeDB({
    challenge: {
      challenge, purpose: "login", session_hash: "https://example.test",
      expires_at: Date.now() + 60_000
    }
  });
  const makeRequest = () => request("/auth/passkey/login/verify", {
    method: "POST",
    headers: { origin: "https://example.test" },
    body: { rawId: "credential-that-is-not-registered", challenge, type: "public-key" }
  });
  const first = await worker.fetch(makeRequest(), env(DB));
  assert.equal(first.status, 401, "first request consumes the challenge then fails unknown credential");
  const replay = await worker.fetch(makeRequest(), env(DB));
  assert.equal(replay.status, 401, "the consumed challenge cannot be used a second time");
});

test("a missing WebAuthn signature is rejected with 401", async () => {
  const challenge = "server-issued-challenge-for-missing-signature";
  const DB = new FakeDB({
    challenge: {
      challenge, purpose: "login", session_hash: "https://example.test",
      expires_at: Date.now() + 60_000
    },
    passkey: {
      credential_id: "registered-credential",
      public_key_json: JSON.stringify({ kty: "EC", crv: "P-256", x: "AA", y: "AA" }),
      sign_count: 0
    }
  });
  const response = await worker.fetch(request("/auth/passkey/login/verify", {
    method: "POST",
    headers: { origin: "https://example.test" },
    body: {
      rawId: "registered-credential", challenge, type: "public-key",
      response: { clientDataJSON: "e30", authenticatorData: "e30" }
    }
  }), env(DB));
  assert.equal(response.status, 401);
});
