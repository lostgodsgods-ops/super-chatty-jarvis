import { pathToFileURL } from "node:url";

const API = "https://api.cloudflare.com/client/v4";
const WORKER_NAME = "super-chatty-passkey-staging";

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

const HEALTH_ROUTE_OLD = 'if (request.method === "GET" && path === "/health") return json2({ ok: true, component: "passkey-auth-staging", production: false }, 200, headers);';
const HEALTH_AND_SMOKE_ROUTES = `if (request.method === "GET" && path === "/health") return json2({ ok: true, component: "passkey-auth-staging", production: false, liveSearchConfigured: Boolean(env.SEARCH_BRIDGE_TOKEN), searchProvider: "tavily" }, 200, headers);
    if (request.method === "POST" && path === "/internal/search-smoke") {
      const expected = typeof env.SEARCH_BRIDGE_TOKEN === "string" ? env.SEARCH_BRIDGE_TOKEN.trim() : "";
      const header = request.headers.get("authorization") || "";
      const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      let mismatch = supplied.length ^ expected.length;
      const maxLength = Math.max(supplied.length, expected.length);
      for (let i = 0; i < maxLength; i++) mismatch |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
      if (!expected || mismatch !== 0) return json2({ error: "Unauthorized" }, 401, headers);
      const limiter = env.AUTH_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return json2({ error: "Search smoke-test rate limiting unavailable" }, 503, headers);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const rate = await limiter.limit({ key: ip + ":internal-search-smoke" });
      if (!rate?.success) return json2({ error: "Rate limit exceeded" }, 429, { ...headers, "retry-after": "60" });
      const body = await readJson(request);
      const query = typeof body?.query === "string" ? body.query.trim() : "";
      if (!query || query.length > 400) return json2({ error: "query must contain 1–400 characters" }, 400, headers);
      return await runLiveSearch(query, env, "en-IN");
    }`;

export function patchWorkerBundle(source) {
  if (typeof source !== "string" || !source.includes('async function runLiveSearch(query, env, language) {')) {
    throw new Error("Could not find the expected live-search function; refusing to deploy.");
  }

  let patched = source;
  const braveConstant = 'var BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";';
  const gatewayConstant = 'var CENTRAL_AGENT_SEARCH_ENDPOINT = "https://shrill-silence-164f.lostgodsgods.workers.dev/internal/search";';
  if (patched.includes(braveConstant)) patched = patched.replace(braveConstant, gatewayConstant);
  else if (!patched.includes(gatewayConstant)) throw new Error("Could not find the expected search provider constant; refusing to deploy.");

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

  if (!patched.includes('payload?.sources') || !patched.includes('searchProvider: "tavily"') || !patched.includes("CENTRAL_AGENT_SEARCH_ENDPOINT")) {
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
  const original = await scriptResponse.text();
  const settings = settingsPayload.result || {};
  if (!Array.isArray(settings.bindings) || !settings.bindings.some((binding) => binding.name === "SEARCH_BRIDGE_TOKEN" && binding.type === "secret_text")) {
    throw new Error("SEARCH_BRIDGE_TOKEN is not bound to the staging Worker before patch deployment.");
  }
  if (!settings.bindings.some((binding) => binding.name === "SEARCH_BRIDGE_TOKEN" && binding.type === "secret_text")) {
    throw new Error("SEARCH_BRIDGE_TOKEN is not bound to the staging Worker; refusing to add the protected smoke-test route.");
  }

  const patched = patchWorkerBundle(original);
  const metadata = {
    main_module: "worker.js",
    compatibility_date: settings.compatibility_date,
    compatibility_flags: settings.compatibility_flags,
    usage_model: settings.usage_model,
    tags: settings.tags,
    tail_consumers: settings.tail_consumers,
    logpush: settings.logpush,
    annotations: settings.annotations,
    bindings: settings.bindings,
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
    const codes = (deployPayload?.errors || []).map((item) => item.code).filter((value) => value !== undefined);
    throw new Error("Staging Worker deployment failed with HTTP " + deployResponse.status + (codes.length ? " (error codes: " + codes.join(",") + ")" : "") + ".");
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
