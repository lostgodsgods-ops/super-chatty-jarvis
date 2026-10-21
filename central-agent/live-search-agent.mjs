/**
 * Read-only live search for Agent Saum's research specialist.
 * Uses configured Tavily only when explicitly selected, then independent public sources.
 * No credentials are returned or written to audit logs.
 */
const MAX_QUERY = 400;
const MAX_RESULTS = 5;
const TIMEOUT_MS = 6500;

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
  return /\b(latest|today|tonight|now|current|live|breaking|recent|this week|this month|price|weather|news|score|election|outage|version|release|updated|202[5-9])\b/i.test(query);
}
async function request(fetchImpl, provider, url, init = {}) {
  const response = await fetchImpl(url, { ...init, signal: init.signal || AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(provider + "_HTTP_" + response.status);
  return response;
}
async function ddg(query, fetchImpl) {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);
  const response = await request(fetchImpl, "DDG", url.toString(), { headers: { accept: "text/html", "accept-language": "en-IN,en;q=0.8,hi;q=0.6" } });
  const sources = parseDdg(await response.text());
  return sources.length ? { provider: "duckduckgo-html", sources } : null;
}
async function newsRss(query, fetchImpl, provider) {
  const url = new URL(provider === "bing-news-rss" ? "https://www.bing.com/news/search" : "https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  if (provider === "bing-news-rss") url.searchParams.set("format", "rss");
  else { url.searchParams.set("hl", "en-IN"); url.searchParams.set("gl", "IN"); url.searchParams.set("ceid", "IN:en"); }
  const response = await request(fetchImpl, provider, url.toString(), { headers: { accept: "application/rss+xml, application/xml, text/xml" } });
  const xml = (await response.text()).slice(0, 800000);
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => {
    const item = match[1];
    const field = name => {
      const found = item.match(new RegExp("<" + name + "(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/" + name + ">", "i"));
      return found ? decodeHtml(found[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")) : "";
    };
    return { title: field("title"), url: field("link"), content: field("description"), published_date: field("pubDate") };
  });
  const sources = normalizeItems(items);
  return sources.length ? { provider, sources } : null;
}
async function gdelt(query, fetchImpl) {
  const now = new Date();
  const format = date => date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query); url.searchParams.set("mode", "ArtList"); url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(MAX_RESULTS)); url.searchParams.set("sort", "HybridRel");
  url.searchParams.set("startdatetime", format(new Date(now.getTime() - 90 * 86400000))); url.searchParams.set("enddatetime", format(now));
  const response = await request(fetchImpl, "GDELT", url.toString(), { headers: { accept: "application/json" } });
  const payload = await response.json();
  const sources = normalizeItems((payload?.articles || []).map(item => ({ title: item?.title, url: item?.url, content: [item?.domain, item?.sourcecountry, item?.language].filter(Boolean).join(" · "), published_date: item?.seendate })));
  return sources.length ? { provider: "gdelt-doc-api", sources } : null;
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

export async function searchLiveWeb(rawQuery, env = {}, options = {}) {
  const query = clean(rawQuery, MAX_QUERY);
  if (!query) throw new Error("LIVE_SEARCH_EMPTY_QUERY");
  const fetchImpl = options.fetchImpl || fetch;
  const diagnostics = [];
  const attempt = async (name, fn) => {
    try { const result = await fn(); if (result?.sources?.length) return result; diagnostics.push({ provider: name, status: "no-usable-results" }); }
    catch (error) {
      const match = String(error?.message || "").match(/HTTP_(\d{3})/);
      diagnostics.push({ provider: name, status: match ? "http-" + match[1] : error?.name === "TimeoutError" ? "timeout" : "network-error" });
    }
    return null;
  };
  const tavilyKey = typeof env.TAVILY_API_KEY === "string" && env.TAVILY_API_KEY.trim()
    ? env.TAVILY_API_KEY.trim() : typeof env.SEARCH_API_KEY === "string" ? env.SEARCH_API_KEY.trim() : "";
  if (env.SEARCH_PROVIDER_MODE === "tavily" && tavilyKey) {
    const result = await attempt("tavily", async () => {
      const response = await request(fetchImpl, "TAVILY", "https://api.tavily.com/search", {
        method: "POST", headers: { authorization: "Bearer " + tavilyKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ query, search_depth: "basic", max_results: MAX_RESULTS, include_answer: false, include_raw_content: false })
      });
      const payload = await response.json();
      const sources = normalizeItems(payload?.results);
      return sources.length ? { provider: "tavily", sources } : null;
    });
    if (result) return { ...result, query, diagnostics };
  }
  const fresh = isFreshnessQuery(query);
  if (fresh) {
    for (const provider of ["bing-news-rss", "google-news-rss", "gdelt-doc-api"]) {
      const result = await attempt(provider, () => provider === "gdelt-doc-api" ? gdelt(query, fetchImpl) : newsRss(query, fetchImpl, provider));
      if (result) return { ...result, query, diagnostics };
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
