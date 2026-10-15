import test from "node:test";
import assert from "node:assert/strict";
import worker from "../staging/worker.mjs";
import { APP_HTML } from "../staging/app.mjs";

const origin = "https://super-chatty-passkey-staging.lostgodsgods.workers.dev";

test("PWA manifest is served with install metadata and icons", async () => {
  const response = await worker.fetch(new Request(origin + "/manifest.webmanifest"), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/manifest\+json/);
  const manifest = await response.json();
  assert.equal(manifest.name, "Super Chatty Jarvis");
  assert.equal(manifest.start_url, "/app");
  assert.ok(manifest.icons.some((icon) => icon.src === "/icon.svg"));
});

test("service worker route serves a scoped JavaScript worker", async () => {
  const response = await worker.fetch(new Request(origin + "/service-worker.js"), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /javascript/);
  const source = await response.text();
  assert.match(source, /addEventListener\(["']install/);
  assert.match(source, /addEventListener\(["']fetch/);
});

test("download and install routes return a usable PWA installation page", async () => {
  for (const path of ["/download", "/app/install"]) {
    const response = await worker.fetch(new Request(origin + path), {});
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    const html = await response.text();
    assert.match(html, /Install Super Chatty Jarvis/);
    assert.match(html, /beforeinstallprompt/);
    assert.match(html, /\/app/);
  }
});

test("voice UI exposes profile selection, PWA registration, and speech fallback", () => {
  assert.match(APP_HTML, /rel="manifest"/);
  assert.match(APP_HTML, /navigator\.serviceWorker\.register/);
  assert.match(APP_HTML, /id="voiceProfile"/);
  for (const profile of ["male", "female", "child", "senior"]) {
    assert.match(APP_HTML, new RegExp('value="' + profile + '"'));
  }
  assert.match(APP_HTML, /speechSynthesis/);
  assert.match(APP_HTML, /onvoiceschanged/);
  assert.match(APP_HTML, /device speech failed/i);
});

test("AI TTS route rejects unauthenticated requests", async () => {
  const response = await worker.fetch(new Request(origin + "/api/tts", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ text: "Hello", language: "en", voiceProfile: "female" }),
  }), { ALLOWED_ORIGIN: origin, AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) } });
  assert.equal(response.status, 401);
});

test("authenticated English AI TTS returns audio and maps male voice preference", async () => {
  let calledModel = "";
  let calledInput;
  const response = await worker.fetch(new Request(origin + "/api/tts", {
    method: "POST",
    headers: { origin, cookie: "scj_owner_session=test-session", "content-type": "application/json" },
    body: JSON.stringify({ text: "Hello Chatty", language: "en-IN", voiceProfile: "male" }),
  }), {
    ALLOWED_ORIGIN: origin,
    CHAT_API_ENABLED: "true",
    AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SESSIONS: { get: async () => JSON.stringify({ ownerId: 1, credentialId: "test" }) },
    AI: { run: async (model, input) => { calledModel = model; calledInput = input; return { audio: Buffer.from("ID3").toString("base64") }; } },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /audio\/mpeg/);
  assert.equal(calledModel, "@cf/deepgram/aura-1");
  assert.equal(calledInput.speaker, "orion");
  assert.equal((await response.arrayBuffer()).byteLength, 3);
});

test("authenticated Hindi AI TTS routes to multilingual speech model", async () => {
  let calledModel = "";
  let calledInput;
  const response = await worker.fetch(new Request(origin + "/api/tts", {
    method: "POST",
    headers: { origin, cookie: "scj_owner_session=test-session", "content-type": "application/json" },
    body: JSON.stringify({ text: "नमस्ते", language: "hi-IN", voiceProfile: "standard" }),
  }), {
    ALLOWED_ORIGIN: origin,
    CHAT_API_ENABLED: "true",
    AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SESSIONS: { get: async () => JSON.stringify({ ownerId: 1, credentialId: "test" }) },
    AI: { run: async (model, input) => { calledModel = model; calledInput = input; return { audio: Buffer.from("ID3").toString("base64") }; } },
  });
  assert.equal(response.status, 200);
  assert.equal(calledModel, "@cf/myshell-ai/melotts");
  assert.equal(calledInput.prompt, "नमस्ते");
  assert.equal(calledInput.lang, "hi");
});


test("authenticated chat uses Workers AI and returns a usable assistant reply", async () => {
  let calledModel = "";
  const response = await worker.fetch(new Request(origin + "/api/chat", {
    method: "POST",
    headers: { origin, cookie: "scj_owner_session=test-session", "content-type": "application/json" },
    body: JSON.stringify({ message: "यह बताओ कि तुम मेरे लिए क्या-क्या कर सकते हो", language: "hi-IN" }),
  }), {
    ALLOWED_ORIGIN: origin,
    CHAT_API_ENABLED: "true",
    CHAT_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SESSIONS: { get: async () => JSON.stringify({ ownerId: 1, credentialId: "test" }) },
    AI: { run: async (model, input) => {
      calledModel = model;
      assert.equal(input.messages[1].content, "यह बताओ कि तुम मेरे लिए क्या-क्या कर सकते हो");
      return { response: "मैं सवालों के जवाब, लेखन, जानकारी और योजना बनाने में मदद कर सकता हूँ।" };
    } },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.match(body.reply, /जवाब/);
  assert.equal(body.model, "@cf/meta/llama-3.1-8b-instruct");
  assert.equal(calledModel, body.model);
});

test("chat falls back to the known staging model when configured model throws", async () => {
  const attempted = [];
  const response = await worker.fetch(new Request(origin + "/api/chat", {
    method: "POST",
    headers: { origin, cookie: "scj_owner_session=test-session", "content-type": "application/json" },
    body: JSON.stringify({ message: "Hello", language: "en-US" }),
  }), {
    ALLOWED_ORIGIN: origin,
    CHAT_API_ENABLED: "true",
    CHAT_MODEL: "@cf/unknown/model",
    AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SESSIONS: { get: async () => JSON.stringify({ ownerId: 1, credentialId: "test" }) },
    AI: { run: async (model) => {
      attempted.push(model);
      if (model === "@cf/unknown/model") throw new Error("provider unavailable");
      return { choices: [{ message: { content: "I can help with questions and planning." } }] };
    } },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.reply, /questions and planning/);
  assert.equal(body.model, "@cf/meta/llama-3.1-8b-instruct");
  assert.deepEqual(attempted, ["@cf/unknown/model", "@cf/meta/llama-3.1-8b-instruct"]);
});

test("chat remains available with an AI binding when optional enable flag is absent", async () => {
  const response = await worker.fetch(new Request(origin + "/api/chat", {
    method: "POST",
    headers: { origin, cookie: "scj_owner_session=test-session", "content-type": "application/json" },
    body: JSON.stringify({ message: "Hello", language: "en-US" }),
  }), {
    ALLOWED_ORIGIN: origin,
    AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SESSIONS: { get: async () => JSON.stringify({ ownerId: 1, credentialId: "test" }) },
    AI: { run: async () => ({ response: "Hello from the staging AI." }) },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reply, "Hello from the staging AI.");
});


test("chat retries on a distinct known-good model when the configured model fails", async () => {
  const attempted = [];
  const response = await worker.fetch(new Request(origin + "/api/chat", {
    method: "POST",
    headers: { origin, cookie: "scj_owner_session=test-session", "content-type": "application/json" },
    body: JSON.stringify({ message: "नमस्ते", language: "hi-IN" }),
  }), {
    ALLOWED_ORIGIN: origin,
    CHAT_API_ENABLED: "true",
    CHAT_MODEL: "@cf/unknown/model",
    AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SESSIONS: { get: async () => JSON.stringify({ ownerId: 1, credentialId: "test" }) },
    AI: { run: async (model) => {
      attempted.push(model);
      if (model === "@cf/unknown/model") throw new Error("unknown configured model");
      if (model === "@cf/meta/llama-3.1-8b-instruct") throw new Error("primary model unavailable");
      return { response: "नमस्ते! मैं आपकी मदद कर सकता हूँ।" };
    } },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.reply, /मदद/);
  assert.equal(body.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.deepEqual(attempted, [
    "@cf/unknown/model",
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  ]);
});


test("chat retries prompt input when chat-message input is rejected", async () => {
  const modes = [];
  const response = await worker.fetch(new Request(origin + "/api/chat", {
    method: "POST",
    headers: { origin, cookie: "scj_owner_session=test-session", "content-type": "application/json" },
    body: JSON.stringify({ message: "नमस्ते", language: "hi-IN" }),
  }), {
    ALLOWED_ORIGIN: origin,
    AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SESSIONS: { get: async () => JSON.stringify({ ownerId: 1, credentialId: "test" }) },
    AI: { run: async (_model, input) => {
      modes.push(input.prompt ? "prompt" : "messages");
      if (input.prompt) return { response: "नमस्ते! मैं आपकी मदद के लिए तैयार हूँ।" };
      throw new Error("messages input rejected");
    } },
  });
  assert.equal(response.status, 200);
  assert.match((await response.json()).reply, /मदद/);
  assert.deepEqual(modes, ["messages", "messages", "messages", "prompt"]);
});


test("voice app persists chat history locally and provides a clear-history control", () => {
  assert.match(APP_HTML, /indexedDB\.open/);
  assert.doesNotMatch(APP_HTML, /localStorage|sessionStorage/);
  assert.match(APP_HTML, /id="historyList"/);
  assert.match(APP_HTML, /id="clearHistory"/);
  assert.match(APP_HTML, /persistConversationMessage/);
  assert.match(APP_HTML, /restoreConversationHistory/);
});

test("service worker caches only the authenticated app shell after a successful response", async () => {
  const response = await worker.fetch(new Request(origin + "/service-worker.js"), {});
  const source = await response.text();
  assert.match(source, /url\.pathname===["']\/app["']/);
  assert.match(source, /cache\.put\(request,response\.clone\(\)\)/);
  assert.match(source, /url\.pathname\.startsWith\(["']\/api\/["']\)/);
  assert.match(source, /caches\.match\(request\)/);
});

test("agent task claiming rejects a wrong gateway token before database access", async () => {
  let touched = false;
  const response = await handleTaskRouteForTest();
  async function handleTaskRouteForTest() {
    const { handleModuleRoute } = await import("../staging/modules.mjs");
    return handleModuleRoute(new Request(origin + "/tasks/claim", {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-gateway-token": "wrong" },
      body: "{}",
    }), { AGENT_GATEWAY_TOKEN: "correct-token", DB: { prepare() { touched = true; throw new Error("database must not be touched"); } } }, "/tasks/claim", null);
  }
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Agent gateway authorization failed" });
  assert.equal(touched, false);
});


test("Owner task console creates, approves, runs, and refreshes bounded tasks", () => {
  assert.match(APP_HTML, /id="taskPanel" hidden/);
  assert.match(APP_HTML, /id="taskType"/);
  assert.match(APP_HTML, /id="taskPrompt"/);
  assert.match(APP_HTML, /id="createTask"/);
  assert.match(APP_HTML, /id="refreshTasks"/);
  assert.match(APP_HTML, /id="runNextTask"/);
  assert.match(APP_HTML, /\/tasks\/run-next/);
  assert.match(APP_HTML, /\/tasks\/\$\{encodeURIComponent\(task\.id\)\}\/approve/);
  assert.match(APP_HTML, /renderTaskList/);
});
