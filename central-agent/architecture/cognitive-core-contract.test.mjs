import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCognitiveCoreProfile,
  assessCapabilityRequest,
  validateEvidenceRecord
} from "./cognitive-core-contract.mjs";

test("REDULTRON CORE 2.0 declares the three requested design influences without claiming sentience", () => {
  const profile = buildCognitiveCoreProfile();
  assert.equal(profile.identity.name, "REDULTRON CORE 2.0");
  assert.deepEqual(profile.designInfluences.map(item => item.id), ["ultron", "red-queen", "jarvis"]);
  assert.equal(profile.identity.isSentient, false);
  assert.equal(profile.execution.livePhysicalExecution, false);
});

test("core profile exposes perception, planning, memory, verification and orchestration", () => {
  const ids = buildCognitiveCoreProfile().capabilities.map(item => item.id);
  for (const expected of ["perception", "planning", "memory", "verification", "orchestration", "research", "ranking"]) {
    assert.ok(ids.includes(expected), `missing capability: ${expected}`);
  }
});

test("planning is allowed but live physical actuation remains blocked even with owner approval", () => {
  assert.equal(assessCapabilityRequest({ capabilityId: "planning", mode: "plan" }).status, "PLAN_ONLY");
  const live = assessCapabilityRequest({
    capabilityId: "robotics",
    mode: "live",
    ownerApproval: true
  });
  assert.equal(live.allowed, false);
  assert.equal(live.status, "BLOCKED");
  assert.equal(live.reason, "LIVE_PHYSICAL_EXECUTION_DISABLED");
  assert.equal(live.sideEffectsExecuted, false);
});

test("unknown capabilities fail closed", () => {
  const result = assessCapabilityRequest({ capabilityId: "omnipotence", mode: "plan" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "UNKNOWN_CAPABILITY");
});

test("evidence records require a valid HTTP(S) source and bounded factual fields", () => {
  assert.equal(validateEvidenceRecord({
    title: "Cloudflare Workers Cron Triggers",
    url: "https://developers.cloudflare.com/workers/configuration/cron-triggers/",
    retrievedAt: "2026-10-20T00:00:00.000Z",
    claims: ["Cron triggers invoke scheduled Worker handlers."]
  }).valid, true);
  assert.equal(validateEvidenceRecord({
    title: "bad source",
    url: "javascript:alert(1)",
    retrievedAt: "not-a-date",
    claims: []
  }).valid, false);
});

test("Red Queen status endpoint projection includes the canonical cognitive core profile", () => {
  const status = buildRedQueenStatus({});
  assert.equal(status.cognitiveCore.identity.name, "REDULTRON CORE 2.0");
  assert.equal(status.cognitiveCore.execution.livePhysicalExecution, false);
  assert.equal(status.livePhysicalExecution, false);
});
