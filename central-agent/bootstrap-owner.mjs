/**
 * Retry-safe one-time owner-password bootstrap for the Cloudflare Worker.
 * Transient edge propagation errors are retried; authentication/configuration
 * errors fail closed. Passwords and setup tokens are never logged.
 */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runOwnerBootstrap({
  base,
  setupToken,
  password,
  fetchImpl = fetch,
  sleep = defaultSleep,
  maxAttempts = 8,
  baseDelayMs = 2000,
  maxDelayMs = 10000,
  log = () => {},
  fail = message => { throw new Error(message); }
}) {
  if (!base || !setupToken) return fail("Missing Central Agent URL or owner setup token.");
  if (!password) return fail("Missing CENTRAL_AGENT_OWNER_PASSWORD; owner authentication cannot be bootstrapped.");

  const endpoint = path => new URL(path, base);
  const pause = async attempt => {
    const delay = Math.min(baseDelayMs * attempt, maxDelayMs);
    log(`Transient Worker response; retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts}).`);
    await sleep(delay);
  };

  let setupRequired;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(endpoint("/auth/status"), { cache: "no-store" });
    } catch {
      if (attempt === maxAttempts) return fail("Owner setup status check failed after retrying transient network errors.");
      await pause(attempt);
      continue;
    }
    if (response.ok) {
      let status;
      try { status = await response.json(); } catch {
        return fail("Owner setup status response was invalid JSON.");
      }
      if (status.setupRequired === false) {
        log("Owner password is already configured; one-time bootstrap skipped.");
        return { outcome: "already-configured" };
      }
      if (status.setupRequired !== true) return fail("Owner setup status response was not recognized.");
      setupRequired = true;
      break;
    }
    if (!RETRYABLE.has(response.status)) {
      return fail(`Owner setup status check failed with HTTP ${response.status}; response body withheld.`);
    }
    if (attempt === maxAttempts) {
      return fail(`Owner setup status check remained unavailable after ${maxAttempts} attempts (HTTP ${response.status}).`);
    }
    await pause(attempt);
  }

  if (!setupRequired) return fail("Owner setup state could not be determined.");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(endpoint("/auth/setup"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken, password })
      });
    } catch {
      if (attempt === maxAttempts) return fail("Owner bootstrap failed after retrying transient network errors.");
      await pause(attempt);
      continue;
    }

    if (response.status === 201) {
      log("Owner password bootstrap completed (HTTP 201).");
      return { outcome: "created" };
    }
    if (response.status === 409) {
      // Another attempt may have succeeded even if its response was lost.
      try {
        const statusResponse = await fetchImpl(endpoint("/auth/status"), { cache: "no-store" });
        if (statusResponse.ok && (await statusResponse.json()).setupRequired === false) {
          log("Owner password is configured; bootstrap verified after HTTP 409.");
          return { outcome: "already-configured" };
        }
      } catch {}
      return fail("Owner bootstrap returned HTTP 409 but setup status could not verify the configured password.");
    }
    if (!RETRYABLE.has(response.status)) {
      return fail(`Owner bootstrap failed with HTTP ${response.status}; response body withheld.`);
    }
    if (attempt === maxAttempts) {
      return fail(`Owner bootstrap remained unavailable after ${maxAttempts} attempts (HTTP ${response.status}); response body withheld.`);
    }
    await pause(attempt);
  }
  return fail("Owner bootstrap ended without a verified result.");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    await runOwnerBootstrap({
      base: process.env.CENTRAL_AGENT_URL,
      setupToken: process.env.OWNER_SETUP_TOKEN,
      password: process.env.OWNER_PASSWORD,
      log: message => console.log(message)
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Owner bootstrap failed.");
    process.exitCode = 1;
  }
}
