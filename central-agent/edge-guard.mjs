const TRAP_PATHS = [
  /^\/\.env(?:\.|\/|$)/i, /^\/\.git(?:\/|$)/i, /^\/wp-admin(?:\/|$)/i,
  /^\/wp-login\.php$/i, /^\/phpmyadmin(?:\/|$)/i, /^\/vendor\/phpunit/i,
  /^\/\.aws(?:\/|$)/i, /^\/etc\/passwd$/i, /^\/server-status$/i
];
const RATE_LIMITED_PREFIXES = ["/auth/", "/api/", "/agents", "/search", "/research/", "/chat", "/internal/"];
const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 90;
const BLOCK_SECONDS = 1800;

async function hash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
function isLimitedPath(path) { return RATE_LIMITED_PREFIXES.some(prefix => path.startsWith(prefix)); }
async function recordEvent(env, type, ipHash, path, details, now) {
  if (!env.DB || typeof env.DB.prepare !== "function") return;
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS security_events (id TEXT PRIMARY KEY,event_type TEXT NOT NULL,ip_hash TEXT NOT NULL,path TEXT NOT NULL,details_json TEXT NOT NULL,created_at TEXT NOT NULL)").run();
    await env.DB.prepare("INSERT INTO security_events (id,event_type,ip_hash,path,details_json,created_at) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), type, ipHash, path.slice(0, 180), JSON.stringify(details), now).run();
  } catch {}
}

export async function guardRequest(request, env, nowMs = Date.now()) {
  const url = new URL(request.url);
  const path = url.pathname;
  const kv = env?.SESSIONS;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") return null;
  const rawIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  if (!rawIp) return null;
  const ipHash = await hash(rawIp);
  const now = new Date(nowMs).toISOString();
  const blockKey = "edge:block:" + ipHash;
  if (await kv.get(blockKey)) return { status: 403, body: { error: "Request blocked by defensive edge controls." }, headers: { "cache-control": "no-store" } };

  if (TRAP_PATHS.some(pattern => pattern.test(path))) {
    await kv.put(blockKey, "honeypot", { expirationTtl: BLOCK_SECONDS });
    await recordEvent(env, "honeypot_probe", ipHash, path, { method: request.method }, now);
    return { status: 404, body: { error: "Not found" }, headers: { "cache-control": "no-store" } };
  }
  if (!isLimitedPath(path) || path === "/health") return null;

  const window = Math.floor(nowMs / (WINDOW_SECONDS * 1000));
  const rateKey = "edge:rate:" + ipHash + ":" + window + ":" + path.slice(0, 80);
  const count = Number(await kv.get(rateKey) || 0);
  const maxRequests = path === "/auth/login" ? 12 : path === "/auth/setup" ? 5 : MAX_REQUESTS_PER_WINDOW;
  if (count >= maxRequests) {
    await recordEvent(env, "rate_limit", ipHash, path, { count, windowSeconds: WINDOW_SECONDS }, now);
    return { status: 429, body: { error: "Rate limit exceeded. Retry after the current minute." }, headers: { "retry-after": String(WINDOW_SECONDS - Math.floor((nowMs / 1000) % WINDOW_SECONDS)), "cache-control": "no-store" } };
  }
  await kv.put(rateKey, String(count + 1), { expirationTtl: WINDOW_SECONDS + 5 });
  return null;
}
