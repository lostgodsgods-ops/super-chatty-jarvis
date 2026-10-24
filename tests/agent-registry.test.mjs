import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const registry = JSON.parse(
  await readFile(new URL("../config/agent-registry.json", import.meta.url), "utf8")
);

test("registry defines exactly 90 unique agent slots across four groups", () => {
  assert.equal(registry.counts.total, 90);
  assert.equal(registry.agents.length, 90);
  assert.equal(new Set(registry.agents.map((agent) => agent.id)).size, 90);
  assert.deepEqual(
    registry.counts,
    { total: 90, groupA: 20, groupB: 25, groupC: 30, groupD: 15 }
  );
});

test("all registry entries are explicitly unprovisioned and cannot auto-dispatch", () => {
  assert.equal(registry.mode, "registry-only");
  assert.equal(registry.runtime.agentsProvisioned, 0);
  assert.equal(registry.runtime.automaticDispatchEnabled, false);
  for (const agent of registry.agents) {
    assert.equal(agent.status, "registered-not-provisioned");
    assert.equal(agent.dispatchEnabled, false);
    assert.ok(agent.allowedActions.includes("write-audit-result"));
    assert.ok(agent.deniedActions.includes("read-or-export-secrets"));
    assert.ok(agent.deniedActions.includes("erase-required-audit-records"));
  }
});

test("treasury agents are simulation-only and deny live transaction submission", () => {
  const treasury = registry.agents.filter((agent) => agent.group === "B");
  assert.equal(treasury.length, 25);
  for (const agent of treasury) {
    assert.ok(agent.allowedActions.includes("simulate-only"));
    assert.ok(agent.deniedActions.includes("submit-live-payment"));
    assert.ok(agent.deniedActions.includes("broadcast-live-transaction"));
    assert.equal(agent.approvalRequired, "commander-approval-for-any-live-financial-action");
  }
});

test("group ranges and IDs remain aligned with the architecture", () => {
  for (const [start, end, group] of [[1,20,"A"], [21,45,"B"], [46,75,"C"], [76,90,"D"]]) {
    const expected = end - start + 1;
    const actual = registry.agents.filter((agent) => {
      const id = Number(agent.id.slice(-2));
      return id >= start && id <= end && agent.group === group;
    });
    assert.equal(actual.length, expected);
  }
});
