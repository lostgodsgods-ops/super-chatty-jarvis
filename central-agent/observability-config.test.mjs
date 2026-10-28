import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rawConfig = readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8");
const config = JSON.parse(rawConfig.replace(/^\\s*\\/\\/.*$/gm, ""));

test("Worker observability keeps query redaction on and raw invocation logs off", () => {
  const obs = config.observability;
  assert.equal(obs.enabled, true);
  assert.equal(obs.redact_query_string, true);
  assert.equal(obs.logs.enabled, true);
  assert.equal(obs.logs.invocation_logs, false);
  assert.equal(obs.logs.persist, true);
  assert.equal(obs.traces.enabled, true);
  assert.equal(obs.traces.persist, true);
  for (const rate of [obs.head_sampling_rate, obs.logs.head_sampling_rate, obs.traces.head_sampling_rate]) {
    assert.equal(typeof rate, "number");
    assert.ok(rate >= 0 && rate <= 1, "sampling rates must stay within [0, 1]");
  }
});
