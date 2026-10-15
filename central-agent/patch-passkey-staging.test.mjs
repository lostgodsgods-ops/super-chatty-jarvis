import test from "node:test";
import assert from "node:assert/strict";
import { patchWorkerBundle } from "./patch-passkey-staging.mjs";

const fixture = `
var BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
var MAX_SEARCH_RESULTS = 5;
async function runLiveSearch(query, env, language) {
  return json2({ ok: false });
}
__name(runLiveSearch, "runLiveSearch");
if (request.method === "GET" && path === "/health") return json2({ ok: true, component: "passkey-auth-staging", production: false }, 200, headers);
`;

test("patch routes PWA search through the protected central Tavily gateway", () => {
  const result = patchWorkerBundle(fixture);
  assert.match(result, /var CENTRAL_AGENT_SEARCH_ENDPOINT = "https:\/\/shrill-silence-164f\.lostgodsgods\.workers\.dev\/internal\/search"/);
  assert.doesNotMatch(result, /api\.search\.brave\.com/);
  assert.match(result, /authorization: "Bearer " \+ gatewayToken/);
  assert.match(result, /Array\.isArray\(payload\?\.sources\)/);
  assert.match(result, /AbortSignal\.timeout\(15000\)/);
});

test("PWA delegates synthesis to central gateway and validates successful search", () => {
  const result = patchWorkerBundle(fixture);
  const start = result.indexOf("async function runLiveSearch");
  const end = result.indexOf('__name(runLiveSearch, "runLiveSearch");', start);
  const searchFunction = result.slice(start, end);
  assert.equal((searchFunction.match(/env\.AI\.run\(/g) || []).length, 0);
  assert.match(searchFunction, /CENTRAL_AGENT_SEARCH_ENDPOINT/);
  assert.match(searchFunction, /payload\?\.core\?\.webSearchExecuted !== true/);
});

test("health reports only whether Tavily is configured and adds a protected smoke route", () => {
  const result = patchWorkerBundle(fixture);
  assert.match(result, /liveSearchConfigured: Boolean\(env\.AGENT_GATEWAY_TOKEN\)/);
  assert.match(result, /searchProvider: "tavily"/);
  assert.match(result, /path === "\/internal\/search-smoke"/);
  assert.match(result, /env\.AGENT_GATEWAY_TOKEN/);
  assert.match(result, /env\.AUTH_RATE_LIMITER/);
  assert.doesNotMatch(result, /SEARCH_API_KEY[^\n]{0,80}console\.log/);
});

test("patch is idempotent and refuses an unknown deployed bundle", () => {
  const once = patchWorkerBundle(fixture);
  const twice = patchWorkerBundle(once);
  assert.equal(twice, once);
  assert.throws(() => patchWorkerBundle("unrecognized worker bundle"), /refusing to deploy/i);
});
