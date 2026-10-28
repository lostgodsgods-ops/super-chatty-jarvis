/**
 * Read-only live search for Agent Saum's research specialist.
 * Uses Tavily only for explicit legacy opt-in (or an unset legacy mode); named open-source-first/public modes use public sources.
 * No credentials are returned or written to audit logs.
 */
const MAX_QUERY = 400;
const MAX_RESULTS = 5;
export const LIVE_SEARCH_TIMEOUT_MS = 5000;
const TIMEOUT_MS = LIVE_SEARCH_TIMEOUT_MS;
const STALE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const liveSearchCache = new Map();
const fetchImplementationIds = new WeakMap();
let nextFetchImplementationId = 1;
function cacheNamespace(fetchImpl, providerMode) {
  let id = fetchImplementationIds.get(fetchImpl);
  if (!id) { id = nextFetchImplementationId++; fetchImplementationIds.set(fetchImpl, id); }
  return String(providerMode || "default") + ":fetch-" + id;
}

function clean(value, max = 1200) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}
function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch { return ""; }
}
function normalizeItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).map(item => {
    const url = safeUrl(item?.url);
    const title = clean(item?.title, 240);
    if (!url || !title || seen.has(url)) return null;
    seen.add(url);
    return { title, url, snippet: clean(item?.content || item?.snippet), publishedDate: clean(item?.published_date || item?.publishedDate, 80) || null };
  }).filter(Boolean).slice(0, MAX_RESULTS);
}
function parseDdg(html) {
  const results = [];
  const blocks = String(html || "").slice(0, 800000).split(/<div[^>]+class=["'][^"']*result[^"']*["'][^>]*>/i).slice(1);
  for (const block of blocks) {
    const a = block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    let url = decodeHtml(a[1]);
    try {
      const parsed = new URL(url, "https://html.duckduckgo.com");
      const redirect = parsed.searchParams.get("uddg");
      if (redirect) url = decodeURIComponent(redirect);
    } catch {}
    const snippet = block.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    results.push({ title: decodeHtml(a[2].replace(/<[^>]+>/g, " ")), url, content: decodeHtml((snippet?.[1] || "").replace(/<[^>]+>/g, " ")) });
  }
  // DDG may render links without wrapping result blocks in test fixtures or new layouts.
  if (!results.length) {
    const anchors = [...String(html || "").matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    for (const a of anchors) results.push({ title: decodeHtml(a[2].replace(/<[^>]+>/g, " ")), url: decodeHtml(a[1]), content: "" });
  }
  return normalizeItems(results);
}
function isFreshnessQuery(query) {
  return /\b(latest|today|tonight|now|current|currently|live|breaking|recent|historical|history|this week|this month|this year|price|weather|news|score|election|outage|version|release|updated|20(?:2[3-9]|[3-9]\d))\b/i.test(query)
    || /आज|अभी|ताज़ा|ताजा|वर्तमान|मौजूदा|लेटेस्ट|लाइव|समाचार|खबर|ख़बर|कीमत|मूल्य|मौसम|नतीजे|परिणाम|स्कोर|अपडेट|इस हफ्ते|इस सप्ताह|इस महीने|इस साल|हालिया|ब्रेकिंग|इतिहास|ऐतिहासिक/i.test(query);
}
async function request(fetchImpl, provider, url, init = {}) {
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  const response = await fetchImpl(url, { ...init, signal });
  if (!response.ok) throw new Error(provider + "_HTTP_" + response.status);
  return response;
}
async function ddg(query, fetchImpl, signal) {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);
  const response = await request(fetchImpl, "DDG", url.toString(), { headers: { accept: "text/html", "accept-language": "en-IN,en;q=0.8,hi;q=0.6" }, signal });
  const sources = parseDdg(await response.text());
  return sources.length ? { provider: "duckduckgo-html", sources } : null;
}
function normalizeNewsUrl(value) {
  const original = safeUrl(value);
  if (!original) return "";
  try {
    const parsed = new URL(original);
    // Bing's RSS endpoint wraps the publisher destination in an apiclick URL.
    // Return only a valid HTTP(S) destination; retain the wrapper if it cannot be decoded.
    if (/(^|\\.)bing\\.com$/i.test(parsed.hostname) && parsed.pathname === "/news/apiclick.aspx") {
      const target = safeUrl(parsed.searchParams.get("url") || "");
      if (target) return target;
    }
  } catch {}
  return original;
}

async function newsRss(query, fetchImpl, provider, signal) {
  const url = new URL(provider === "bing-news-rss" ? "https://www.bing.com/news/search" : "https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  if (provider === "bing-news-rss") url.searchParams.set("format", "rss");
  else { url.searchParams.set("hl", "en-IN"); url.searchParams.set("gl", "IN"); url.searchParams.set("ceid", "IN:en"); }
  const response = await request(fetchImpl, provider, url.toString(), { headers: { accept: "application/rss+xml, application/xml, text/xml" }, signal });
  const xml = (await response.text()).slice(0, 800000);
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => {
    const item = match[1];
    const field = name => {
      const found = item.match(new RegExp("<" + name + "(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/" + name + ">", "i"));
      return found ? decodeHtml(found[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")) : "";
    };
    return { title: field("title"), url: normalizeNewsUrl(field("link")), content: field("description"), published_date: field("pubDate") };
  });
  const sources = normalizeItems(items);
  return sources.length ? { provider, sources } : null;
}
async function gdelt(query, fetchImpl, signal) {
  const now = new Date();
  const format = date => date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query); url.searchParams.set("mode", "ArtList"); url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(MAX_RESULTS)); url.searchParams.set("sort", "HybridRel");
  url.searchParams.set("startdatetime", format(new Date(now.getTime() - 90 * 86400000))); url.searchParams.set("enddatetime", format(now));
  const response = await request(fetchImpl, "GDELT", url.toString(), { headers: { accept: "application/json" }, signal });
  const payload = await response.json();
  const sources = normalizeItems((payload?.articles || []).map(item => ({ title: item?.title, url: item?.url, content: [item?.domain, item?.sourcecountry, item?.language].filter(Boolean).join(" · "), published_date: item?.seendate })));
  return sources.length ? { provider: "gdelt-doc-api", sources } : null;
}
async function braveSearch(query, fetchImpl, apiKey) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(MAX_RESULTS));
  const response = await request(fetchImpl, "BRAVE", url.toString(), {
    headers: { accept: "application/json", "X-Subscription-Token": apiKey }
  });
  const payload = await response.json();
  const sources = normalizeItems((payload?.web?.results || []).map(item => ({
    title: item?.title,
    url: item?.url,
    content: item?.description,
    published_date: item?.page_age || item?.page_fetched
  })));
  return sources.length ? { provider: "brave-search", sources } : null;
}

