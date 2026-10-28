import test from "node:test";
import assert from "node:assert/strict";
import { validateReleasePackage } from "../scripts/redultron-package-check.mjs";

test("release package validates all required integrations and explicit blockers", async () => {
  const report = await validateReleasePackage();
  assert.equal(report.ok, true, report.errors.join("\n"));
  assert.ok(report.integrationCount >= 12);
  assert.equal(report.registeredAgents, 90);
  assert.equal(report.provisionedAgents, 0);
  assert.equal(report.automaticDispatchEnabled, false);
  assert.ok(report.blockedIntegrations.includes("CORE-PY"));
  assert.ok(report.blockedIntegrations.includes("CORE-AUTH"));
  assert.ok(report.blockedIntegrations.includes("AGENTS"));
});

test("release package refuses to call registry completeness production certification", async () => {
  const report = await validateReleasePackage();
  assert.equal(report.productionCertified, false);
  assert.ok(report.notVerifiedIntegrations.length > 0);
  assert.match(report.releaseState, /PACKAGE_VALIDATED_WITH_BLOCKERS/);
});
