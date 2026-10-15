import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API = "https://api.cloudflare.com/client/v4";
const WORKER_NAME = "super-chatty-passkey-staging";

const CENTRAL_AGENT_CHAT_ENDPOINT = "https://shrill-silence-164f.lostgodsgods.workers.dev/chat";
const CHAT_PROXY_BODY = `const gatewayToken = typeof env.SEARCH_BRIDGE_TOKEN === "string" ? env.SEARCH_BRIDGE_TOKEN.trim() : "";
              if (!gatewayToken) {
                response = json2({ error: "AI response gateway is not configured.", code: "CHAT_GATEWAY_NOT_CONFIGURED" }, 503);
              } else {
                try {
                  const upstream = await fetch(CENTRAL_AGENT_CHAT_ENDPOINT, {
                    method: "POST",
                    headers: { authorization: "Bearer " + gatewayToken, "content-type": "application/json", accept: "application/json" },
                    body: JSON.stringify({ message: body.message.trim(), language: body.language }),
                    signal: AbortSignal.timeout(12000)
                  });
                  const payload = await upstream.json().catch(() => ({}));
                  if (!upstream.ok) {
                    response = json2({ error: payload.error || "AI response gateway returned HTTP " + upstream.status, code: payload.code || "CHAT_GATEWAY_HTTP_ERROR" }, upstream.status >= 400 ? upstream.status : 502);
                  } else if (payload.ok !== true || !(typeof payload.reply === "string" || typeof payload.answer === "string") || !(typeof payload.reply === "string" ? payload.reply : payload.answer).trim()) {
                    response = json2({ error: "AI response gateway returned an incomplete response.", code: "CHAT_GATEWAY_INCOMPLETE" }, 502);
                  } else {
                    response = json2({ ok: true, reply: typeof payload.reply === "string" ? payload.reply : payload.answer, model: payload.model || "central-agent-workers-ai", core: { ...(payload.core || {}), intent: "chat", requiresTaskApproval: false, externalActionsPerformed: false } });
                  }
                } catch (error) {
                  console.warn("SCJ_CHAT_GATEWAY_ERROR", { errorName: typeof error?.name === "string" ? error.name : "Error" });
                  response = json2({ error: "AI response gateway could not be reached.", code: "CHAT_GATEWAY_NETWORK_ERROR" }, 502);
                }
              }`;


const LIVE_SEARCH_FUNCTION = `async function runLiveSearch(query, env, language) {
  const gatewayToken = typeof env.SEARCH_BRIDGE_TOKEN === "string" ? env.SEARCH_BRIDGE_TOKEN.trim() : "";
  if (!gatewayToken) {
    return json2({
      error: "Live search gateway is not configured for this staging deployment.",
      code: "SEARCH_NOT_CONFIGURED",
      core: { intent: "web_search", webSearchExecuted: false, searchProvider: "tavily" }
    }, 503);
  }

  let response;
  try {
    response = await fetch(CENTRAL_AGENT_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: "Bearer " + gatewayToken,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({ query: query.slice(0, 400), language }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    console.warn("SCJ_SEARCH_GATEWAY_NETWORK_ERROR", {
      errorName: typeof error?.name === "string" ? error.name : "Error"
    });
    return json2({
      error: "Live search service could not be reached.",
      code: "SEARCH_GATEWAY_NETWORK_ERROR",
      core: { intent: "web_search", webSearchExecuted: false, searchProvider: "tavily" }
    }, 502);
  }

  if (!response.ok) {
    console.warn("SCJ_SEARCH_GATEWAY_HTTP_ERROR", { status: response.status });
    return json2({
      error: "Live search service returned HTTP " + response.status + ".",
      code: "SEARCH_GATEWAY_HTTP_ERROR",
      providerStatus: response.status,
      core: { intent: "web_search", webSearchExecuted: false, searchProvider: "tavily" }
    }, 502);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return json2({
      error: "Live search service returned invalid JSON.",
      code: "SEARCH_GATEWAY_INVALID_JSON",
      core: { intent: "web_search", webSearchExecuted: false, searchProvider: "tavily" }
    }, 502);
  }

  const sources = (Array.isArray(payload?.sources) ? payload.sources : []).map((item) => {
    let sourceUrl = "";
    try {
      const parsed = new URL(item?.url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") sourceUrl = parsed.toString();
    } catch {
    }
    return {
      title: typeof item?.title === "string" ? item.title.slice(0, 240) : "",
      url: sourceUrl,
      description: typeof item?.description === "string" ? item.description.slice(0, 900) : ""
    };
  }).filter((item) => item.title && item.url).slice(0, MAX_SEARCH_RESULTS);

  if (payload?.ok !== true || payload?.core?.webSearchExecuted !== true) {
    return json2({
      error: "Live search did not complete successfully.",
      code: "SEARCH_GATEWAY_INCOMPLETE",
      core: { intent: "web_search", webSearchExecuted: false, searchProvider: "tavily" }
    }, 502);
  }

  return json2({
    ok: true,
    reply: typeof payload.reply === "string" ? payload.reply : sources.map((source, index) => (index + 1) + ". " + source.title + "\\n" + source.description + "\\n" + source.url).join("\\n\\n"),
    model: typeof payload.model === "string" ? payload.model : "central-agent-tavily",
    sources,
    core: {
      ...(payload.core || {}),
      intent: "web_search",
      webSearchExecuted: true,
      searchProvider: "tavily",
      sourceCount: sources.length,
      requiresTaskApproval: false,
      externalActionsPerformed: false
    }
  });
}`;

