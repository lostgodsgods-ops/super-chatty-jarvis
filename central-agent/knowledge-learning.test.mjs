import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeVerifiedKnowledge, saveVerifiedKnowledge, searchVerifiedKnowledge } from "./knowledge-learning.mjs";

const valid = {
  title: "Cloudflare Worker authentication fix",
  problem: "Owner-only route returned an unauthorized response.",
  solution: "Validate the owner session before reading private knowledge.",
  sources: [{ title: "Cloudflare Workers docs", url: "https://developers.cloudflare.com/workers/" }],
  testsPassed: true,
  testSummary: "Focused unit tests passed.",
  testEvidence: ["node --test central-agent/knowledge-learning.test.mjs: PASS"],
  confidence: 0.9,
  limitations: "Mock D1 only; production not verified.",
  reuseInstructions: "Re-run route-specific auth tests before reuse."
};

test("verified knowledge requires a real HTTPS source and explicit test evidence", () => {
  assert.equal(normalizeVerifiedKnowledge(valid).ok, true);
  assert.equal(normalizeVerifiedKnowledge({ ...valid, testsPassed: false }).error, "VERIFIED_TEST_EVIDENCE_REQUIRED");
  assert.equal(normalizeVerifiedKnowledge({ ...valid, testEvidence: [] }).error, "VERIFIED_TEST_EVIDENCE_REQUIRED");
  assert.equal(normalizeVerifiedKnowledge({ ...valid, sources: [{ url: "http://example.com" }] }).error, "HTTPS_SOURCE_REQUIRED");
});

test("normalization redacts credential-like text and rejects missing core fields", () => {
  const result = normalizeVerifiedKnowledge({ ...valid, solution: "Use api_key=secret-value only server-side" });
  assert.equal(result.ok, true);
  assert.match(result.record.solution, /\[REDACTED\]/);
  assert.equal(normalizeVerifiedKnowledge({ ...valid, title: "" }).error, "TITLE_PROBLEM_SOLUTION_REQUIRED");
});

function mockDb() {
  const state = { inserted: null, schemaCalls: 0, query: null };
  return {
    state,
    prepare(sql) {
      return {
        bind(...args) { this.args = args; return this; },
        async run() {
          if (sql.startsWith("CREATE TABLE") || sql.startsWith("CREATE INDEX")) { state.schemaCalls++; return { meta: { changes: 0 } }; }
          if (sql.includes("INSERT INTO verified_knowledge")) { state.inserted = this.args; return { meta: { changes: 1 } }; }
          throw new Error("Unexpected SQL");
        },
        async all() {
          state.query = { sql, args: this.args };
          return { results: [{
            id: "saved-1", title: valid.title, problem: valid.problem, solution: valid.solution,
            sourcesJson: JSON.stringify(valid.sources), testSummary: valid.testSummary,
            testEvidenceJson: JSON.stringify(valid.testEvidence), confidence: 0.9,
            limitations: valid.limitations, reuseInstructions: valid.reuseInstructions,
            status: "verified", createdAt: "2026-10-29T00:00:00.000Z", updatedAt: "2026-10-29T00:00:00.000Z"
          }] };
        }
      };
    }
  };
}

test("save persists only normalized verified knowledge in owner scope", async () => {
  const db = mockDb();
  const result = await saveVerifiedKnowledge(db, valid);
  assert.equal(result.ok, true);
  assert.equal(result.record.status, "verified");
  assert.equal(db.state.inserted[0].length > 0, true);
  assert.equal(db.state.inserted[1], valid.title);
});

test("retrieval searches only owner-scoped verified records and returns evidence", async () => {
  const db = mockDb();
  const result = await searchVerifiedKnowledge(db, "Cloudflare authentication", 100);
  assert.equal(result.ok, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].status, "verified");
  assert.equal(result.records[0].testEvidence.length, 1);
  assert.match(db.state.query.sql, /owner_scope = 'owner' AND status = 'verified'/);
  assert.equal(db.state.query.args.at(-1), 20);
});

test("private GPT Action OpenAPI contract exposes only the protected knowledge endpoint", () => {
  const specPath = new URL("../openapi/redultron-learning-action.json", import.meta.url);
  const spec = JSON.parse(readFileSync(fileURLToPath(specPath), "utf8"));
  assert.deepEqual(spec.security, [{ BearerAuth: [] }]);
  assert.ok(spec.paths["/api/learning/knowledge"].get);
  assert.ok(spec.paths["/api/learning/knowledge"].post);
  assert.equal(spec.components.securitySchemes.BearerAuth.in, "header");
  assert.equal(spec.components.securitySchemes.BearerAuth.name, "Authorization");
  assert.equal(spec.components.schemas.KnowledgeInput.properties.testsPassed.const, true);
  assert.equal(spec.components.schemas.KnowledgeInput.properties.sources.minItems, 1);
});