async function wikipedia(query, fetchImpl) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query"); url.searchParams.set("list", "search"); url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", String(MAX_RESULTS)); url.searchParams.set("format", "json"); url.searchParams.set("utf8", "1");
  const response = await request(fetchImpl, "WIKIPEDIA", url.toString(), { headers: { accept: "application/json" } });
  const payload = await response.json();
  const sources = normalizeItems((payload?.query?.search || []).map(item => ({ title: item?.title, url: Number.isSafeInteger(item?.pageid) ? "https://en.wikipedia.org/?curid=" + item.pageid : "", content: String(item?.snippet || "").replace(/<[^>]+>/g, " ") })));
  return sources.length ? { provider: "wikipedia-api", sources } : null;
}

async function performLiveSearch(rawQuery, env = {}, options = {}) {
  const query = clean(rawQuery, MAX_QUERY);
  if (!query) throw new Error("LIVE_SEARCH_EMPTY_QUERY");
  const fetchImpl = options.fetchImpl || fetch;
  const diagnostics = [];
  const endpointFor = name => ({
    "duckduckgo-html": "https://html.duckduckgo.com/html/",
    "bing-news-rss": "https://www.bing.com/news/search",
    "google-news-rss": "https://news.google.com/rss/search",
    "gdelt-doc-api": "https://api.gdeltproject.org/api/v2/doc/doc",
    "wikipedia-api": "https://en.wikipedia.org/w/api.php",
    tavily: "https://api.tavily.com/search"
  })[name] || "unknown";
  const attempt = async (name, fn, signal) => {
    try {
      const result = await fn();
      if (result?.sources?.length) return result;
      diagnostics.push({ provider: name, status: "no-usable-results" });
    } catch (error) {
      if (signal?.aborted && error?.name === "AbortError") return null;
      const match = String(error?.message || "").match(/HTTP_(\d{3})/);
      const status = match ? "http-" + match[1] : error?.name === "TimeoutError" ? "timeout" : "network-error";
      diagnostics.push({ provider: name, status });
      if (match) {
        console.warn("live_search_provider_http_failure", { provider: name, endpoint: endpointFor(name), status: Number(match[1]) });
      } else {
        console.warn("live_search_provider_network_failure", {
          provider: name, endpoint: endpointFor(name), status,
          errorName: String(error?.name || "Error").slice(0, 80),
          errorMessage: String(error?.message || error || "Unknown network error").slice(0, 180)
        });
      }
    }
    return null;
  };
  const tavilyKey = typeof env.TAVILY_API_KEY === "string" && env.TAVILY_API_KEY.trim()
    ? env.TAVILY_API_KEY.trim() : typeof env.SEARCH_API_KEY === "string" ? env.SEARCH_API_KEY.trim() : "";
  const providerMode = clean(env.SEARCH_PROVIDER_MODE, 40).toLowerCase();
  const tavilyAllowed = !providerMode || providerMode === "tavily";
  if (tavilyAllowed && tavilyKey) {
    // Retry transient rate-limit/server responses only within one 5-second total budget.
    // A hung provider is aborted at the deadline so fallback providers can run immediately.
    const tavilyDeadline = Date.now() + TIMEOUT_MS;
    for (let attemptNumber = 0; attemptNumber < 3; attemptNumber++) {
      const remainingMs = tavilyDeadline - Date.now();
      if (remainingMs <= 0) {
        diagnostics.push({ provider: "tavily", status: "timeout-budget-exhausted" });
        break;
      }
      let response;
      try {
        response = await fetchImpl("https://api.tavily.com/search", {
          method: "POST",
          signal: AbortSignal.timeout(Math.max(1, Math.min(TIMEOUT_MS, remainingMs))),
          headers: { authorization: "Bearer " + tavilyKey, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ query, search_depth: "basic", max_results: MAX_RESULTS, include_answer: false, include_raw_content: false })
        });
      } catch (error) {
        await attempt("tavily", async () => { throw error; });
        break;
      }
      if (response.ok) {
        try {
          const payload = await response.json();
          const sources = normalizeItems(payload?.results);
          if (sources.length) return { provider: "tavily", sources, query, diagnostics };
          diagnostics.push({ provider: "tavily", status: "no-usable-results" });
        } catch {
          diagnostics.push({ provider: "tavily", status: "invalid-response" });
        }
        break;
      }
      diagnostics.push({ provider: "tavily", status: "http-" + response.status });
      console.warn("live_search_provider_http_failure", { provider: "tavily", endpoint: endpointFor("tavily"), status: response.status });
      const transient = response.status === 429 || [500, 502, 503, 504].includes(response.status);
      if (!transient || attemptNumber === 2) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      const requestedDelay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(250, Math.max(100, retryAfter * 1000)) : 100 * (2 ** attemptNumber);
      const remainingAfterResponse = tavilyDeadline - Date.now();
      if (attemptNumber >= 2 || remainingAfterResponse <= requestedDelay) break;
      await new Promise(resolve => setTimeout(resolve, requestedDelay));
    }
  }
  // Brave is an independent indexed-search fallback. It is opt-in because it
  // requires its own credential and must never be assumed available by registry metadata.
  const braveKey = typeof env.BRAVE_SEARCH_API_KEY === "string" ? env.BRAVE_SEARCH_API_KEY.trim() : "";
  if (braveKey) {
    const brave = await attempt("brave-search", () => braveSearch(query, fetchImpl, braveKey));
    if (brave) return { ...brave, query, diagnostics };
  }

  const fresh = isFreshnessQuery(query);
  if (fresh) {
    // Fan out independent freshness providers together. Return the first usable source set
    // and cancel the remaining read-only requests instead of paying each timeout serially.
    const controller = new AbortController();
    const providers = [
      ["bing-news-rss", signal => newsRss(query, fetchImpl, "bing-news-rss", signal)],
      ["google-news-rss", signal => newsRss(query, fetchImpl, "google-news-rss", signal)],
      ["gdelt-doc-api", signal => gdelt(query, fetchImpl, signal)]
    ];
    const attempts = providers.map(async ([name, run]) => {
      const result = await attempt(name, () => run(controller.signal), controller.signal);
      if (!result) throw new Error("NO_USABLE_RESULTS");
      return result;
    });
    try {
      const result = await Promise.any(attempts);
      controller.abort();
      return { ...result, query, diagnostics };
    } catch {
      controller.abort();
    }
  }
  const broad = await attempt("duckduckgo-html", () => ddg(query, fetchImpl));
  if (broad) return { ...broad, query, diagnostics };
  if (!fresh) {
    const wiki = await attempt("wikipedia-api", () => wikipedia(query, fetchImpl));
    if (wiki) return { ...wiki, query, diagnostics };
  }
  const error = new Error("LIVE_SEARCH_ALL_PROVIDERS_FAILED");
  error.code = "LIVE_SEARCH_ALL_PROVIDERS_FAILED";
  error.providerDiagnostics = diagnostics.slice(0, 8);
  throw error;
}


