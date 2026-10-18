import test from "node:test";
import assert from "node:assert/strict";
import { assessRobotSimulatorCommand } from "../central-agent/architecture/robotics-simulator.mjs";

test("simulator denies unauthenticated movement", () => {
  const result = assessRobotSimulatorCommand({ action: "move-simulated", x: 1, y: 1 }, {});
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "OWNER_AUTH_REQUIRED");
});

test("simulator allows bounded simulated movement only with configured capability", () => {
  const result = assessRobotSimulatorCommand(
    { action: "move-simulated", x: 2, y: -1, speed: 0.5 },
    { ownerAuthenticated: true, simulatorConfigured: true, emergencyStop: false }
  );
  assert.equal(result.allowed, true);
  assert.equal(result.executionMode, "simulation-only");
  assert.equal(result.sideEffectsExecuted, false);
});

test("simulator blocks out-of-bounds values and unknown commands", () => {
  assert.equal(assessRobotSimulatorCommand(
    { action: "move-simulated", x: 999, y: 0, speed: 0.5 },
    { ownerAuthenticated: true, simulatorConfigured: true }
  ).reason, "SIMULATION_BOUNDS_EXCEEDED");
  assert.equal(assessRobotSimulatorCommand(
    { action: "launch", x: 0, y: 0 },
    { ownerAuthenticated: true, simulatorConfigured: true }
  ).reason, "UNSUPPORTED_SIMULATOR_COMMAND");
});

test("emergency stop blocks movement and does not permit physical actuation", () => {
  assert.equal(assessRobotSimulatorCommand(
    { action: "move-simulated", x: 0, y: 0, speed: 0.1 },
    { ownerAuthenticated: true, simulatorConfigured: true, emergencyStop: true }
  ).reason, "EMERGENCY_STOP_ACTIVE");
  const stop = assessRobotSimulatorCommand(
    { action: "stop" },
    { ownerAuthenticated: true, simulatorConfigured: true, emergencyStop: false }
  );
  assert.equal(stop.allowed, true);
  assert.equal(stop.sideEffectsExecuted, false);
});
