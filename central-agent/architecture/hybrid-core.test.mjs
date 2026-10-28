import test from "node:test";
import assert from "node:assert/strict";
import { executeHybridTask, validateHybridTask, validateHybridResultSchema, inspectHybridCoreConfiguration, HybridCoreError } from "./hybrid-core.mjs";

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

test("hybrid configuration diagnostics are sanitized and never prove runtime reachability", () => {
  const secret = "owner-secret-test-value-at-least-32-characters";
  const endpoint = "https://private-sidecar.example/v1/execute";
  const diagnostics = inspectHybridCoreConfiguration({
    PYTHON_CORE_URL: endpoint,
    OWNER_SECRET: secret
  });
  assert.deepEqual(diagnostics, {
    provider: "python",
    endpointConfigured: true,
    endpointValid: true,
    ownerSecretConfigured: true,
    ownerSecretPolicyValid: true,
    readyForRequest: true,
    failureCode: null,
    runtimeReachabilityVerified: false,
    ownerSecretMatchVerified: false
  });
  const serialized = JSON.stringify(diagnostics);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(endpoint), false);
  assert.equal(serialized.includes("private-sidecar.example"), false);
});

test("hybrid configuration diagnostics distinguish invalid URL and short secret without exposing either", () => {
  const secret = "too-short";
  const endpoint = "http://private-sidecar.example/v1/execute?token=hidden";
  const diagnostics = inspectHybridCoreConfiguration({
    PYTHON_CORE_URL: endpoint,
    OWNER_SECRET: secret
  });
  assert.equal(diagnostics.provider, "python");
  assert.equal(diagnostics.endpointConfigured, true);
  assert.equal(diagnostics.endpointValid, false);
  assert.equal(diagnostics.ownerSecretConfigured, true);
  assert.equal(diagnostics.ownerSecretPolicyValid, false);
  assert.equal(diagnostics.readyForRequest, false);
  assert.equal(diagnostics.failureCode, "HYBRID_CORE_URL_INVALID");
  assert.equal(diagnostics.runtimeReachabilityVerified, false);
  assert.equal(diagnostics.ownerSecretMatchVerified, false);
  assert.equal(JSON.stringify(diagnostics).includes(secret), false);
  assert.equal(JSON.stringify(diagnostics).includes(endpoint), false);
});

test("short owner secrets fail before any upstream request", async () => {
  let called = false;
  await assert.rejects(
    executeHybridTask(
      { task: "summarize", text: "Hello." },
      { PYTHON_CORE_URL: "https://python.example/v1/execute", OWNER_SECRET: "too-short" },
      { fetchImpl: async () => { called = true; } }
    ),
    error => error.code === "HYBRID_CORE_SECRET_INVALID"
  );
  assert.equal(called, false);
});

test("owner secrets with surrounding whitespace fail closed before any upstream request", async () => {
  const secret = ` ${"x".repeat(32)} `;
  const env = { PYTHON_CORE_URL: "https://python.example/v1/execute", OWNER_SECRET: secret };
  const diagnostics = inspectHybridCoreConfiguration(env);
  assert.equal(diagnostics.ownerSecretConfigured, true);
  assert.equal(diagnostics.ownerSecretPolicyValid, false);
  assert.equal(diagnostics.readyForRequest, false);
  assert.equal(diagnostics.failureCode, "HYBRID_CORE_SECRET_INVALID");
  assert.equal(JSON.stringify(diagnostics).includes(secret), false);

  let called = false;
  await assert.rejects(
    executeHybridTask({ task: "summarize", text: "Hello." }, env, {
      fetchImpl: async () => { called = true; return new Response("{}", { status: 200 }); }
    }),
    error => error.code === "HYBRID_CORE_SECRET_INVALID"
  );
  assert.equal(called, false);
});

test("owner secrets containing line breaks fail closed before any upstream request", async () => {
  const secret = "x".repeat(16) + "\\n" + "x".repeat(16);
  const env = { PYTHON_CORE_URL: "https://python.example/v1/execute", OWNER_SECRET: secret };
  const diagnostics = inspectHybridCoreConfiguration(env);
  assert.equal(diagnostics.ownerSecretPolicyValid, false);
  assert.equal(diagnostics.failureCode, "HYBRID_CORE_SECRET_INVALID");
  let called = false;
  await assert.rejects(
    executeHybridTask({ task: "summarize", text: "Hello." }, env, {
      fetchImpl: async () => { called = true; return new Response("{}", { status: 200 }); }
    }),
    error => error.code === "HYBRID_CORE_SECRET_INVALID"
  );
  assert.equal(called, false);
});

