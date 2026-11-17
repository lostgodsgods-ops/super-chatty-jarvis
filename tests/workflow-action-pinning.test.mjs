import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowPaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-central-agent.yml",
  ".github/workflows/deploy-cloudflare.yml",
  ".github/workflows/deploy-nexus-pwa.yml",
  ".github/workflows/integration-registry.yml",
  ".github/workflows/monitor-central-agent.yml",
  ".github/workflows/php-core.yml",
  ".github/workflows/redultron-failure-sentinel.yml",
  ".github/workflows/redultron-release-package.yml",
  ".github/workflows/static-site-checks.yml",
  ".github/workflows/test-central-agent.yml",
  ".github/workflows/test-hybrid-core.yml"
];

test("every external GitHub Action is pinned to a full immutable commit SHA", async () => {
  const violations = [];
  for (const path of workflowPaths) {
    const source = await readFile(new URL("../" + path, import.meta.url), "utf8");
    for (const [index, line] of source.split("\n").entries()) {
      const match = line.match(/^\s*uses:\s*([^\s#]+)\s*$/);
      if (!match) continue;
      const action = match[1];
      if (action.startsWith("./")) continue;
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/.test(action)) {
        violations.push(path + ":" + (index + 1) + " " + action);
      }
    }
  }
  assert.deepEqual(violations, [], "Actions must use full commit SHAs:\n" + violations.join("\n"));
});
