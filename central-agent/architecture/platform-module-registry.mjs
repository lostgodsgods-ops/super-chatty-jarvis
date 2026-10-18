/**
 * Canonical inventory of Super Chatty / Project Lost Cypher platform modules.
 *
 * Status labels describe repository implementation evidence, not user-facing promises.
 * No module is marked production-verified merely because source code exists.
 */
export const PLATFORM_MODULES = Object.freeze([
  Object.freeze({ id: "owner-control", label: "Owner Control and Takeover", status: "partial", productionVerified: false, scope: "Authenticated takeover API, persistent control state, owner rule registry, emergency stop and audit.", next: "Wire policy enforcement into task/agent execution; verify real owner session, D1, audit and staging end-to-end." }),
  Object.freeze({ id: "chat-core", label: "Chat Core and Conversation", status: "partial", productionVerified: false, scope: "Mobile-first conversation UI and backend chat routing.", next: "Verify live provider responses, error handling and regression behavior on the deployed phone UI." }),
  Object.freeze({ id: "voice", label: "Hindi-English Voice Pipeline", status: "partial", productionVerified: false, scope: "Speech input/output and single microphone pipeline.", next: "Preserve the reported working voice flow; run Android microphone permission and end-to-end device tests." }),
  Object.freeze({ id: "memory", label: "Persistent Memory and Retrieval", status: "partial", productionVerified: false, scope: "Owner-scoped memory, retrieval and knowledge-task storage.", next: "Verify D1/KV persistence, access isolation, deletion and retrieval with live integration tests." }),
  Object.freeze({ id: "knowledge-research", label: "Knowledge, Deep Research and Sources", status: "partial", productionVerified: false, scope: "Bounded research cycles, search context and knowledge task queue.", next: "Add evidence-backed research result storage, source validation and end-to-end tests." }),
  Object.freeze({ id: "provider-router", label: "AI Provider Router", status: "partial", productionVerified: false, scope: "Server-side provider capability registry and routing.", next: "Verify provider bindings, secret isolation, timeout/fallback behavior and live provider smoke tests." }),
  Object.freeze({ id: "security-sentinel", label: "Security Gate and Sentinel", status: "partial", productionVerified: false, scope: "Request guard, policy assessment, Sentinel cycle and security event reporting.", next: "Verify D1 probes, alert delivery, failure behavior and production telemetry." }),
  Object.freeze({ id: "agent-orchestration", label: "Agent Orchestration and Task Queue", status: "partial", productionVerified: false, scope: "Agent definitions, bounded task queue, task results and goal lifecycle.", next: "Connect owner takeover and emergency-stop enforcement to all mutating execution paths." }),
  Object.freeze({ id: "scheduled-intel", label: "Scheduled Intelligence / Cron", status: "partial", productionVerified: false, scope: "Scheduled intelligence-cycle worker logic.", next: "Verify deployed cron trigger, idempotency, failure recovery and audit events." }),
  Object.freeze({ id: "pwa-notifications", label: "PWA Push and Phone Notifications", status: "planned", productionVerified: false, scope: "Owner-approved status and emergency notifications on supported devices.", next: "Implement subscription lifecycle, opt-in permission flow, delivery tests and unsubscribe handling." }),
  Object.freeze({ id: "finance-sandbox", label: "Finance and Wallet Sandbox", status: "partial", productionVerified: false, scope: "Simulation-only ledger with integer minor units, balance caps, idempotency keys, owner-authenticated API, D1 persistence and audit events.", next: "Add worker-route integration tests and verify D1 concurrency behavior in staging; live payment rails remain disabled." }),
  Object.freeze({ id: "robotics-iot", label: "Robotics / MQTT / IoT Hooks", status: "partial", productionVerified: false, scope: "Bounded simulator-only command policy; no MQTT broker connection or physical actuation.", next: "Add a separately reviewed broker adapter with device allowlists, scoped credentials, owner approvals, telemetry audit and independent stop controls." }),
  Object.freeze({ id: "backup-recovery", label: "Backup, Rollback and Recovery", status: "partial", productionVerified: false, scope: "Recovery concepts and existing session/task recovery paths.", next: "Add tested owner-controlled restore/rollback flow, integrity checks and recovery drill evidence." }),
  Object.freeze({ id: "android-accessibility", label: "Android Accessibility and Device Permissions", status: "planned", productionVerified: false, scope: "User-granted Android permission integration and clear permission status.", next: "Implement only supported, explicitly granted capabilities and test on the target Android device." })
]);

export function getPlatformModule(id) {
  if (typeof id !== "string") return null;
  return PLATFORM_MODULES.find(module => module.id === id) ?? null;
}

export function getPlatformModuleSummary() {
  const byStatus = {};
  for (const module of PLATFORM_MODULES) byStatus[module.status] = (byStatus[module.status] || 0) + 1;
  return { total: PLATFORM_MODULES.length, byStatus };
}