test("shared task result schema accepts only the documented per-task shapes", () => {
  assert.equal(validateHybridResultSchema("summarize", "summary"), true);
  assert.equal(validateHybridResultSchema("extract_keywords", [{ term: "worker", count: 2 }]), true);
  assert.equal(validateHybridResultSchema("classify_text", { labels: ["general"], characters: 8 }), true);
  assert.equal(validateHybridResultSchema("summarize", { summary: "wrong shape" }), false);
  assert.equal(validateHybridResultSchema("extract_keywords", "wrong shape"), false);
  assert.equal(validateHybridResultSchema("classify_text", []), false);
  assert.equal(validateHybridResultSchema("unknown", "anything"), false);
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
    { PYTHON_CORE_URL: "https://python.example/v1/execute", OWNER_SECRET: "secret-value-not-for-client-at-least-32" },
    { fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ ok: true, task: "summarize", result: "A safe bounded task." }), { status: 200 });
    } }
  );
  assert.equal(request.url, "https://python.example/v1/execute");
  assert.equal(request.options.headers["x-owner-secret"], "secret-value-not-for-client-at-least-32");
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


test("forwards a validated correlation ID and attaches it to upstream auth failures", async () => {
  const requestId = "diag-test-12345678";
  const env = { PYTHON_CORE_URL: "https://python.example/v1/execute", OWNER_SECRET: "x".repeat(32) };
  let request;
  await assert.rejects(
    executeHybridTask({ task: "summarize", text: "Hi." }, env, {
      requestId,
      fetchImpl: async (url, options) => {
        request = { url, options };
        return new Response("{}", { status: 401 });
      }
    }),
    error => error.code === "HYBRID_CORE_AUTH_REJECTED" &&
      error.upstreamStatus === 401 && error.requestId === requestId
  );
  assert.equal(request.options.headers["x-request-id"], requestId);
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


test("accepts each task's documented result type and rejects cross-task schema mismatches", async () => {
  const env = { PYTHON_CORE_URL: "https://python.example/v1/execute", OWNER_SECRET: "x".repeat(32) };
  const cases = [
    ["summarize", "A short summary."],
    ["extract_keywords", [{ term: "worker", count: 2 }]],
    ["classify_text", { labels: ["technical_issue"], characters: 20 }]
  ];
  for (const [task, value] of cases) {
    const result = await executeHybridTask({ task, text: "A valid input." }, env, {
      fetchImpl: async () => new Response(JSON.stringify({ ok: true, task, result: value }), { status: 200 })
    });
    assert.deepEqual(result.result, value);
  }
  for (const [task, value] of [
    ["summarize", { wrong: true }],
    ["extract_keywords", "not-an-array"],
    ["classify_text", []]
  ]) {
    await assert.rejects(
      executeHybridTask({ task, text: "A valid input." }, env, {
        fetchImpl: async () => new Response(JSON.stringify({ ok: true, task, result: value }), { status: 200 })
      }),
      error => error.code === "HYBRID_CORE_INVALID_RESPONSE"
    );
  }
});


test("uses an explicitly configured PHP Core endpoint and identifies the selected engine", async () => {
  let requestedUrl = "";
  const result = await executeHybridTask(
    { task: "summarize", text: "PHP sidecar contract." },
    { PHP_CORE_URL: "https://php.example/v1/execute", OWNER_SECRET: "secret-value-with-at-least-32-characters" },
    { fetchImpl: async (url) => {
      requestedUrl = url;
      return new Response(JSON.stringify({ ok: true, task: "summarize", result: "PHP sidecar contract." }), { status: 200 });
    } }
  );
  assert.equal(requestedUrl, "https://php.example/v1/execute");
  assert.equal(result.engine, "php-edge-hybrid");
});

test("does not silently fall back to Python when an explicitly selected PHP endpoint is invalid", async () => {
  let called = false;
  await assert.rejects(
    executeHybridTask(
      { task: "summarize", text: "Do not bypass invalid PHP configuration." },
      {
        PHP_CORE_URL: "http://php.example/v1/execute",
        PYTHON_CORE_URL: "https://python.example/v1/execute",
        OWNER_SECRET: "secret-value-with-at-least-32-characters"
      },
      { fetchImpl: async () => { called = true; } }
    ),
    error => error.code === "HYBRID_CORE_URL_INVALID"
  );
  assert.equal(called, false);
});


test("rejects redirects for sidecar calls so the owner secret cannot be forwarded to another origin", async () => {
  let request;
  const env = {
    PYTHON_CORE_URL: "https://python.example/v1/execute",
    OWNER_SECRET: "synthetic-owner-secret-for-redirect-test-32chars"
  };
  await assert.rejects(
    executeHybridTask({ task: "summarize", text: "Bounded redirect test." }, env, {
      fetchImpl: async (url, options) => {
        request = { url, options };
        return new Response(null, {
          status: 302,
          headers: { location: "https://redirect-target.example/collect" }
        });
      }
    }),
    error => error.code === "HYBRID_CORE_UPSTREAM_FAILED" && error.upstreamStatus === 302
  );
  assert.equal(request.options.redirect, "error",
    "sidecar fetch must reject redirects instead of forwarding the owner-secret header");
  assert.equal(request.options.headers["x-owner-secret"], env.OWNER_SECRET);
  assert.equal(request.options.headers.authorization, undefined);
});
