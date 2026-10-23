import test from "node:test";
import assert from "node:assert/strict";
import { executeHybridTask, validateHybridTask, HybridCoreError } from "./hybrid-core.mjs";

test("hybrid tasks are allowlisted and bounded before any network request", () => {
  assert.deepEqual(validateHybridTask({ task: "summarize", text: " facts " }), { task: "summarize", text: "facts" });
  assert.throws(() => validateHybridTask({ task: "execute_shell", text: "whoami" }), error => error.code === "HYBRID_TASK_NOT_ALLOWED");
  assert.throws(() => validateHybridTask({ task: "summarize", text: " " }), error => error.code === "HYBRID_TEXT_LENGTH_INVALID");
  assert.throws(() => validateHybridTask({ task: "summarize", text: "x".repeat(16001) }), error => error.code === "HYBRID_TEXT_LENGTH_INVALID");
});

test("missing Python URL or OWNER_SECRET fails closed without fetching", async () => {
  let called = false;
  await assert.rejects(
    executeHybridTask({ task: "summarize", text: "Hello." }, {}, { fetchImpl: async () => { called = true; } }),
    error => error instanceof HybridCoreError && error.code === "HYBRID_CORE_NOT_CONFIGURED"
  );
  assert.equal(called, false);
});

test("Python endpoint must be HTTPS and cannot embed credentials or query strings", async () => {
  for (const endpoint of ["http://python.example/v1/execute", "https://user:pass@python.example/execute", "https://python.example/execute?token=x"]) {
    await assert.rejects(
      executeHybridTask({ task: "summarize", text: "Hello." }, { PYTHON_CORE_URL: endpoint, OWNER_SECRET: "x".repeat(32) }),
      error => error.code === "HYBRID_CORE_URL_INVALID"
    );
  }
});

test("sends server-side owner secret and a browser-compatible user agent, and validates Python response contract", async () => {
  let request;
  const result = await executeHybridTask(
    { task: "summarize", text: "A safe bounded task." },
    { PYTHON_CORE_URL: "https://python.example/v1/execute", OWNER_SECRET: "secret-value-not-for-client" },
    { fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ ok: true, task: "summarize", result: "A safe bounded task." }), { status: 200 });
    } }
  );
  assert.equal(request.url, "https://python.example/v1/execute");
  assert.equal(request.options.headers["x-owner-secret"], "secret-value-not-for-client");
  assert.match(request.options.headers["user-agent"], /^REDULTRON-HybridCore\//);
  assert.equal(request.options.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(request.options.body), { task: "summarize", text: "A safe bounded task." });
  assert.deepEqual(result, { ok: true, engine: "python-edge-hybrid", task: "summarize", result: "A safe bounded task." });
});

test("upstream auth failures and invalid payloads become safe structured errors", async () => {
  await assert.rejects(
    executeHybridTask({ task: "summarize", text: "Hi." }, { PYTHON_CORE_URL: "https://python.example/v1/execute", OWNER_SECRET: "x".repeat(32) }, { fetchImpl: async () => new Response("{}", { status: 401 }) }),
    error => error.code === "HYBRID_CORE_AUTH_REJECTED"
  );
  await assert.rejects(
    executeHybridTask({ task: "summarize", text: "Hi." }, { PYTHON_CORE_URL: "https://python.example/v1/execute", OWNER_SECRET: "x".repeat(32) }, { fetchImpl: async () => new Response(JSON.stringify({ ok: true, task: "classify_text", result: {} }), { status: 200 }) }),
    error => error.code === "HYBRID_CORE_INVALID_RESPONSE"
  );
});

test("non-2xx upstream failures retain HTTP status for sanitized diagnostics", async () => {
  await assert.rejects(
    executeHybridTask(
      { task: "summarize", text: "Hi." },
      { PYTHON_CORE_URL: "https://python.example/v1/execute", OWNER_SECRET: "x".repeat(32) },
      { fetchImpl: async () => new Response("{}", { status: 404 }) }
    ),
    error => error.code === "HYBRID_CORE_UPSTREAM_FAILED" && error.upstreamStatus === 404
  );
});
