import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateSourceRegistry,
  selectEnabledSources
} from "../central-agent/market-data/source-registry.mjs";

const registry = JSON.parse(
  await readFile(new URL("../config/market-source-registry.json", import.meta.url), "utf8")
);

test("market source registry validates the checked-in registry", () => {
  const result = validateSourceRegistry(registry);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("source IDs are unique and URLs are HTTPS", () => {
  const duplicate = structuredClone(registry);
  duplicate.sources.push({ ...duplicate.sources[0] });
  assert.equal(validateSourceRegistry(duplicate).valid, false);

  const insecure = structuredClone(registry);
  insecure.sources[0].url = "http://example.com/feed";
  assert.equal(validateSourceRegistry(insecure).valid, false);
});

test("unreviewed licensing keeps a source disabled even if enabled is toggled", () => {
  const unsafe = structuredClone(registry);
  unsafe.sources[0].enabled = true;
  unsafe.sources[0].licensing.status = "review-required";
  assert.deepEqual(selectEnabledSources(unsafe), []);
});

test("only explicitly enabled sources with approved licensing are selected", () => {
  const approved = structuredClone(registry);
  approved.sources[0].enabled = true;
  approved.sources[0].licensing.status = "approved";
  assert.deepEqual(selectEnabledSources(approved).map(source => source.id), [approved.sources[0].id]);
});

test("malformed source records fail closed", () => {
  const malformed = structuredClone(registry);
  malformed.sources[0].failurePolicy = {};
  assert.equal(validateSourceRegistry(malformed).valid, false);
  assert.deepEqual(selectEnabledSources(malformed), []);
});
