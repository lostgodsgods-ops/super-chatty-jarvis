/**
 * Provider-neutral quantum execution boundary.
 * A provider must be injected by trusted server code; no credentials are read
 * from user input. Classical fallback is explicit and result metadata identifies it.
 */
const MAX_QUBITS = 24;
const MAX_SHOTS = 10000;
const MAX_TIMEOUT_MS = 5000;

export class QuantumAdapterError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "QuantumAdapterError";
    this.code = code;
    this.status = status;
  }
}

export function validateQuantumJob(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) {
    throw new QuantumAdapterError("QUANTUM_JOB_INVALID");
  }
  if (!Number.isInteger(job.qubits) || job.qubits < 1 || job.qubits > MAX_QUBITS) {
    throw new QuantumAdapterError("QUANTUM_QUBIT_LIMIT_EXCEEDED");
  }
  if (!Number.isInteger(job.shots) || job.shots < 1 || job.shots > MAX_SHOTS) {
    throw new QuantumAdapterError("QUANTUM_SHOT_LIMIT_EXCEEDED");
  }
  if (typeof job.algorithm !== "string" || !/^[a-z0-9_-]{1,48}$/i.test(job.algorithm)) {
    throw new QuantumAdapterError("QUANTUM_ALGORITHM_INVALID");
  }
  return { qubits: job.qubits, shots: job.shots, algorithm: job.algorithm };
}

export async function executeQuantumOrFallback(job, {
  provider,
  classical,
  timeoutMs = 2500
} = {}) {
  const validated = validateQuantumJob(job);
  if (typeof classical !== "function") throw new QuantumAdapterError("CLASSICAL_FALLBACK_REQUIRED", 503);
  const boundedTimeout = Number.isInteger(timeoutMs) ? Math.min(Math.max(timeoutMs, 1), MAX_TIMEOUT_MS) : 2500;

  if (provider && typeof provider.execute === "function") {
    const controller = new AbortController();
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new QuantumAdapterError("QUANTUM_PROVIDER_TIMEOUT", 504));
        }, boundedTimeout);
      });
      const result = await Promise.race([
        Promise.resolve().then(() => provider.execute(validated, { signal: controller.signal })),
        timeout
      ]);
      if (!result || typeof result !== "object" || Array.isArray(result) || result.ok !== true) {
        throw new QuantumAdapterError("QUANTUM_PROVIDER_INVALID_RESPONSE", 502);
      }
      return { ok: true, engine: "quantum-provider", fallbackUsed: false, result };
    } catch (error) {
      const fallbackResult = await classical(validated);
      return {
        ok: true,
        engine: "classical-fallback",
        fallbackUsed: true,
        fallbackReason: error instanceof QuantumAdapterError ? error.code : "QUANTUM_PROVIDER_UNAVAILABLE",
        result: fallbackResult
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const result = await classical(validated);
  return { ok: true, engine: "classical-fallback", fallbackUsed: true, fallbackReason: "QUANTUM_PROVIDER_NOT_CONFIGURED", result };
}
