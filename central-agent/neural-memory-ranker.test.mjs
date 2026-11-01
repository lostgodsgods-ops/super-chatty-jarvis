import test from "node:test";
import assert from "node:assert/strict";
import { rankVerifiedKnowledge } from "./neural-memory-ranker.mjs";

const record = (id, overrides = {}) => ({
  id, title: "Cloudflare worker authentication", problem: "Owner session validation",
  solution: "Validate session before access", confidence: 0.8,
  testEvidence: ["unit test passed"], status: "verified",
  updatedAt: "2026-10-30T00:00:00.000Z", ...overrides
});

test("adaptive ranker places query-relevant verified knowledge before unrelated records", () => {
  const ranked = rankVerifiedKnowledge([
    record("unrelated", { title: "CSS layout", problem: "Grid spacing", solution: "Use grid gap" }),
    record("relevant")
  ], "Cloudflare authentication", Date.parse("2026-10-30T00:00:00.000Z"));
  assert.equal(ranked[0].id, "relevant");
  assert.ok(ranked[0].relevance.score > ranked[1].relevance.score);
  assert.deepEqual(ranked[0].relevance.matchedTerms, ["authentication", "cloudflare"]);
});

test("ranker never promotes unverified or malformed records", () => {
  const ranked = rankVerifiedKnowledge([
    record("verified"),
    record("unverified", { status: "pending" }),
    { id: "malformed", status: "verified", title: "Only title" }
  ], "authentication", Date.now());
  assert.deepEqual(ranked.map(item => item.id), ["verified"]);
});

test("confidence, evidence and recency influence ranking without mutating source records", () => {
  const older = record("older", { confidence: 0.3, testEvidence: ["one"], updatedAt: "2020-01-01T00:00:00.000Z" });
  const newer = record("newer", { confidence: 0.95, testEvidence: ["test 1", "test 2", "test 3"] });
  const before = JSON.stringify([older, newer]);
  const ranked = rankVerifiedKnowledge([older, newer], "authentication", Date.parse("2026-10-30T00:00:00.000Z"));
  assert.equal(ranked[0].id, "newer");
  assert.equal(JSON.stringify([older, newer]), before);
});

test("ranker handles empty queries, invalid dates and bounded inputs deterministically", () => {
  const ranked = rankVerifiedKnowledge([record("a", { updatedAt: "bad-date" }), record("b")], "", Date.now());
  assert.equal(ranked.length, 2);
  assert.equal(ranked.every(item => item.relevance.score >= 0 && item.relevance.score <= 1), true);
});
