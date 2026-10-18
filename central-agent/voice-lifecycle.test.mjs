import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../jarvis/index.html", import.meta.url), "utf8");
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join("\n");

test("voice recognition has a single-start lock before browser onstart fires", () => {
  assert.match(script, /recognitionStarting/);
  assert.match(script, /state\.recognitionStarting\s*=\s*true/);
});

test("voice retry timers are deduplicated and cancelled when hands-free stops", () => {
  assert.match(script, /function scheduleListeningRetry\(/);
  assert.match(script, /clearTimeout\(state\.recognitionRetryTimer\)/);
  assert.match(script, /state\.recognitionRetryTimer\s*=\s*0/);
});

test("speech recognition callbacks from stale instances cannot restart listening", () => {
  assert.match(script, /state\.recognition\s*!==\s*recognition/);
});

test("network and service failures use bounded backoff instead of infinite rapid restarts", () => {
  assert.match(script, /recognitionRetryCount/);
  assert.match(script, /MAX_RECOGNITION_RETRIES/);
  assert.match(script, /network/);
  assert.match(script, /Math\.min\([^\n]*8000/);
});

test("voice stop cancels pending retries before aborting recognition", () => {
  assert.match(script, /function stopHandsFree\([\s\S]*?clearTimeout\(state\.recognitionRetryTimer\)/);
});
