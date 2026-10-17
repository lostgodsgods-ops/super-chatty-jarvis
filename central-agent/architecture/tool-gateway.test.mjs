import test from "node:test";
import assert from "node:assert/strict";
import { executeToolAction, listToolCapabilities } from "./tool-gateway.mjs";

test("integration status reports missing Vectorize as unconfigured", async () => {
  const response = await executeToolAction({ action: "integration.status" }, {});
  assert.equal(response.status, 200);
  assert.equal(response.body.capabilities.bindings.vectorize, false);
  assert.equal(response.body.capabilities.productionDeployment.enabled, false);
});

test("D1 health uses a bounded read-only SELECT 1 check", async () => {
  let sql = "";
  const response = await executeToolAction({ action: "memory.d1-health" }, {
    DB: { prepare(query) { sql = query; return { first: async () => ({ ok: 1 }) }; } }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "PASS");
  assert.equal(sql, "SELECT 1 AS ok");
});

test("Vectorize status does not claim a live round trip from binding presence alone", async () => {
  const response = await executeToolAction({ action: "memory.vectorize-status" }, { VECTORIZE: { query() {} } });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "CONFIGURED_NOT_ROUND_TRIP_VERIFIED");
});

test("production deployment is blocked unless server flag and explicit approval are both set", async () => {
  const disabled = await executeToolAction({ action: "deployment.trigger", approval: "DEPLOY_PRODUCTION" }, {});
  const unapproved = await executeToolAction({ action: "deployment.trigger" }, { ALLOW_PRODUCTION_DEPLOY: "true" });
  assert.equal(disabled.status, 403);
  assert.equal(disabled.body.error, "PRODUCTION_DEPLOYMENT_DISABLED");
  assert.equal(unapproved.status, 403);
  assert.equal(unapproved.body.error, "EXPLICIT_DEPLOYMENT_APPROVAL_REQUIRED");
});

test("unknown tool actions fail closed", async () => {
  const response = await executeToolAction({ action: "run-arbitrary-url" }, {});
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "TOOL_ACTION_NOT_ALLOWLISTED");
});
