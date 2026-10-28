import { readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED = new Set(["implemented", "configured", "live_verified", "blocked", "not_implemented", "not_tested"]);
const REQUIRED_INTEGRATIONS = [
  "CORE-EDGE", "CORE-PY", "CORE-AUTH", "CORE-D1", "CORE-KV", "CORE-DO",
  "CORE-AI", "SEARCH", "OBS", "PWA", "GITHUB-CI", "AGENTS"
];

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

export async function validateReleasePackage() {
  const errors = [];
  const [manifest, registry, agentRegistry] = await Promise.all([
    readJson("docs/redultron-release-package.json"),
    readJson("docs/integration-registry.json"),
    readJson("config/agent-registry.json")
  ]);

  if (manifest.schemaVersion !== 1) errors.push("Unsupported release manifest schemaVersion");
  if (manifest.packageName !== "REDULTRON CORE 3.0 Release Readiness Bundle") errors.push("Unexpected packageName");
  if (registry.schemaVersion !== 1 || registry.project !== "REDULTRON CORE 3.0") errors.push("Integration registry identity/schema mismatch");
  if (registry.policy?.registryIsProofOfLiveOperation !== false) errors.push("Registry must not claim to prove live operation");
  if (registry.policy?.secretsMayBeStored !== false) errors.push("Package must explicitly prohibit storing secrets");
  if (registry.policy?.productionChangesRequireExplicitApproval !== true) errors.push("Production approval policy must be enabled");

  const ids = new Set();
  for (const item of registry.integrations ?? []) {
    if (ids.has(item.id)) errors.push("Duplicate integration id: " + item.id);
    ids.add(item.id);
    for (const layer of ["implementation", "configuration", "production"]) {
      if (!ALLOWED.has(item.layers?.[layer])) errors.push(item.id + " has invalid " + layer + " status");
    }
    if (!Array.isArray(item.evidence) || typeof item.nextAction !== "string" || !item.nextAction.trim()) {
      errors.push(item.id + " is missing evidence or nextAction");
    }
  }
  for (const id of REQUIRED_INTEGRATIONS) {
    if (!ids.has(id)) errors.push("Missing required integration: " + id);
  }

  const counts = agentRegistry.counts ?? {};
  const actualAgentCount = Array.isArray(agentRegistry.agents) ? agentRegistry.agents.length : -1;
  if (counts.total !== actualAgentCount) errors.push("Agent catalog total does not match actual agent entries");
  const groupSum = ["groupA", "groupB", "groupC", "groupD"].reduce((sum, key) => sum + Number(counts[key] || 0), 0);
  if (groupSum !== counts.total) errors.push("Agent group counts do not sum to catalog total");
  if (agentRegistry.runtime?.agentsProvisioned !== 0) errors.push("This readiness package expects agent provisioning to remain explicitly unverified");
  if (agentRegistry.runtime?.automaticDispatchEnabled !== false) errors.push("Automatic agent dispatch must remain disabled until pilot gates pass");

  const snapshot = registry.agentRuntimeSnapshot ?? {};
  if (snapshot.registeredAgents !== counts.total) errors.push("Integration registry agent snapshot does not match catalog");
  if (snapshot.provisionedAgents !== agentRegistry.runtime?.agentsProvisioned) errors.push("Agent provisioned count differs between registries");
  if (snapshot.automaticDispatchEnabled !== agentRegistry.runtime?.automaticDispatchEnabled) errors.push("Agent dispatch flag differs between registries");

  for (const artifact of manifest.includedArtifacts ?? []) {
    try { await access(resolve(ROOT, artifact)); }
    catch { errors.push("Missing package artifact: " + artifact); }
  }
  for (const gate of manifest.releaseGates ?? []) {
    if (!gate.id || !gate.name || gate.required !== true) errors.push("Release gate must have id, name and required=true");
  }

  const blockedIntegrations = (registry.integrations ?? [])
    .filter(item => item.layers?.production === "blocked" || item.layers?.configuration === "blocked")
    .map(item => item.id);
  const notVerifiedIntegrations = (registry.integrations ?? [])
    .filter(item => item.layers?.production !== "live_verified")
    .map(item => item.id);
  const productionCertified = errors.length === 0 &&
    notVerifiedIntegrations.length === 0 &&
    (manifest.releaseGates ?? []).every(gate => gate.status === "passed");

  return {
    ok: errors.length === 0,
    releaseState: errors.length ? "PACKAGE_INVALID" :
      productionCertified ? "PRODUCTION_CERTIFIED" : "PACKAGE_VALIDATED_WITH_BLOCKERS",
    packageName: manifest.packageName,
    packageVersion: manifest.packageVersion,
    integrationCount: registry.integrations?.length ?? 0,
    registeredAgents: counts.total,
    provisionedAgents: agentRegistry.runtime?.agentsProvisioned ?? null,
    automaticDispatchEnabled: agentRegistry.runtime?.automaticDispatchEnabled ?? null,
    blockedIntegrations,
    notVerifiedIntegrations,
    productionCertified,
    releaseGateCount: manifest.releaseGates?.length ?? 0,
    errors
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await validateReleasePackage();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