const CHAT_SMOKE_ROUTE = `if (request.method === "POST" && path === "/internal/chat-smoke") {
      const expectedTokens = [env.SEARCH_BRIDGE_TOKEN, env.AGENT_GATEWAY_TOKEN].filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
      const header = request.headers.get("authorization") || "";
      const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      let authenticated = false;
      for (const expected of expectedTokens) {
        let mismatch = supplied.length ^ expected.length;
        const maxLength = Math.max(supplied.length, expected.length);
        for (let i = 0; i < maxLength; i++) mismatch |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
        if (mismatch === 0 && expected) authenticated = true;
      }
      if (!authenticated) return json2({ error: "Unauthorized" }, 401, headers);
      const limiter = env.AUTH_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return json2({ error: "Chat smoke-test rate limiting unavailable" }, 503, headers);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const rate = await limiter.limit({ key: ip + ":internal-chat-smoke" });
      if (!rate?.success) return json2({ error: "Rate limit exceeded" }, 429, { ...headers, "retry-after": "60" });
      const body = await readJson(request);
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      const language = ["hi-IN", "en-IN", "en-US"].includes(body?.language) ? body.language : "en-IN";
      if (!message || message.length > 8000) return json2({ error: "message must contain 1–8000 characters" }, 400, headers);
      const gatewayToken = typeof env.SEARCH_BRIDGE_TOKEN === "string" ? env.SEARCH_BRIDGE_TOKEN.trim() : "";
      if (!gatewayToken) return json2({ error: "AI response gateway is not configured" }, 503, headers);
      try {
        const response = await fetch(CENTRAL_AGENT_CHAT_ENDPOINT, {
          method: "POST",
          headers: { authorization: "Bearer " + gatewayToken, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ message, language }),
          signal: AbortSignal.timeout(12000)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok !== true || !(typeof payload?.reply === "string" || typeof payload?.answer === "string") || !(typeof payload?.reply === "string" ? payload.reply : payload.answer).trim()) {
          return json2({ error: payload.error || "AI response smoke test failed", code: payload.code || "CHAT_GATEWAY_INCOMPLETE" }, response.ok ? 502 : response.status, headers);
        }
        return json2({ ok: true, provider: payload.provider || "workers-ai", reply: typeof payload.reply === "string" ? payload.reply : payload.answer, model: payload.model || "central-agent-workers-ai", core: { ...(payload.core || {}), intent: "chat", externalActionsPerformed: false } }, 200, headers);
      } catch (error) {
        console.warn("SCJ_CHAT_SMOKE_ERROR", { errorName: typeof error?.name === "string" ? error.name : "Error" });
        return json2({ error: "AI response smoke test could not reach the gateway", code: "CHAT_GATEWAY_NETWORK_ERROR" }, 502, headers);
      }
    }`;
