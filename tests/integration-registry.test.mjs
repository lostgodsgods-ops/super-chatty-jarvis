import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const registry = JSON.parse(
  await readFile(new URL("../docs/integration-registry.json", import.meta.url), "utf8")
);
const allowedStatuses = new Set([
  "implemented", "configured", "live_verified", "blocked", "not_implemented", "not_tested"
]);

test("integration registry has a supported schema version and fail-safe policy", () => {
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.project, "REDULTRON CORE 3.0");
  assert.equal(registry.policy.registryIsProofOfLiveOperation, false);
  assert.equal(registry.policy.secretsMayBeStored, false);
  assert.equal(registry.policy.productionChangesRequireExplicitApproval, true);
  assert.equal(registry.policy.financialActionsDefaultToSandbox, true);
});

test("integration IDs are unique and every integration has layer-specific statuses", () => {
  assert.ok(Array.isArray(registry.integrations) && registry.integrations.length > 0);
  const ids = registry.integrations.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, "integration IDs must be unique");

  for (const item of registry.integrations) {
    assert.equal(typeof item.name, "string");
    assert.ok(item.name.length > 0);
    assert.ok(item.layers && typeof item.layers === "object");
    for (const layer of ["implementation", "configuration", "production"]) {
      assert.ok(allowedStatuses.has(item.layers[layer]), `${item.id} has invalid ${layer} status`);
    }
    assert.ok(Array.isArray(item.evidence), `${item.id} evidence must be an array`);
    assert.equal(typeof item.nextAction, "string");
    assert.ok(item.nextAction.length > 0, `${item.id} must define a next action`);
    assert.equal(typeof item.risk, "string");
    assert.ok(item.risk.length > 0, `${item.id} must define a risk`);
  }
});

test("financial and unknown external integrations are not falsely marked production-verified", () => {
  const banking = registry.integrations.find(item => item.id === "BANKING");
  const bunker = registry.integrations.find(item => item.id === "BUNKER");
  assert.ok(banking, "banking integration entry must exist");
  assert.ok(bunker, "Bunker integration entry must exist");
  assert.notEqual(banking.layers.production, "live_verified");
  assert.notEqual(bunker.layers.production, "live_verified");
});

const agentRegistry = JSON.parse(
  await readFile(new URL("../config/agent-registry.json", import.meta.url), "utf8")
);

test("registered agent catalog is not misrepresented as a running agent fleet", () => {
  const agents = registry.integrations.find(item => item.id === "AGENTS");
  assert.ok(agents, "integration registry must explicitly track the agent runtime");
  assert.equal(agentRegistry.counts.total, 90);
  assert.equal(agentRegistry.runtime.agentsProvisioned, 0);
  assert.equal(agentRegistry.runtime.automaticDispatchEnabled, false);
  assert.equal(agents.layers.production, "blocked");
  assert.match(agents.nextAction, /provision|dispatch|runtime/i);
});
