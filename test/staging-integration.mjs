import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const base = process.env.STAGING_BASE_URL;
const namespace = process.env.STAGING_SESSIONS_KV_ID;
const apiBase = `https://api.cloudflare.com/client/v4/accounts/${account}`;
const cfHeaders = { authorization: `Bearer ${apiToken}`, "content-type": "application/json" };
const origin = base;
const ownerToken = randomBytes(32).toString("base64url");
const sessionKey = "owner-session:" + createHash("sha256").update(ownerToken).digest("base64url");
const sessionUrl = `${apiBase}/storage/kv/namespaces/${namespace}/values/${encodeURIComponent(sessionKey)}?expiration_ttl=3600`;
let sessionCreated = false;
let temporaryGatewayToken = false;
let gatewayToken = process.env.AGENT_GATEWAY_TOKEN || "";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const cfRequest = async (path, method, body) => {
  const response = await fetch(path, {
    method, headers: cfHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.ok && payload.success === true, true,
    `Cloudflare API ${method} failed with HTTP ${response.status}: ${JSON.stringify(payload.errors || [])}`);
  return payload;
};
const call = async (path, method = "GET", body, expected = 200, extraHeaders = {}) => {
  const response = await fetch(new URL(path, base), {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000), cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, expected,
    `${method} ${path}: HTTP ${response.status}; response=${JSON.stringify(payload)}`);
  console.log(`PASS ${method} ${path}: HTTP ${response.status}`);
  return payload;
};

try {
  process.stdout.write(`::add-mask::${ownerToken}\n`);
  const kvResponse = await fetch(sessionUrl, {
    method: "PUT", headers: cfHeaders,
    body: JSON.stringify({ ownerId: 1, credentialId: "staging-integration-test", createdAt: new Date().toISOString() }),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(kvResponse.ok, true, `Could not create temporary staging session: HTTP ${kvResponse.status}`);
  sessionCreated = true;
  console.log("PASS temporary Owner session installed in isolated staging KV");

  if (!gatewayToken) {
    gatewayToken = randomBytes(32).toString("base64url");
    process.stdout.write(`::add-mask::${gatewayToken}\n`);
    await cfRequest(`${apiBase}/workers/scripts/super-chatty-passkey-staging/secrets`, "PUT", {
      name: "AGENT_GATEWAY_TOKEN", type: "secret_text", text: gatewayToken,
    });
    temporaryGatewayToken = true;
    await sleep(3000);
    console.log("PASS temporary gateway token configured privately for integration tests");
  }

  const cookie = `scj_owner_session=${ownerToken}`;
  const status = await call("/auth/status", "GET", undefined, 200, { cookie });
  assert.equal(status.authenticated, true);

  const marker = "SCJ_STAGING_INTEGRATION_" + randomUUID();
  const memory = await call("/memory", "POST", { content: marker, tags: ["integration", "staging"] }, 201, { Origin: origin, cookie });
  assert.equal(memory.memory.content, marker);
  const search = await call("/memory?q=" + encodeURIComponent(marker), "GET", undefined, 200, { cookie });
  assert.ok(search.memories.some(item => item.id === memory.memory.id && item.content === marker));
  const auditCreate = await call("/audit?limit=50", "GET", undefined, 200, { cookie });
  assert.ok(auditCreate.events.some(event => event.action === "memory.created" && event.resourceId === memory.memory.id));
  console.log("PASS authenticated memory create/search and audit write");

  const chat = await call("/api/chat", "POST", {
    message: "Reply briefly in Hindi: say that staging AI is connected.",
    language: "hi-IN",
  }, 200, { Origin: origin, cookie });
  assert.equal(chat.ok, true);
  assert.ok(typeof chat.reply === "string" && chat.reply.trim().length > 0);
  assert.ok(typeof chat.model === "string" && chat.model.length > 0);
  console.log("PASS authenticated live Workers AI chat inference");

  const task = await call("/tasks", "POST", {
    taskType: "read_only_research", payload: { question: "Staging gateway integration test", testOnly: true },
  }, 201, { Origin: origin, cookie });
  assert.equal(task.task.status, "pending_approval");
  const approved = await call(`/tasks/${task.task.id}/approve`, "POST", { approved: true }, 200, { Origin: origin, cookie });
  assert.equal(approved.task.status, "queued");
  const claimed = await call("/tasks/claim", "POST", {}, 200, { "x-agent-gateway-token": gatewayToken });
  assert.equal(claimed.task.id, task.task.id);
  assert.equal(claimed.task.status, "running");
  const result = await call("/results", "POST", {
    taskId: task.task.id, result: { summary: "Temporary authenticated gateway test passed", testOnly: true },
  }, 201, { "x-agent-gateway-token": gatewayToken });
  assert.equal(result.accepted, true);
  const savedResult = await call("/results?taskId=" + encodeURIComponent(task.task.id), "GET", undefined, 200, { cookie });
  assert.ok(savedResult.results.some(item => item.taskId === task.task.id && item.result.testOnly === true));
  console.log("PASS gateway token auth, task approval/claim, result write/read");

  const deleted = await call("/memory/" + encodeURIComponent(memory.memory.id), "DELETE", undefined, 200, { Origin: origin, cookie });
  assert.equal(deleted.deleted, true);
  const auditDelete = await call("/audit?limit=50", "GET", undefined, 200, { cookie });
  assert.ok(auditDelete.events.some(event => event.action === "memory.deleted" && event.resourceId === memory.memory.id));
  console.log("PASS authenticated memory delete and audit event");
} finally {
  const cleanupErrors = [];
  if (sessionCreated) {
    try {
      const response = await fetch(sessionUrl, {
        method: "DELETE", headers: { authorization: `Bearer ${apiToken}` },
        signal: AbortSignal.timeout(30000),
      });
      assert.equal(response.ok, true, `Could not revoke temporary staging session: HTTP ${response.status}`);
      console.log("PASS temporary Owner session revoked");
    } catch (error) { cleanupErrors.push(error); }
  }
  if (temporaryGatewayToken) {
    try {
      await cfRequest(`${apiBase}/workers/scripts/super-chatty-passkey-staging/secrets/AGENT_GATEWAY_TOKEN`, "DELETE");
      console.log("PASS temporary gateway token removed; no persistent token left behind");
    } catch (error) { cleanupErrors.push(error); }
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Staging integration cleanup failed");
}
