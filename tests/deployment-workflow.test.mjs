
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/deploy-worker.yml", import.meta.url), "utf8");
const config = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("production PWA asset changes trigger the Worker deployment workflow", () => {
  assert.match(workflow, /branches:\s*\n\s+- main/);
  assert.match(workflow, /"jarvis\/\*\*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /command: deploy/);
  assert.match(config, /"assets":\s*\{/);
  assert.match(config, /"directory": "\.\/jarvis"/);
});
