import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const registryPath = fileURLToPath(new URL("../redultron-integration-registry.json", import.meta.url));
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const allowedStatuses = new Set([
  "implemented",
  "configured",
  "live_verified",
  "blocked",
  "not_implemented",
  "not_tested"
]);

test("integration registry has a version and a dated snapshot", () => {
  assert.equal(registry.schemaVersion, 1);
  assert.match(registry.updatedAt, /^\\d{4}-\\d{2}-\\d{2}$/);
  assert.ok(Array.isArray(registry.integrations) && registry.integrations.length >= 5);
});

test("each integration records evidence and operational safety metadata", () => {
  const ids = new Set();
  for (const integration of registry.integrations) {
    assert.ok(integration.id && !ids.has(integration.id), "integration ids must be present and unique");
    ids.add(integration.id);
    assert.ok(integration.name);
    assert.ok(allowedStatuses.has(integration.status), integration.id + " has an invalid status");
    assert.ok(Array.isArray(integration.codePaths));
    assert.ok(Array.isArray(integration.credentialNames));
    assert.ok(integration.auth);
    assert.ok(integration.access);
    assert.ok(integration.safetyGate);
    assert.ok(integration.timeoutRetry);
    assert.ok(integration.dataClass);
    assert.ok(integration.lastEvidence && integration.lastEvidence.date && integration.lastEvidence.result);
    assert.ok(integration.failureMode);
    assert.ok(integration.disablePath);
    assert.ok(Array.isArray(integration.tests));
    assert.ok(integration.owner);
  }
});

test("unknown or failing integrations are not mislabeled live-verified", () => {
  const byId = Object.fromEntries(registry.integrations.map(item => [item.id, item]));
  assert.equal(byId["python-hybrid-core"].status, "blocked");
  assert.equal(byId["live-search"].status, "not_tested");
  assert.equal(byId["pwa-android"].status, "not_tested");
  assert.equal(byId["render-control-plane"].status, "not_tested");
});

test("registry contains configuration names only, never secret values", () => {
  const serialized = JSON.stringify(registry);
  assert.doesNotMatch(serialized, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i);
  assert.doesNotMatch(serialized, /(?:ghp_|github_pat_|sk-[A-Za-z0-9]{20,})/);
  assert.doesNotMatch(serialized, /(?:password|token|secret)\\s*[:=]\\s*["'][^"']{16,}["']/i);
});
