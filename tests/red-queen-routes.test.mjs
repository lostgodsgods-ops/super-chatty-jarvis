import test from "node:test";
import assert from "node:assert/strict";
import worker from "../central-agent/worker.mjs";

async function request(path, method = "POST", body = {}) {
  return worker.fetch(new Request("https://unit.test" + path, {
    method,
    headers: { "content-type": "application/json", "cf-connecting-ip": "127.0.0.1" },
    ...(method === "GET" || method === "HEAD" ? {} : { body: JSON.stringify(body) })
  }), { SESSIONS: { async get() { return null; }, async put() {} } });
}

test("owner-control mutation rejects requests without a real owner session", async () => {
  const response = await request("/api/owner-control", "POST", { action: "takeover", enabled: true });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "OWNER_SESSION_REQUIRED");
});

test("finance sandbox rejects requests without a real owner session", async () => {
  const response = await request("/api/finance/sandbox", "POST", {
    idempotencyKey: "test-1", kind: "credit", amountMinor: 100
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "OWNER_SESSION_REQUIRED");
});

test("robotics simulator assessment rejects requests without a real owner session", async () => {
  const response = await request("/api/robotics/simulator/assess", "POST", {
    action: "move-simulated", x: 1, y: 1, speed: 0.2
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "OWNER_SESSION_REQUIRED");
});

test("robotics simulator endpoint rejects methods other than POST", async () => {
  const response = await request("/api/robotics/simulator/assess", "GET");
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});
