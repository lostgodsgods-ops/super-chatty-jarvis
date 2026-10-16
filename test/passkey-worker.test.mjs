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
  const response = await worker.fetch(request, { ALLOWED_ORIGIN: "https://owner.example" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Request rejected" });
});

test("staging Worker rejects preflight from an unapproved origin", async () => {
  const request = new Request("https://staging.example/passkey/login/options", {
    method: "OPTIONS",
    headers: { Origin: "https://attacker.example" },
  });
  const response = await worker.fetch(request, { ALLOWED_ORIGIN: "https://owner.example" });
  assert.equal(response.status, 403);
});
