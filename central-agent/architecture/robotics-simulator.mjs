/**
 * Simulator-only adapter contract for future robotics / MQTT integrations.
 * This module never connects to a broker or sends physical commands.
 */
const MAX_COORDINATE = 10;
const MAX_SPEED = 1;

export function assessRobotSimulatorCommand(command = {}, {
  ownerAuthenticated = false,
  simulatorConfigured = false,
  emergencyStop = false
} = {}) {
  if (!ownerAuthenticated) return { allowed: false, reason: "OWNER_AUTH_REQUIRED", executionMode: "simulation-only", sideEffectsExecuted: false };
  if (command.action === "status") {
    return { allowed: true, reason: "SIMULATOR_STATUS_ONLY", executionMode: "simulation-only", sideEffectsExecuted: false };
  }
  if (command.action === "stop") {
    return { allowed: true, reason: "SIMULATED_STOP_ACCEPTED", executionMode: "simulation-only", sideEffectsExecuted: false };
  }
  if (emergencyStop) return { allowed: false, reason: "EMERGENCY_STOP_ACTIVE", executionMode: "simulation-only", sideEffectsExecuted: false };
  if (!simulatorConfigured) return { allowed: false, reason: "SIMULATOR_NOT_CONFIGURED", executionMode: "simulation-only", sideEffectsExecuted: false };
  if (command.action !== "move-simulated") {
    return { allowed: false, reason: "UNSUPPORTED_SIMULATOR_COMMAND", executionMode: "simulation-only", sideEffectsExecuted: false };
  }
  if (![command.x, command.y, command.speed].every(Number.isFinite) ||
      command.speed <= 0 || command.speed > MAX_SPEED) {
    return { allowed: false, reason: "INVALID_SIMULATION_PARAMETERS", executionMode: "simulation-only", sideEffectsExecuted: false };
  }
  if (Math.abs(command.x) > MAX_COORDINATE || Math.abs(command.y) > MAX_COORDINATE) {
    return { allowed: false, reason: "SIMULATION_BOUNDS_EXCEEDED", executionMode: "simulation-only", sideEffectsExecuted: false };
  }
  return {
    allowed: true,
    reason: "SIMULATED_MOVEMENT_ACCEPTED",
    executionMode: "simulation-only",
    sideEffectsExecuted: false,
    simulatedCommand: { action: command.action, x: command.x, y: command.y, speed: command.speed }
  };
}