const HEALTH_ROUTE_OLD = 'if (request.method === "GET" && path === "/health") return json2({ ok: true, component: "passkey-auth-staging", production: false }, 200, headers);';
const HEALTH_AND_SMOKE_ROUTES = `if (request.method === "GET" && path === "/health") return json2({ ok: true, component: "passkey-auth-staging", production: false, liveSearchConfigured: Boolean(env.SEARCH_BRIDGE_TOKEN), searchProvider: "tavily" }, 200, headers);
    if (request.method === "POST" && path === "/internal/search-smoke") {
      const expectedTokens = [env.SEARCH_BRIDGE_TOKEN, env.AGENT_GATEWAY_TOKEN].filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
      const header = request.headers.get("authorization") || "";
      const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      let authenticated = false;
      for (const expected of expectedTokens) {
        let mismatch = supplied.length ^ expected.length;
        const maxLength = Math.max(supplied.length, expected.length);
        for (let i = 0; i < maxLength; i++) mismatch |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
        if (mismatch === 0 && expected) authenticated = true;
      }
      if (!authenticated) return json2({ error: "Unauthorized" }, 401, headers);
      const limiter = env.AUTH_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return json2({ error: "Search smoke-test rate limiting unavailable" }, 503, headers);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const rate = await limiter.limit({ key: ip + ":internal-search-smoke" });
      if (!rate?.success) return json2({ error: "Rate limit exceeded" }, 429, { ...headers, "retry-after": "60" });
      const body = await readJson(request);
      const query = typeof body?.query === "string" ? body.query.trim() : "";
      if (!query || query.length > 400) return json2({ error: "query must contain 1–400 characters" }, 400, headers);
      return await runLiveSearch(query, env, "en-IN");
    }
    if (request.method === "POST" && path === "/internal/chat-smoke") {
      const expectedTokens = [env.SEARCH_BRIDGE_TOKEN, env.AGENT_GATEWAY_TOKEN].filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
      const header = request.headers.get("authorization") || "";
      const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      let authenticated = false;
      for (const expected of expectedTokens) {
        let mismatch = supplied.length ^ expected.length;
        const maxLength = Math.max(supplied.length, expected.length);
        for (let i = 0; i < maxLength; i++) mismatch |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
        if (mismatch === 0 && expected) authenticated = true;
      }
      if (!authenticated) return json2({ error: "Unauthorized" }, 401, headers);
      const limiter = env.AUTH_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return json2({ error: "Chat smoke-test rate limiting unavailable" }, 503, headers);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const rate = await limiter.limit({ key: ip + ":internal-chat-smoke" });
      if (!rate?.success) return json2({ error: "Rate limit exceeded" }, 429, { ...headers, "retry-after": "60" });
      const body = await readJson(request);
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      const language = ["hi-IN", "en-IN", "en-US"].includes(body?.language) ? body.language : "en-IN";
      if (!message || message.length > 8000) return json2({ error: "message must contain 1–8000 characters" }, 400, headers);
      const gatewayToken = typeof env.SEARCH_BRIDGE_TOKEN === "string" ? env.SEARCH_BRIDGE_TOKEN.trim() : "";
      if (!gatewayToken) return json2({ error: "AI response gateway is not configured" }, 503, headers);
      try {
        const response = await fetch(CENTRAL_AGENT_CHAT_ENDPOINT, {
          method: "POST",
          headers: { authorization: "Bearer " + gatewayToken, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ message, language }),
          signal: AbortSignal.timeout(12000)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok !== true || typeof payload?.reply !== "string" || !payload.reply.trim()) {
          return json2({ error: payload.error || "AI response smoke test failed", code: payload.code || "CHAT_GATEWAY_INCOMPLETE" }, response.ok ? 502 : response.status, headers);
        }
        return json2({ ok: true, provider: payload.provider || "workers-ai", reply: payload.reply, model: payload.model || "central-agent-workers-ai", core: { ...(payload.core || {}), intent: "chat", externalActionsPerformed: false } }, 200, headers);
      } catch (error) {
        console.warn("SCJ_CHAT_SMOKE_ERROR", { errorName: typeof error?.name === "string" ? error.name : "Error" });
        return json2({ error: "AI response smoke test could not reach the gateway", code: "CHAT_GATEWAY_NETWORK_ERROR" }, 502, headers);
      }
    }`;