/**
 * Resilient search wrapper. Successful live results are cached per normalized query.
 * If all live providers fail, return a bounded-age stale result rather than throwing.
 * Cached data is explicitly marked stale so callers must not present it as current.
 */
export async function searchLiveWeb(rawQuery, env = {}, options = {}) {
  const query = clean(rawQuery, MAX_QUERY);
  if (!query) throw new Error("LIVE_SEARCH_EMPTY_QUERY");
  const fetchImpl = options.fetchImpl || fetch;
  const namespace = cacheNamespace(fetchImpl, clean(env.SEARCH_PROVIDER_MODE, 40).toLowerCase());
  const cacheKey = namespace + ":" + query.toLocaleLowerCase();
  try {
    const result = await performLiveSearch(query, env, options);
    if (result?.sources?.length) {
      liveSearchCache.delete(cacheKey);
      liveSearchCache.set(cacheKey, { result, cachedAt: Date.now() });
      while (liveSearchCache.size > MAX_CACHE_ENTRIES) {
        liveSearchCache.delete(liveSearchCache.keys().next().value);
      }
    }
    return result;
  } catch (error) {
    const cached = liveSearchCache.get(cacheKey);
    if (options.allowStale === true && cached && Date.now() - cached.cachedAt <= STALE_CACHE_TTL_MS) {
      return {
        ...cached.result,
        stale: true,
        cachedAt: new Date(cached.cachedAt).toISOString(),
        diagnostics: [
          ...(Array.isArray(error?.providerDiagnostics) ? error.providerDiagnostics : []),
          { provider: "stale-cache", status: "served-stale" }
        ]
      };
    }
    if (cached && Date.now() - cached.cachedAt > STALE_CACHE_TTL_MS) liveSearchCache.delete(cacheKey);
    if (error && typeof error === "object") {
      error.code = error.code || "LIVE_SEARCH_ALL_PROVIDERS_FAILED";
      error.providerDiagnostics = Array.isArray(error.providerDiagnostics)
        ? error.providerDiagnostics.slice(0, 8)
        : [];
    }
    throw error;
  }
}

