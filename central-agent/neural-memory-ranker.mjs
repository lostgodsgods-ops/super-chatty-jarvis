const MAX_RECORDS = 100;
const MAX_QUERY_CHARS = 200;
const HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000;

function tokens(value) {
  return String(value || "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
}

function isUsableVerifiedRecord(record) {
  return record?.status === "verified" &&
    typeof record.title === "string" && record.title.trim().length > 0 &&
    typeof record.problem === "string" && record.problem.trim().length > 0 &&
    typeof record.solution === "string" && record.solution.trim().length > 0 &&
    Array.isArray(record.testEvidence) && record.testEvidence.length > 0;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Rank verified memory by query overlap, recorded confidence, test evidence,
 * and freshness. This is deterministic lexical relevance scoring, not a
 * trained neural embedding model. It never changes verification state.
 */
export function rankVerifiedKnowledge(records, query, now = Date.now()) {
  if (!Array.isArray(records)) return [];
  const queryTerms = [...new Set(tokens(String(query || "").slice(0, MAX_QUERY_CHARS)))].sort();
  const timestamp = Number.isFinite(now) ? now : Date.now();

  return records.slice(0, MAX_RECORDS)
    .filter(isUsableVerifiedRecord)
    .map((record, index) => {
      const documentTerms = new Set(tokens([
        record.title, record.problem, record.solution
      ].join(" ")));
      const matchedTerms = queryTerms.filter(term => documentTerms.has(term));
      const lexical = queryTerms.length ? matchedTerms.length / queryTerms.length : 0;
      const confidence = clamp(Number.isFinite(record.confidence) ? record.confidence : 0.5);
      const evidence = clamp(record.testEvidence.length / 3);
      const updated = Date.parse(record.updatedAt || record.updated_at || "");
      const age = Number.isFinite(updated) ? Math.max(0, timestamp - updated) : HALF_LIFE_MS;
      const freshness = Math.pow(0.5, age / HALF_LIFE_MS);
      const score = Math.round(clamp(
        lexical * 0.65 + confidence * 0.20 + evidence * 0.10 + freshness * 0.05
      ) * 10000) / 10000;

      return {
        record: { ...record },
        index,
        relevance: { score, matchedTerms }
      };
    })
    .sort((a, b) => b.relevance.score - a.relevance.score || a.index - b.index)
    .map(({ record, relevance }) => ({ ...record, relevance }));
}
