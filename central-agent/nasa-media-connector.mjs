/**
 * Bounded connector for NASA's public Image and Video Library API.
 * Public media metadata only; no credential bypass or private-system access.
 */
export const NASA_MEDIA_API = "https://images-api.nasa.gov/search";
export const NASA_MEDIA_LIMITS = Object.freeze({ timeoutMs: 7000, maxResults: 10, maxQueryLength: 120 });

function safeText(value, limit = 1200) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
    : "";
}

export async function searchNasaMedia(query, options = {}) {
  const term = safeText(query, NASA_MEDIA_LIMITS.maxQueryLength);
  if (!term) throw new TypeError("NASA_QUERY_REQUIRED");
  const limit = Math.max(1, Math.min(NASA_MEDIA_LIMITS.maxResults, Number(options.limit) || 5));
  const fetchImpl = options.fetchImpl || fetch;
  const endpoint = new URL(NASA_MEDIA_API);
  endpoint.searchParams.set("q", term);
  endpoint.searchParams.set("media_type", options.mediaType === "video" ? "video" : "image");
  endpoint.searchParams.set("page_size", String(limit));

  const response = await fetchImpl(endpoint.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(NASA_MEDIA_LIMITS.timeoutMs)
  });
  if (!response.ok) throw new Error("NASA_MEDIA_HTTP_" + response.status);
  const payload = await response.json();
  const items = payload?.collection?.items;
  if (!Array.isArray(items)) throw new Error("NASA_MEDIA_SCHEMA_INVALID");

  return items.slice(0, limit).map((item) => {
    const data = Array.isArray(item?.data) ? item.data[0] : null;
    const links = Array.isArray(item?.links) ? item.links : [];
    const nasaId = safeText(data?.nasa_id, 100);
    const sourceUrl = typeof item?.href === "string" && item.href.startsWith("https://")
      ? item.href : "";
    const previewUrl = links.find(link => typeof link?.href === "string" &&
      link.href.startsWith("https://images-assets.nasa.gov/"))?.href || "";
    return {
      source: "NASA Image and Video Library",
      nasaId,
      title: safeText(data?.title, 300),
      description: safeText(data?.description, 1200),
      dateCreated: safeText(data?.date_created, 80),
      mediaType: safeText(data?.media_type, 20),
      sourceUrl,
      previewUrl
    };
  }).filter(item => item.nasaId && item.title && item.sourceUrl);
}
