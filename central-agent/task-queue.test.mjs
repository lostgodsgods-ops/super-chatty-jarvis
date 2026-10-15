import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeKnowledgeQuery,
  validateKnowledgeApproval,
  enqueueKnowledgeTask,
  OWNER_APPROVAL_PHRASE
} from "./task-queue.mjs";

test("knowledge query normalization rejects empty, non-string, and oversized input", () => {
  assert.equal(normalizeKnowledgeQuery("  Cloudflare   Workers  "), "Cloudflare Workers");
  assert.equal(normalizeKnowledgeQuery(""), "");
  assert.equal(normalizeKnowledgeQuery("x".repeat(401)), "");
  assert.equal(normalizeKnowledgeQuery(null), "");
});

test("knowledge queue requires exact action, query, phrase, and a UUID nonce", () => {
  const query = "Cloudflare Workers docs";
  const approval = { approved: true, action: "knowledge_search", query, confirmation: OWNER_APPROVAL_PHRASE, nonce: "550e8400-e29b-41d4-a716-446655440000" };
  assert.equal(validateKnowledgeApproval(query, approval), true);
  assert.equal(validateKnowledgeApproval(query, { ...approval, query: "different query" }), false);
  assert.equal(validateKnowledgeApproval(query, { ...approval, action: "deploy" }), false);
  assert.equal(validateKnowledgeApproval(query, { ...approval, approved: false }), false);
  assert.equal(validateKnowledgeApproval(query, { ...approval, nonce: "replay" }), false);
});

test("task enqueue refuses missing approval before touching storage", async () => {
  let touched = false;
  const env = { DB: { prepare() { touched = true; throw new Error("should not be called"); }, batch() { touched = true; } } };
  const result = await enqueueKnowledgeTask(env, "search this", null);
  assert.equal(result.status, 403);
  assert.equal(result.ok, false);
  assert.equal(touched, false);
});

test("task enqueue fails closed when durable D1 storage is unavailable", async () => {
  const result = await enqueueKnowledgeTask({}, "search this", {
    approved: true, action: "knowledge_search", query: "search this",
    confirmation: OWNER_APPROVAL_PHRASE, nonce: "550e8400-e29b-41d4-a716-446655440000"
  });
  assert.equal(result.status, 503);
  assert.equal(result.ok, false);
});