function validateModuleSyntax(source) {
  const directory = mkdtempSync(join(tmpdir(), "scj-staging-worker-"));
  const filename = join(directory, "worker.mjs");
  try {
    writeFileSync(filename, source, { mode: 0o600 });
    execFileSync(process.execPath, ["--check", filename], { stdio: "pipe" });
  } catch (error) {
    const detail = String(error?.stderr || error?.message || "Unknown syntax error").slice(-1800);
    throw new Error("Patched staging Worker syntax check failed: " + detail);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function extractWorkerSource(raw) {
  if (typeof raw !== "string") throw new Error("Cloudflare returned an invalid Worker script body.");
  const boundary = (raw.match(/^--([^\r\n]+)/) || [])[1];
  if (!boundary) return raw;
  const part = raw.split("--" + boundary).find((item) => item.includes('name="worker.js"'));
  if (!part) throw new Error("Cloudflare script response did not contain the worker.js module.");
  const separator = part.indexOf("\r\n\r\n");
  if (separator < 0) throw new Error("Cloudflare script response had an invalid worker.js part.");
  return part.slice(separator + 4).replace(/\r\n$/, "");
}

export function patchWorkerBundle(source) {
  if (typeof source !== "string" || !source.includes('async function runLiveSearch(query, env, language) {')) {
    throw new Error("Could not find the expected live-search function; refusing to deploy.");
  }

  let patched = source;
  const braveConstant = 'var BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";';
  const gatewayConstant = 'var CENTRAL_AGENT_SEARCH_ENDPOINT = "https://shrill-silence-164f.lostgodsgods.workers.dev/internal/search";';
  if (patched.includes(braveConstant)) patched = patched.replace(braveConstant, gatewayConstant);
  else if (!patched.includes(gatewayConstant)) throw new Error("Could not find the expected search provider constant; refusing to deploy.");
  const oldChatGatewayConstant = 'var CENTRAL_AGENT_CHAT_ENDPOINT = "https://shrill-silence-164f.lostgodsgods.workers.dev/internal/chat";';
  const chatGatewayConstant = 'var CENTRAL_AGENT_CHAT_ENDPOINT = "https://shrill-silence-164f.lostgodsgods.workers.dev/chat";';
  if (patched.includes(oldChatGatewayConstant)) patched = patched.replace(oldChatGatewayConstant, chatGatewayConstant);
  else if (!patched.includes(chatGatewayConstant)) patched = patched.replace(gatewayConstant, gatewayConstant + "\n" + chatGatewayConstant);

  const functionStart = patched.indexOf('async function runLiveSearch(query, env, language) {');
  const functionMarker = '\n}\n__name(runLiveSearch, "runLiveSearch");';
  const functionEnd = patched.indexOf(functionMarker, functionStart);
  if (functionEnd < 0) throw new Error("Could not locate the end of the live-search function; refusing to deploy.");
  patched = patched.slice(0, functionStart) + LIVE_SEARCH_FUNCTION + patched.slice(functionEnd + 2);


  if (patched.includes(HEALTH_ROUTE_OLD)) {
    patched = patched.replace(HEALTH_ROUTE_OLD, HEALTH_AND_SMOKE_ROUTES);
  } else if (!patched.includes('liveSearchConfigured: Boolean(env.SEARCH_BRIDGE_TOKEN)') || !patched.includes('path === "/internal/search-smoke"')) {
    throw new Error("Could not locate the expected health route; refusing to deploy.");
  }

  if (!patched.includes('path === "/internal/chat-smoke"')) {
    const searchSmokeEnd = 'return await runLiveSearch(query, env, "en-IN");\n    }';
    if (!patched.includes(searchSmokeEnd)) throw new Error("Could not insert the protected AI chat smoke route.");
    patched = patched.replace(searchSmokeEnd, searchSmokeEnd + "\n    " + CHAT_SMOKE_ROUTE);
  }


  const chatRouteStart = patched.indexOf('else if (request.method === "POST" && path === "/api/chat")');
  if (chatRouteStart < 0) throw new Error("Could not find the PWA /api/chat handler; refusing to deploy.");
  const localChatStart = patched.indexOf('const defaultModel = "@cf/meta/llama-3.1-8b-instruct";', chatRouteStart);
  if (localChatStart >= 0) {
    const localChatEndMarker = '\n            }\n          }\n        }\n      } else {';
    const localChatEnd = patched.indexOf(localChatEndMarker, localChatStart);
    if (localChatEnd < 0) throw new Error("Could not locate the end of the PWA chat handler; refusing to deploy.");
    patched = patched.slice(0, localChatStart) + CHAT_PROXY_BODY + patched.slice(localChatEnd);
  } else if (
    !patched.slice(chatRouteStart).includes("fetch(CENTRAL_AGENT_CHAT_ENDPOINT") &&
    !patched.slice(chatRouteStart).includes("fetchCentralAgent(env, CENTRAL_AGENT_CHAT_ENDPOINT")
  ) {
    throw new Error("PWA chat handler is neither patchable nor already connected to the central AI gateway.");
  }


  const oldChatGuard = 'else if (env.CHAT_API_ENABLED === "false" || !env.AI || typeof env.AI.run !== "function") {';
  const newChatGuard = 'else if (env.CHAT_API_ENABLED === "false" || !env.SEARCH_BRIDGE_TOKEN) {';
  if (patched.includes(oldChatGuard)) patched = patched.replace(oldChatGuard, newChatGuard);
  else if (!patched.includes(newChatGuard)) throw new Error("Could not route staging chat through the central gateway.");

  const oldHistoryWait = 'if(!$("historyPanel").hidden)await persistConversationMessage("user",message);';
  const newHistoryWait = 'if(!$("historyPanel").hidden)void persistConversationMessage("user",message);';
  if (patched.includes(oldHistoryWait)) patched = patched.replace(oldHistoryWait, newHistoryWait);
  else if (!patched.includes(newHistoryWait)) throw new Error("Could not optimize local history persistence.");

  const chatFetchStart = '  const r=await fetch("/api/chat"';
  if (!patched.includes('sayStatus("Chatty is processing your message...")')) {
    if (!patched.includes(chatFetchStart)) throw new Error("Could not locate the PWA chat request for latency optimization.");
    patched = patched.replace(chatFetchStart, '  $("reply").textContent="Thinking...";sayStatus("Chatty is processing your message...");\n' + chatFetchStart);
  }
  const oldChatFetchBody = 'body:JSON.stringify({message,language:$("language").value})});';
  const newChatFetchBody = 'body:JSON.stringify({message,language:$("language").value}),signal:AbortSignal.timeout(18000)});';
  if (patched.includes(oldChatFetchBody)) patched = patched.replace(oldChatFetchBody, newChatFetchBody);
  else if (!patched.includes('signal:AbortSignal.timeout(18000)')) throw new Error("Could not add a bounded timeout to the PWA chat request.");

  patched = patched.replaceAll("AI response service is not connected in this staging build yet.", "Ready. Send a message to Chatty.");
  const originGuardNew = 'const serviceResultRoute = request.method === "POST" && ["/results", "/tasks/claim", "/internal/search-smoke", "/internal/chat-smoke"].includes(path);';
  if (!patched.includes(originGuardNew)) {
    const guardStart = patched.indexOf("const serviceResultRoute =");
    const guardEnd = guardStart >= 0 ? patched.indexOf(";", guardStart) : -1;
    const currentGuard = guardStart >= 0 && guardEnd >= guardStart ? patched.slice(guardStart, guardEnd + 1) : "";
    if (currentGuard.includes('"/results"') && currentGuard.includes('"/tasks/claim"')) {
      patched = patched.slice(0, guardStart) + originGuardNew + patched.slice(guardEnd + 1);
    } else {
      throw new Error("Could not update the origin guard for protected internal smoke routes.");
    }
  }

  patched = patched.replaceAll("scj-pwa-v2", "scj-pwa-v3");
  patched = patched.replace('if(!r.ok){sayStatus(data.error||"Chat request failed.");return;}', 'if(!r.ok){$(\"reply\").textContent=data.error||\"Chat request failed.\";sayStatus(data.error||\"Chat request failed.\");return;}');
  patched = patched.replace('}catch(e){sayStatus("Chat request failed. Check connection and try again.");}', '}catch(e){$(\"reply\").textContent=\"Chat request failed. Check connection and try again.\";sayStatus(\"Chat request failed. Check connection and try again.\");}');

  if (
    !patched.includes('payload?.sources') ||
    !patched.includes('searchProvider: "tavily"') ||
    !patched.includes("CENTRAL_AGENT_SEARCH_ENDPOINT") ||
    !patched.includes("CENTRAL_AGENT_CHAT_ENDPOINT") ||
    (!patched.includes("fetch(CENTRAL_AGENT_CHAT_ENDPOINT") && !patched.includes("fetchCentralAgent(env, CENTRAL_AGENT_CHAT_ENDPOINT"))
  ) {
    throw new Error("Patched search validation failed; refusing to deploy.");
  }
  return patched;
}

async function cloudflareRequest(path, options = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("Missing CLOUDFLARE_API_TOKEN.");
  const response = await fetch(API + path, {
    ...options,
    headers: { authorization: "Bearer " + token, ...(options.headers || {}) }
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = null; }
  if (!response.ok || payload?.success === false) {
    const codes = (payload?.errors || []).map((item) => item.code).filter((value) => value !== undefined);
    throw new Error("Cloudflare API request failed with HTTP " + response.status + (codes.length ? " (error codes: " + codes.join(",") + ")" : "") + ".");
  }
  return payload;
}

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("Missing CLOUDFLARE_ACCOUNT_ID.");
  const base = "/accounts/" + encodeURIComponent(accountId) + "/workers/scripts/" + WORKER_NAME;

  const [scriptResponse, settingsPayload] = await Promise.all([
    fetch(API + base, { headers: { authorization: "Bearer " + process.env.CLOUDFLARE_API_TOKEN } }),
    cloudflareRequest(base + "/settings")
  ]);
  if (!scriptResponse.ok) throw new Error("Unable to download the current staging Worker (HTTP " + scriptResponse.status + ").");
  const original = extractWorkerSource(await scriptResponse.text());
  const settings = settingsPayload.result || {};
  if (!Array.isArray(settings.bindings) || !settings.bindings.some((binding) => binding.name === "SEARCH_BRIDGE_TOKEN" && binding.type === "secret_text")) {
    throw new Error("SEARCH_BRIDGE_TOKEN is not bound to the staging Worker before patch deployment.");
  }
  if (!settings.bindings.some((binding) => binding.name === "SEARCH_BRIDGE_TOKEN" && binding.type === "secret_text")) {
    throw new Error("SEARCH_BRIDGE_TOKEN is not bound to the staging Worker; refusing to add the protected smoke-test route.");
  }

  const patched = patchWorkerBundle(original);
  validateModuleSyntax(patched);
  const metadata = {
    main_module: "worker.js",
    compatibility_date: settings.compatibility_date,
    compatibility_flags: settings.compatibility_flags,
    usage_model: settings.usage_model,
    tags: settings.tags,
    tail_consumers: settings.tail_consumers,
    logpush: settings.logpush,
    annotations: settings.annotations,
    bindings: settings.bindings.filter((binding) => binding.type !== "secret_text"),
    placement: settings.placement
  };
  for (const key of Object.keys(metadata)) if (metadata[key] === undefined) delete metadata[key];

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
  form.append("worker.js", new Blob([patched], { type: "application/javascript+module" }), "worker.js");
  const deployResponse = await fetch(API + base + "?bindings_inherit=strict", {
    method: "PUT",
    headers: { authorization: "Bearer " + process.env.CLOUDFLARE_API_TOKEN },
    body: form
  });
  const deployText = await deployResponse.text();
  let deployPayload;
  try { deployPayload = JSON.parse(deployText); } catch { deployPayload = null; }
  if (!deployResponse.ok || deployPayload?.success === false) {
    const errors = (deployPayload?.errors || []).map((item) => (item.code !== undefined ? item.code + ": " : "") + (item.message || "Cloudflare API error"));
    throw new Error("Staging Worker deployment failed with HTTP " + deployResponse.status + (errors.length ? " — " + errors.join("; ") : ".") );
  }

  const verify = await cloudflareRequest(base + "/settings");
  const bindings = verify.result?.bindings || [];
  for (const name of ["SEARCH_BRIDGE_TOKEN", "AI", "DB", "SESSIONS"]) {
    if (!bindings.some((binding) => binding.name === name)) throw new Error("Post-deploy binding verification failed for " + name + ".");
  }
  console.log(JSON.stringify({
    ok: true,
    worker: WORKER_NAME,
    provider: "tavily",
    deployed: true,
    searchBridgeTokenBinding: bindings.some((binding) => binding.name === "SEARCH_BRIDGE_TOKEN" && binding.type === "secret_text"),
    smokeRoute: "token-protected and rate-limited",
    aiBinding: bindings.some((binding) => binding.name === "AI" && binding.type === "ai"),
    preservedAuthBindings: ["DB", "SESSIONS"].every((name) => bindings.some((binding) => binding.name === name))
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Staging Worker patch failed.");
    process.exitCode = 1;
  });
}
