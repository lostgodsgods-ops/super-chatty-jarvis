import test from "node:test";
import assert from "node:assert/strict";
import { runOwnerBootstrap } from "./bootstrap-owner.mjs";

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" }
});

test("owner bootstrap retries transient status and setup 503 responses before succeeding", async () => {
  const responses = [
    json({ error: "warming" }, 503),
    json({ setupRequired: true }),
    json({ error: "warming" }, 503),
    json({ ok: true }, 201)
  ];
  const calls = [];
  const delays = [];
  const result = await runOwnerBootstrap({
    base: "https://worker.example",
    setupToken: "test-setup-token",
    password: "test-only-password-not-for-production",
    fetchImpl: async (url, options = {}) => {
      calls.push({ path: new URL(url).pathname, options });
      return responses.shift();
    },
    sleep: async ms => delays.push(ms),
    log: () => {}
  });
  assert.deepEqual(result, { outcome: "created" });
  assert.deepEqual(calls.map(call => call.path), ["/auth/status", "/auth/status", "/auth/setup", "/auth/setup"]);
  assert.deepEqual(delays, [2000, 2000]);
  assert.equal(JSON.parse(calls[2].options.body).setupToken, "test-setup-token");
});

test("owner bootstrap stops immediately on non-transient setup-token rejection", async () => {
  let calls = 0;
  let delays = 0;
  await assert.rejects(runOwnerBootstrap({
    base: "https://worker.example",
    setupToken: "wrong-token",
    password: "test-only-password-not-for-production",
    fetchImpl: async url => {
      calls++;
      return new URL(url).pathname === "/auth/status"
        ? json({ setupRequired: true })
        : json({ error: "denied" }, 403);
    },
    sleep: async () => { delays++; },
    log: () => {}
  }), /HTTP 403/);
  assert.equal(calls, 2);
  assert.equal(delays, 0);
});

test("owner bootstrap skips setup only when the status endpoint verifies it is already configured", async () => {
  let calls = 0;
  const result = await runOwnerBootstrap({
    base: "https://worker.example",
    setupToken: "test-setup-token",
    password: "test-only-password-not-for-production",
    fetchImpl: async () => { calls++; return json({ setupRequired: false }); },
    sleep: async () => { throw new Error("sleep should not be called"); },
    log: () => {}
  });
  assert.deepEqual(result, { outcome: "already-configured" });
  assert.equal(calls, 1);
});

test("owner bootstrap fails closed after exhausting transient setup failures", async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(runOwnerBootstrap({
    base: "https://worker.example",
    setupToken: "test-setup-token",
    password: "test-only-password-not-for-production",
    maxAttempts: 3,
    fetchImpl: async url => {
      calls++;
      return new URL(url).pathname === "/auth/status"
        ? json({ setupRequired: true })
        : json({ error: "temporarily unavailable" }, 503);
    },
    sleep: async ms => delays.push(ms),
    log: () => {}
  }), /remained unavailable after 3 attempts/);
  assert.equal(calls, 4);
  assert.deepEqual(delays, [2000, 4000]);
});

test("owner bootstrap refuses to report success when the owner password is missing", async () => {
  let calls = 0;
  await assert.rejects(runOwnerBootstrap({
    base: "https://worker.example",
    setupToken: "test-setup-token",
    password: "",
    fetchImpl: async () => { calls++; return json({ setupRequired: false }); },
    log: () => {}
  }), /Missing CENTRAL_AGENT_OWNER_PASSWORD/);
  assert.equal(calls, 0);
});

test("owner bootstrap fails fast when Worker reports a persistent credential-save failure", async () => {
  let calls = 0;
  let delays = 0;
  await assert.rejects(runOwnerBootstrap({
    base: "https://worker.example",
    setupToken: "test-setup-token",
    password: "test-only-password-not-for-production",
    fetchImpl: async url => {
      calls++;
      return new URL(url).pathname === "/auth/status"
        ? json({ setupRequired: true })
        : json({ error: "Unable to save owner password securely." }, 503);
    },
    sleep: async () => { delays++; },
    log: () => {}
  }), /owner_setup_failed/);
  assert.equal(calls, 2);
  assert.equal(delays, 0);
});
