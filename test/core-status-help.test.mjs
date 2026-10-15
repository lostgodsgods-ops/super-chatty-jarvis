import test from "node:test";
import assert from "node:assert/strict";
import { parseBossCommand } from "../staging/modules.mjs";

test("recognizes a read-only status command in English and Hinglish", () => {
  assert.deepEqual(parseBossCommand("Jarvis, show system status"), {
    intent: "system_status", goal: "", requiresTaskApproval: false
  });
  assert.equal(parseBossCommand("Chatty, status dikhao").intent, "system_status");
});

test("recognizes help commands without creating a mission", () => {
  assert.equal(parseBossCommand("Jarvis, help").intent, "help");
  assert.equal(parseBossCommand("Chatty, kya kar sakte ho").intent, "help");
});
