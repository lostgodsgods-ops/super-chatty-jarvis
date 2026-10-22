import test from "node:test";
import assert from "node:assert/strict";
import { executeQuantumOrFallback, validateQuantumJob } from "./quantum-adapter.mjs";

const job = { qubits: 3, shots: 100, algorithm: "qaoa" };
const classical = async input => ({ value: input.qubits * input.shots });

test("validates bounded quantum jobs", () => {
  assert.deepEqual(validateQuantumJob(job), job);
  assert.throws(() => validateQuantumJob({ ...job, qubits: 100 }), e => e.code === "QUANTUM_QUBIT_LIMIT_EXCEEDED");
  assert.throws(() => validateQuantumJob({ ...job, shots: 100000 }), e => e.code === "QUANTUM_SHOT_LIMIT_EXCEEDED");
  assert.throws(() => validateQuantumJob(null), e => e.code === "QUANTUM_JOB_INVALID");
});

test("uses provider result when provider returns valid result", async () => {
  const result = await executeQuantumOrFallback(job, {
    provider: { execute: async () => ({ ok: true, counts: { "010": 50 } }) },
    classical
  });
  assert.equal(result.engine, "quantum-provider");
  assert.equal(result.fallbackUsed, false);
});

test("falls back classically when provider is absent", async () => {
  const result = await executeQuantumOrFallback(job, { classical });
  assert.equal(result.engine, "classical-fallback");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.result.value, 300);
});

test("falls back classically when provider throws", async () => {
  const result = await executeQuantumOrFallback(job, {
    provider: { execute: async () => { throw new Error("offline"); } }, classical
  });
  assert.equal(result.engine, "classical-fallback");
  assert.equal(result.fallbackReason, "QUANTUM_PROVIDER_UNAVAILABLE");
});

test("falls back classically when provider times out", async () => {
  const result = await executeQuantumOrFallback(job, {
    provider: { execute: () => new Promise(() => {}) }, classical, timeoutMs: 5
  });
  assert.equal(result.engine, "classical-fallback");
  assert.equal(result.fallbackReason, "QUANTUM_PROVIDER_TIMEOUT");
});

test("requires a classical fallback", async () => {
  await assert.rejects(() => executeQuantumOrFallback(job), e => e.code === "CLASSICAL_FALLBACK_REQUIRED");
});
