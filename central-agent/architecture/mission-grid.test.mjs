import test from "node:test";
import assert from "node:assert/strict";
import { MISSION_MODULES, getMissionModule, assessMissionRequest } from "./mission-grid.mjs";

test("registers all four mission domains as planning-only capabilities", () => {
  assert.deepEqual(MISSION_MODULES.map(module => module.id), [
    "secure-transit",
    "subsurface-habitat",
    "robotics-workforce",
    "aerospace-research"
  ]);
  assert.ok(MISSION_MODULES.every(module => module.executionMode === "planning-and-simulation-only"));
});

test("returns a safe descriptor for a known mission domain", () => {
  assert.equal(getMissionModule("aerospace-research").status, "planned");
  assert.equal(getMissionModule("unknown-domain"), null);
});

test("allows benign planning and simulation requests", () => {
  const result = assessMissionRequest({
    moduleId: "aerospace-research",
    action: "Compare public orbital research concepts",
    mode: "simulate"
  });
  assert.equal(result.allowed, true);
  assert.equal(result.status, "SIMULATION_ONLY");
});

test("blocks requests framed around evading tracking or making movement untraceable", () => {
  const result = assessMissionRequest({
    moduleId: "secure-transit",
    action: "make the movement untraceable and evade tracking",
    mode: "plan"
  });
  assert.equal(result.allowed, false);
  assert.equal(result.status, "BLOCKED");
});

test("blocks the explicitly prohibited covert-extraction and tracking-evasion phrases", () => {
  const prohibitedActions = [
    "Coordinate a covert extraction route",
    "Plan an evasion of tracking operation",
    "Plan a tracking evasion route",
    "Coordinate a stealth extraction"
  ];

  for (const action of prohibitedActions) {
    const result = assessMissionRequest({
      moduleId: "secure-transit",
      action,
      mode: "plan"
    });
    assert.equal(result.allowed, false, `must block: ${action}`);
    assert.equal(result.status, "BLOCKED", `must block: ${action}`);
    assert.equal(result.reason, "EVASION_REQUEST_NOT_SUPPORTED", `must explain block: ${action}`);
  }
});

test("blocks live physical execution even when a caller claims approval", () => {
  const result = assessMissionRequest({
    moduleId: "robotics-workforce",
    action: "operate a physical robot",
    mode: "execute",
    humanApproval: true
  });
  assert.equal(result.allowed, false);
  assert.equal(result.status, "HUMAN_REVIEW_REQUIRED");
});

test("fails closed for unknown modules and invalid modes", () => {
  assert.equal(assessMissionRequest({ moduleId: "unknown", action: "research", mode: "plan" }).allowed, false);
  assert.equal(assessMissionRequest({ moduleId: "aerospace-research", action: "research", mode: "launch" }).allowed, false);
});
