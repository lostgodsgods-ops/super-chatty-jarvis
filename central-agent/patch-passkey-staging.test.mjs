import test from "node:test";
import assert from "node:assert/strict";
import { extractWorkerSource, patchWorkerBundle } from "./patch-passkey-staging.mjs";

const fixture = `
var BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
var MAX_SEARCH_RESULTS = 5;
var initialReply = "AI response service is not connected in this staging build yet.";
var serviceWorkerSource = 'const CACHE="scj-pwa-v2";';
const serviceResultRoute = request.method === "POST" && ["/results", "/tasks/claim"].includes(path);

var oldChatGuardFixture = 'else if (env.CHAT_API_ENABLED === "false" || !env.AI || typeof env.AI.run !== "function") {';
async function sendCurrentMessage() {
  if(!$("historyPanel").hidden)await persistConversationMessage("user",message);
  const r=await fetch("/api/chat",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({message,language:$("language").value})});
  return r;
}

async function runLiveSearch(query, env, language) {
  return json2({ ok: false });
}
__name(runLiveSearch, "runLiveSearch");
if (request.method === "GET" && path === "/health") return json2({ ok: true, component: "passkey-auth-staging", production: false }, 200, headers);
else if (request.method === "POST" && path === "/api/chat") {
        const session = await getOwnerSession(request, env);
        if (!session) response = json2({ error: "Owner authentication required" }, 401);
        else {
          if (typeof body?.message !== "string" || !body.message.trim()) response = json2({ error: "invalid" }, 400);
          else {
            const bossCommand = parseBossCommand(body.message);
            if (bossCommand.intent === "help") {
              response = json2({ ok: true, reply: "help" });
            } else if (bossCommand.intent === "create_mission") {
              response = json2({ ok: true, reply: "mission" });
            } else {
              const defaultModel = "@cf/meta/llama-3.1-8b-instruct";
              response = json2({ ok: true, reply: "local chat" });
            }
          }
        }
      } else {
        response = json2({ error: "Not found" }, 404);
      }
`;

test("patch routes PWA search through the protected central Tavily gateway", () => {
  const result = patchWorkerBundle(fixture);
  assert.match(result, /var CENTRAL_AGENT_SEARCH_ENDPOINT = "https:\/\/shrill-silence-164f\.lostgodsgods\.workers\.dev\/search"/);
  assert.doesNotMatch(result, /api\.search\.brave\.com/);
  assert.match(result, /authorization: "Bearer " \+ gatewayToken/);
  assert.match(result, /Array\.isArray\(payload\?\.sources\)/);
  assert.match(result, /AbortSignal\.timeout\(15000\)/);
  assert.match(result, /CENTRAL_AGENT_CHAT_ENDPOINT/);
  assert.ok(result.includes('var CENTRAL_AGENT_CHAT_ENDPOINT = "https://shrill-silence-164f.lostgodsgods.workers.dev/chat";'));
  assert.match(result, /fetch\(CENTRAL_AGENT_CHAT_ENDPOINT/);
  assert.match(result, /CHAT_GATEWAY_NETWORK_ERROR/);
  assert.doesNotMatch(result, /AI response service is not connected in this staging build yet/);
  assert.match(result, /scj-pwa-v3/);
  assert.match(result, /CHAT_API_ENABLED === "false" \|\| !env\.SEARCH_BRIDGE_TOKEN/);
  assert.match(result, /Chatty is processing your message/);
  assert.match(result, /AbortSignal\.timeout\(18000\)/);
  assert.doesNotMatch(result, /await persistConversationMessage\("user",message\)/);
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
  assert.match(result, /liveSearchConfigured: Boolean\(env\.SEARCH_BRIDGE_TOKEN\)/);
  assert.match(result, /searchProvider: "tavily"/);
  assert.match(result, /path === "\/internal\/search-smoke"/);
  assert.match(result, /path === "\/internal\/chat-smoke"/);
  assert.match(result, /"\/internal\/search-smoke", "\/internal\/chat-smoke"/);
  assert.match(result, /env\.SEARCH_BRIDGE_TOKEN/);
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


test("extracts the JavaScript module from Cloudflare's multipart Worker response", () => {
  const raw = [
    "--worker-boundary",
    'Content-Disposition: form-data; name="metadata"',
    "Content-Type: application/json",
    "",
    "{}",
    "--worker-boundary",
    'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
    "Content-Type: application/javascript+module",
    "",
    "export default { fetch() { return new Response('ok'); } };",
    "--worker-boundary--",
    ""
  ].join("\r\n");
  assert.equal(extractWorkerSource(raw), "export default { fetch() { return new Response('ok'); } };");
});

test("accepts an already connected chat route using the Central Agent service binding helper", () => {
  const once = patchWorkerBundle(fixture);
  const connected = once.replace(
    "fetch(CENTRAL_AGENT_CHAT_ENDPOINT, {",
    "fetchCentralAgent(env, CENTRAL_AGENT_CHAT_ENDPOINT, {"
  );
  assert.notEqual(connected, once);
  const result = patchWorkerBundle(connected);
  assert.ok(result.includes("fetchCentralAgent(env, CENTRAL_AGENT_CHAT_ENDPOINT"));
  assert.ok(result.includes("CENTRAL_AGENT_SEARCH_ENDPOINT"));
});
