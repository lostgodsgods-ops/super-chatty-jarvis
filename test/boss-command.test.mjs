import test from "node:test";
import assert from "node:assert/strict";
import { parseBossCommand } from "../staging/modules.mjs";

test("recognizes explicit English mission creation commands without approving tasks", () => {
  const command = parseBossCommand("Jarvis, create a mission to review my staging worker");
  assert.equal(command.intent, "create_mission");
  assert.equal(command.goal, "review my staging worker");
  assert.equal(command.requiresTaskApproval, true);
});

test("recognizes Hindi/Hinglish mission creation commands", () => {
  const command = parseBossCommand("Chatty, ek mission banao ki staging worker ka security review karo");
  assert.equal(command.intent, "create_mission");
  assert.match(command.goal, /staging worker ka security review karo/i);
  assert.equal(command.requiresTaskApproval, true);
});

test("does not treat ordinary conversation as an execution command", () => {
  const command = parseBossCommand("I am thinking about a new mission idea");
  assert.equal(command.intent, "chat");
  assert.equal(command.goal, "");
});

test("rejects empty or overlong mission command payloads safely", () => {
  assert.equal(parseBossCommand("Jarvis, create a mission").intent, "chat");
  const command = parseBossCommand("create a mission to " + "x".repeat(7000));
  assert.equal(command.intent, "chat");
});
