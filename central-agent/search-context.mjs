const FILLER = /\b(?:um+|uh+|erm+|hmm+)\b/gi;
const STOP_WORDS = new Set([
  "the","and","for","with","from","that","this","what","when","where","which","who","why","how",
  "are","was","were","is","be","been","being","can","could","would","should","please","tell","me",
  "find","search","look","up","about","into","latest","current","today","news","update","updates",
  "information","info","give","show","get","hey","hi","chatty","jarvis","latest"
]);

export function buildTavilyQuery(message) {
  if (typeof message !== "string") return "";
  let query = message.normalize("NFKC").replace(FILLER, " ").replace(/\s+/g, " ").trim();
  query = query.replace(/^(?:(?:hey|hi)\s+)?(?:chatty|jarvis)[,!:;\s]+/i, "");
  query = query.replace(/^[,;:\s]+/, "").replace(/^(?:can you|could you|would you|please)\s+/i, "");
  query = query.replace(/^(?:please\s+)?(?:tavily\s+search(?:\s+for)?|search(?: the)? (?:web|internet|online)(?:\s+for)?|web search(?:\s+for)?|internet search(?:\s+for)?|browse(?: the)? web(?:\s+for)?|live search(?:\s+for)?|search(?: the web)? for|look up(?: online)?|find(?: me)?(?: the)?|tell me about|give me information about|what is the latest on)\s+/i, "");
  query = query.replace(/^(?:इंटरनेट पर|ऑनलाइन|लाइव सर्च|टैविली सर्च|सर्च करके|खोजकर|खोजो)\s*/i, "");
  query = query.replace(/^[,;:\s]+|[,;:\s]+$/g, "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "").trim().replace(/^(?:the|a|an)\s+/i, "");
  if (!query || /^(?:please|thanks|thank you)$/i.test(query)) return "";
  return query.slice(0, 400);
}

function meaningfulTokens(text) {
  return new Set((String(text || "").toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])
    .filter(token => !STOP_WORDS.has(token)));
}

function relevance(item, queryTokens) {
  const titleTokens = meaningfulTokens(item.title);
  const contentTokens = meaningfulTokens(item.content);
  let score = 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) { score += 4; overlap++; }
    if (contentTokens.has(token)) { score += 1; overlap++; }
  }
  const providerScore = Number.isFinite(item.score) ? Math.max(0, Math.min(1, item.score)) : 0;
  return { score: score + providerScore, overlap };
}

export function rankTavilyResults(query, results) {
  if (!Array.isArray(results)) return [];
  const queryTokens = meaningfulTokens(query);
  const usable = results.map((item, index) => {
    let url = "";
    try {
      const parsed = new URL(item?.url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") url = parsed.toString();
    } catch {}
    if (!url) return null;
    const normalized = {
      title: typeof item?.title === "string" ? item.title.trim().slice(0, 240) : "",
      url,
      content: typeof item?.content === "string" ? item.content.trim().slice(0, 1200) : "",
      publishedDate: typeof item?.published_date === "string" ? item.published_date.slice(0, 80) : typeof item?.publishedDate === "string" ? item.publishedDate.slice(0, 80) : null,
      score: Number.isFinite(item?.score) ? item.score : null
    };
    if (!normalized.title) return null;
    return { normalized, index, ...relevance(normalized, queryTokens) };
  }).filter(Boolean);

  // If at least one result matches a meaningful topic token, drop unrelated results.
  // If none match, preserve provider-ranked results as an explicit best-effort fallback.
  const matching = usable.filter(item => item.overlap > 0);
  const selected = matching.length ? matching : usable;
  return selected.sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 5).map(item => item.normalized);
}
