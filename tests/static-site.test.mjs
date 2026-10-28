import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const jarvisHtml = await readFile(new URL("../jarvis/index.html", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../jarvis/sw.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../jarvis/manifest.webmanifest", import.meta.url), "utf8"));
const centralWorker = await readFile(new URL("../central-agent/worker.mjs", import.meta.url), "utf8");
const centralDeployWorkflow = await readFile(new URL("../.github/workflows/deploy-central-agent.yml", import.meta.url), "utf8");
const capabilityIngestionSource = await readFile(new URL("../central-agent/architecture/capability-ingestion.mjs", import.meta.url), "utf8");
const readme = await readFile(new URL("../README_HI.txt", import.meta.url), "utf8");
const agentBrief = await readFile(new URL("../AI_AGENT_PROMPT.md", import.meta.url), "utf8");
const deployWorkflow = await readFile(
  new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8",
);
const wranglerConfig = await readFile(
  new URL("../wrangler.jsonc", import.meta.url),
  "utf8",
);
const centralWranglerConfig = await readFile(
  new URL("../central-agent/wrangler.jsonc", import.meta.url),
  "utf8",
);

test("public page contains the core project sections", () => {
  for (const id of ["about", "capabilities", "agents", "invest", "contact"]) {
    assert.ok(html.indexOf("id=" + String.fromCharCode(34) + id + String.fromCharCode(34)) >= 0, "missing section: " + id);
  }
  assert.match(html, /REDULTRON/);
  assert.match(html, /Project owner:\s*<strong>Lost God<\/strong>/);
});

test("AI agent brief explicitly denies implied access and live endpoint", () => {
  assert.match(html, /does not create a live connection, grant permissions, or authorize actions/i);
  assert.match(html, /no live agent endpoint is provided/i);
  assert.match(agentBrief, /Do not assume access to private accounts, credentials, funds, devices, or systems/i);
});

test("copy-brief control is present and wired to its handler", () => {
  assert.match(html, /id="agentBrief"/);
  assert.match(html, /onclick="copyBrief\(\)"/);
  assert.match(html, /function copyBrief\(\)/);
});

test("inquiry form remains preview-only and does not submit to a backend", () => {
  assert.match(html, /id="interestForm"/);
  assert.match(html, /e\.preventDefault\(\)/);
  assert.match(html, /nothing was sent or saved/i);
  assert.match(html, /does not accept or transmit submissions/i);
  assert.doesNotMatch(html, /<form[^>]+action=["']https?:\/\//i);
  assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest/);
});

test("public files contain no obvious provider keys or GitHub tokens", () => {
  const publicFiles = [html, readme, agentBrief, deployWorkflow].join("\n");
  assert.doesNotMatch(publicFiles, /\bsk-[A-Za-z0-9_-]{20,}\b/);
  assert.doesNotMatch(publicFiles, /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/);
  assert.doesNotMatch(publicFiles, /Bearer\s+[A-Za-z0-9._-]{24,}/i);
});

test("README distinguishes verified NEXUS delivery from unverified memory round-trip", () => {
  assert.match(readme, /Root returned HTTP 200/i);
  assert.match(readme, /authenticated D1 memory write\/read round-trip is not yet independently verified/i);
  assert.match(readme, /does not itself provide a complete live multi-agent system/i);
  assert.match(readme, /inquiry form is a demo preview only/i);
});

test("Worker config targets the unified production gateway and required bindings", () => {
  assert.match(wranglerConfig, /"name":\s*"shrill-silence-164f"/);
  assert.match(wranglerConfig, /"main":\s*"src\/worker\.mjs"/);
  assert.match(wranglerConfig, /"directory":\s*"\.\/jarvis"/);
  assert.match(wranglerConfig, /"binding":\s*"ASSETS"/);
  assert.match(wranglerConfig, /"binding":\s*"DB"/);
  assert.match(wranglerConfig, /"binding":\s*"SESSIONS"/);
  assert.match(wranglerConfig, /"binding":\s*"AI"/);
  assert.match(centralWranglerConfig, /"SEARCH_PROVIDER_MODE":\s*"open-source-first"/, "Central Agent must disable quota-exhausted Tavily and prefer guarded public-search fallbacks");
  assert.match(wranglerConfig, /"name":\s*"shrill-silence-164f"/);
});

test("Cloudflare deployment is main-only and uses a private token plus explicit account ID", () => {
  assert.match(deployWorkflow, /branches:\s*\n\s+- main/);
  assert.match(deployWorkflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(deployWorkflow, /accountId:\s*"6c0d1ab7b0d730f94359a89a77a0dcf2"/);
  assert.doesNotMatch(deployWorkflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(deployWorkflow, /Require deployment credentials/);
  assert.match(deployWorkflow, /exit 1/);
  assert.match(deployWorkflow, /::error::Deployment blocked/);
  assert.doesNotMatch(deployWorkflow, /Deployment skipped/);
  assert.ok(deployWorkflow.indexOf("run: npm test") < deployWorkflow.indexOf("Require deployment credentials"));
  assert.ok(deployWorkflow.indexOf("run: npm test") < deployWorkflow.indexOf("Deploy Worker"));
});


test("NEXUS agent HUD is live-wired to the production SSE event bus", () => {
  for (const text of ["Code Mutator Agent", "Tavily Global Scraper", "24/7 Sentinel Grid", "hudCommitCount", "hudSearchCount", "hudHealthValue"]) {
  assert.match(jarvisHtml, /data-hud-state="PROCESSING"/);
    assert.ok(jarvisHtml.includes(text), "missing agent HUD feature: " + text);
  }
  assert.ok(jarvisHtml.includes('id="eventsUrl"') && jarvisHtml.includes('value="https://shrill-silence-164f.lostgodsgods.workers.dev/api/events"'), "SSE URL should default to the production endpoint");
  assert.match(jarvisHtml, /resumeOwnerSession\(\);\s*\}\)\(\);/, "session restore must run at startup");
  assert.doesNotMatch(jarvisHtml, /checkHealth\(\);\s*connectEvents\(\);\s*resumeOwnerSession\(\);/, "health checks and SSE must not start before owner session verification");
  assert.match(jarvisHtml, /updateAgentHud\(eventName, dataLine, ""\)/, "authenticated SSE events must update the agent HUD");
  assert.match(centralWorker, /security\.request\.denied/);
  assert.match(jarvisHtml, /parsed\.payload && typeof parsed\.payload==="object"/);
});


test("installed PWA force-updates stale shells and revalidates HTML assets", () => {
  assert.match(serviceWorker, /CACHE_NAME\s*=\s*"redultron-core-shell-v16-cognitive-core"/, "shell cache must be version-bumped for the install UX release");
  assert.match(serviceWorker, /self\.skipWaiting\(\)/, "new worker must activate without waiting for an old tab to close");
  assert.match(serviceWorker, /self\.clients\.claim\(\)/, "new worker must claim open PWA clients");
  assert.match(serviceWorker, /key !== CACHE_NAME.*caches\.delete\(key\)/s, "activation must delete older project shell caches");
  assert.match(serviceWorker, /new Request\(request,\s*\{\s*cache:\s*"no-store"\s*\}\)/, "navigation must bypass stale browser HTTP cache");
  assert.match(jarvisHtml, /application-version" content="REDULTRON-2026\.10\.28-COGNITIVE-CORE-V16"/, "frontend version must be bumped");
  assert.match(jarvisHtml, /registration\.update\(\)/, "PWA must check for worker updates");
  assert.match(jarvisHtml, /controllerchange/, "active sessions must detect the new worker controller");
  assert.match(jarvisHtml, /location\.reload\(\)/, "active sessions must reload after a worker update");
  assert.match(centralWorker, /headers\.set\("cache-control",\s*"no-cache, must-revalidate"\)/, "Worker must force revalidation for PWA HTML and update assets");
});

test("NEXUS PWA preserves owner-only telemetry and adds safe local visual intake", () => {
  for (const id of ["particleMesh", "auditCount", "observationCount", "signalCount", "researchFeed", "ownerLoginForm", "mediaPicker", "cameraStart", "cameraCapture", "cameraStop"]) {
    assert.ok(jarvisHtml.indexOf("id=" + String.fromCharCode(34) + id + String.fromCharCode(34)) >= 0, "missing NEXUS control: " + id);
  }
  for (const route of ["/auth/login", "/auth/session", "/auth/logout", "/research/status", "/research/query"]) {
    assert.ok(jarvisHtml.includes(route), "existing backend route was changed or removed: " + route);
  }
  assert.match(jarvisHtml, /getUserMedia\(\{video:/, "camera access must be implemented");
  assert.match(jarvisHtml, /addEventListener\("click",startCamera\)/, "camera permission must be initiated by a user click");
  assert.match(jarvisHtml, /not transmitted to the Worker or analytical core/i, "local-only media boundary must be visible");
  assert.match(jarvisHtml, /backdrop-filter:\s*blur/i, "glassmorphism styles are missing");
  assert.match(jarvisHtml, /requestAnimationFrame\(draw\)/, "animated particle mesh is missing");
  const scripts = [...jarvisHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 1, "expected one self-contained application script");
  assert.doesNotThrow(() => new vm.Script(scripts[0]), "PWA JavaScript must parse");
});


test("owner session locks on reload/background and never auto-restores from a cookie", () => {
  assert.ok(centralWorker.includes("function readSessionCookie(request)"));
  assert.ok(centralWorker.includes("__Host-sc_session"));
  assert.ok(centralWorker.includes('"access-control-allow-credentials": "true"'));
  assert.ok(centralWorker.includes("Secure; HttpOnly; SameSite=Strict"));
  assert.ok(centralWorker.includes('"set-cookie": sessionCookie(token)'));
  assert.ok(centralWorker.includes('"set-cookie": sessionCookie("", 0)'));
  assert.ok(jarvisHtml.includes("async function resumeOwnerSession()"));
  assert.ok(jarvisHtml.includes('credentials: "include"'));
  const resumeStart = jarvisHtml.indexOf("async function resumeOwnerSession()");
  const resumeEnd = jarvisHtml.indexOf("function decodeB64url", resumeStart);
  const resumeBody = jarvisHtml.slice(resumeStart, resumeEnd);
  assert.ok(resumeBody.includes('method: "POST"'), "startup must revoke any cookie-backed session");
  assert.equal(resumeBody.includes('state.ownerToken = "cookie-session"'), false, "reload must not restore a cookie session");
  assert.ok(jarvisHtml.includes('document.addEventListener("visibilitychange"'));
  assert.ok(jarvisHtml.includes("lockOwnerOnBackground"));
  assert.ok(jarvisHtml.includes("resumeOwnerSession();"));
  assert.ok(jarvisHtml.includes('token === "cookie-session" ? {} : { authorization:'));
  assert.doesNotMatch(jarvisHtml, /(?:localStorage|sessionStorage)\.setItem\(["\x27](?:ownerToken|sessionToken|authToken|accessToken)["\x27]/i,
    "authentication tokens must never be persisted in browser storage");
});

test("PWA exposes real WebAuthn passkey sign-in and authenticated registration controls", () => {
  assert.match(centralWorker, /\/auth\/passkey\/login\/options/);
  assert.match(centralWorker, /\/auth\/passkey\/login\/verify/);
  assert.match(centralWorker, /\/auth\/passkey\/register\/options/);
  assert.match(centralWorker, /\/auth\/passkey\/register\/verify/);
  assert.match(centralWorker, /verifyAssertion\(body, challenge, origin/);
  assert.match(centralWorker, /verifyRegistration\(body, challenge, parsedOrigin\.origin/);
  assert.match(jarvisHtml, /navigator\.credentials\.get/);
  assert.match(jarvisHtml, /navigator\.credentials\.create/);
  assert.match(jarvisHtml, /ownerPasskeyLogin/);
  assert.match(jarvisHtml, /ownerPasskeyRegister/);
  assert.match(jarvisHtml, /ownerSetupOpen/);
  assert.match(jarvisHtml, /function assertPasskeyOrigin/);
  assert.match(jarvisHtml, /options\.origin !== origin/);
  assert.match(centralWorker, /origin: parsedOrigin\.origin/);
  assert.equal(
    (jarvisHtml.match(/assertPasskeyOrigin\(options, false\)/g) || []).length,
    2,
    "both passkey and biometric login must validate exact origin and RP ID before navigator.credentials.get",
  );
});

test("PWA barge-in cancels TTS on first non-echo speech result", () => {
  assert.match(jarvisHtml, /function interruptSpeechOutput\(\)/);
  assert.match(jarvisHtml, /window\.speechSynthesis\.cancel\(\)/);
  assert.match(jarvisHtml, /recognition\.onresult = event =>/);
  assert.match(jarvisHtml, /if \(state\.speaking\) interruptSpeechOutput\(\)/);
  assert.match(jarvisHtml, /heard\.length <= 2/);
});


test("standalone install metadata advertises app-window behavior and a branded launch surface", () => {
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.display_override, ["standalone"]);
  assert.doesNotMatch(JSON.stringify(manifest.display_override), /minimal-ui/);
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.background_color, "#08090d");
  assert.equal(manifest.theme_color, "#08090d");
  assert.ok(manifest.icons.some(icon => icon.src === "./icon.svg" && icon.purpose.includes("maskable")));
  assert.ok(manifest.icons.some(icon => icon.src === "./icon-192.png" && icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some(icon => icon.src === "./icon-512.png" && icon.sizes === "512x512" && icon.type === "image/png"));
  assert.match(serviceWorker, /icon-192\.png/);
  assert.match(serviceWorker, /icon-512\.png/);
  assert.match(jarvisHtml, /apple-touch-icon/);
  assert.match(jarvisHtml, /name="mobile-web-app-capable" content="yes"/);
  assert.match(jarvisHtml, /name="apple-mobile-web-app-capable" content="yes"/);
});

test("PWA provides a direct native install prompt and a safe fallback", () => {
  assert.match(jarvisHtml, /id="installBanner"/, "install banner must be present in the first-screen UI");
  assert.match(jarvisHtml, /id="installAppBtn"[^>]*>INSTALL REDULTRON APP</, "install button must be prominent and directly tappable");
  assert.match(jarvisHtml, /beforeinstallprompt/, "Chrome install prompt event must be captured");
  assert.match(jarvisHtml, /event\.preventDefault\(\)/, "browser prompt must be deferred until the user taps the button");
  assert.match(jarvisHtml, /installEvent\.prompt\(\)/, "button must invoke the native prompt from a user gesture");
  assert.match(jarvisHtml, /appinstalled/, "successful installation must be detected");
  assert.match(jarvisHtml, /Chrome has not offered the native install prompt yet/, "unsupported browsers need a truthful fallback");
  assert.doesNotMatch(jarvisHtml, /if \(!deferredInstallPrompt\)[\s\S]{0,350}menu and choose Install app/i, "the install button must not direct users to a manual menu workaround");
  assert.match(jarvisHtml, /display-mode:\s*standalone/, "installed standalone mode must be detected");
  assert.ok(centralWorker.includes('url.pathname === "/icon-192.png"'), "Worker must allow the public 192px install icon");
  assert.ok(centralWorker.includes('url.pathname === "/icon-512.png"'), "Worker must allow the public 512px install icon");
  assert.match(serviceWorker, /CACHE_NAME\s*=\s*"redultron-core-shell-v16-cognitive-core"/, "install UX release must invalidate old shell cache");
});

test("owner gate prevents health checks and SSE from starting before session verification", () => {
  assert.match(jarvisHtml, /async function checkHealth\(\)\s*\{\s*if\s*\(!state\.ownerToken\)/);
  assert.match(jarvisHtml, /async function connect\(\)\s*\{\s*if\s*\(!state\.ownerToken\)/);
  assert.match(jarvisHtml, /function connectEvents\(\)\s*\{\s*if\s*\(!state\.ownerToken\)/);
  assert.match(jarvisHtml, /const optionalSteps = \[/);
  assert.match(jarvisHtml, /\["health check", \(\) => checkHealth\(\)\]/);
  assert.match(jarvisHtml, /\["conversation memory restore", \(\) => restoreConversationMemory\(\)\]/);
  assert.match(jarvisHtml, /async function resumeOwnerSession\(\)[\s\S]*?session\.authenticated !== true[\s\S]*?return;[\s\S]*?await checkHealth\(\);/);
  assert.match(jarvisHtml, /Owner session required\. Backend health, telemetry, and event streams remain disabled until verified\./);
});


test("first-screen one-click install uses the browser-native prompt when eligible", () => {
  assert.match(jarvisHtml, /id="installBanner"/, "install banner must exist on the initial screen");
  assert.match(jarvisHtml, /id="installAppBtn"[^>]*>INSTALL REDULTRON APP<\/button>/, "prominent install action must be present");
  assert.match(jarvisHtml, /addEventListener\("beforeinstallprompt"/, "browser install eligibility must be captured");
  assert.match(jarvisHtml, /event\.preventDefault\(\)/, "default install UI must be deferred to the custom action");
  assert.match(jarvisHtml, /installEvent\.prompt\(\)/, "tap must invoke the captured native prompt");
  assert.match(jarvisHtml, /addEventListener\("appinstalled"/, "successful install must be handled");
  assert.match(jarvisHtml, /Chrome has not offered the native install prompt yet/i, "unavailable prompt state must be honest");
  assert.match(jarvisHtml, /application-version" content="REDULTRON-2026\.10\.28-COGNITIVE-CORE-V16"/, "app version must identify this shell release");
  assert.match(serviceWorker, /CACHE_NAME\s*=\s*"redultron-core-shell-v16-cognitive-core"/, "shell cache must be invalidated");
});

test("PWA notifications require explicit opt-in and only notify for live foreground SSE events", () => {
  assert.match(jarvisHtml, /id="enableNotificationsBtn"/, "notifications need an explicit user control");
  assert.match(jarvisHtml, /function enableEventNotifications\(/, "permission flow must be initiated by a user click");
  assert.match(jarvisHtml, /Notification\.requestPermission\(\)/, "permission must be requested explicitly");
  assert.match(jarvisHtml, /state\.notificationsEnabled/, "event notifications must remain opt-in");
  assert.match(jarvisHtml, /showNotification\(/, "notifications must use the registered service worker");
  assert.match(jarvisHtml, /foreground event alerts only/i, "UI must disclose that background push is not configured");
  assert.match(serviceWorker, /notificationclick/, "notification click must return to the PWA");
  assert.doesNotMatch(jarvisHtml, /new Notification\(/, "do not create unscoped page-level notifications");
});

test("PWA install icons and standalone asset paths are consistent", () => {
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.display_override, ["standalone"]);
  assert.ok(manifest.icons.some((icon) => icon.src === "./icon-192.png" && icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some((icon) => icon.src === "./icon-512.png" && icon.sizes === "512x512" && icon.type === "image/png"));
  assert.match(jarvisHtml, /rel="apple-touch-icon" href="\.\/icon-192\.png"/);
  assert.match(serviceWorker, /"\.\/icon-192\.png"/);
  assert.match(serviceWorker, /"\.\/icon-512\.png"/);
});

test("verified owner login is not downgraded by optional dashboard initialization errors", () => {
  const start = jarvisHtml.indexOf("async function activateOwnerSession(token, methodLabel)");
  const end = jarvisHtml.indexOf("async function signInPasskey()", start);
  assert.ok(start >= 0 && end > start, "owner activation function must exist");
  const body = jarvisHtml.slice(start, end);
  assert.match(body, /session\.authenticated !== true/);
  assert.match(body, /const optionalSteps = \[/);
  assert.match(body, /\["health check", \(\) => checkHealth\(\)\]/);
  assert.match(body, /\["telemetry refresh", \(\) => refreshTelemetry\(\)\]/);
  assert.match(body, /\["event bus connection", \(\) => connectSentinelEvents\(\)\]/);
  assert.match(jarvisHtml, /credentials:\s*"include"/);
});

test("owner login backend keeps password validation strict and returns a token only after hash match", () => {
  const start = centralWorker.indexOf('if (url.pathname === "/auth/login"');
  const end = centralWorker.indexOf('if ((url.pathname === "/auth/passkey/login/options"', start);
  const body = centralWorker.slice(start, end);
  assert.match(body, /derivePasswordHash\(password, credentials\.salt\)/);
  assert.match(body, /equalSecret\(candidate, credentials\.password_hash\)/);
  assert.match(body, /Invalid password\./);
  assert.ok(body.indexOf("equalSecret(candidate, credentials.password_hash)") < body.indexOf("const token ="));
});


test("base64url encoder converts plus and slash characters without runtime errors", () => {
  const match = jarvisHtml.match(/function encodeB64url\(value\)\s*\{[\s\S]*?\n    \}/);
  assert.ok(match, "PWA base64url encoder must exist");
  const encodeB64url = vm.runInNewContext("(" + match[0] + ")", {
    btoa: globalThis.btoa,
    Uint8Array
  });
  // These bytes encode to "+///"; both characters must be converted to URL-safe form.
  assert.equal(encodeB64url(Uint8Array.from([251, 255, 255]).buffer), "-___");
});


test("voice-first console replaces manual mic clutter with explicit owner-only hands-free mode", () => {
  assert.doesNotMatch(jarvisHtml, /id="micBtn"/, "manual mic button should be removed");
  assert.match(jarvisHtml, /id="handsFreeBtn"/, "hands-free mode must have a visible explicit opt-in");
  assert.match(jarvisHtml, /async function startHandsFree\(\)/, "voice loop must have a dedicated start routine");
  assert.match(jarvisHtml, /if\s*\(!state\.ownerToken\)[\s\S]{0,180}Hands-free voice requires an unlocked Owner session/);
  assert.match(jarvisHtml, /ownerFetch\("\/api\/chat"/, "voice/text commands must use the owner-authenticated chat API");
  assert.match(jarvisHtml, /SpeechSynthesisUtterance/, "AI replies must be spoken aloud");
  assert.match(jarvisHtml, /Loss Gods/, "owner identity must appear in the greeting/persona UI");
  assert.match(jarvisHtml, /stopHandsFree\(/, "logout/lock must stop continuous listening");
});


test("voice activation is manual and never auto-resumes after owner unlock", () => {
  const activationStart = jarvisHtml.indexOf("async function activateOwnerSession(token, methodLabel)");
  const activationEnd = jarvisHtml.indexOf("async function signInPasskey()", activationStart);
  assert.ok(activationStart >= 0 && activationEnd > activationStart, "owner activation function must exist");
  const activation = jarvisHtml.slice(activationStart, activationEnd);
  assert.match(activation, /speakGreeting\(\);/);
  assert.doesNotMatch(activation, /startHandsFree\(\)/, "owner unlock must not auto-start microphone capture");
  assert.doesNotMatch(jarvisHtml, /sc_hands_free_autostart_v1/, "voice opt-in must not persist across sessions");
  assert.match(jarvisHtml, /if \(state\.handsFree\) \{\s*stopHandsFree\("Voice listening stopped by manual toggle\."/);
  assert.match(jarvisHtml, /Manual voice toggle enabled/);
});

test("PWA event counter increments numeric state and never reads an undefined DOM property", () => {
  assert.match(jarvisHtml, /state\.eventsCount\+\+/);
  assert.match(jarvisHtml, /els\.logCount\.textContent\s*=\s*state\.eventsCount\s*\+\s*" events"/);
  assert.doesNotMatch(jarvisHtml, /els\.eventsCount\+\+/);
});


test("owner chat uses open-source live search by default and exposes capability boundaries", () => {
  const apiChatStart = centralWorker.indexOf('if (url.pathname === "/api/chat" && request.method === "POST")');
  const recoveryStart = centralWorker.indexOf('if (url.pathname === "/auth/recovery/codes" && request.method === "POST")', apiChatStart);
  assert.ok(apiChatStart >= 0 && recoveryStart > apiChatStart, "owner chat route should exist");
  const apiChat = centralWorker.slice(apiChatStart, recoveryStart);
  assert.match(apiChat, /requiresLiveSearch\(message\)/);
  assert.match(apiChat, /fetchTavilyWithRetry\(searchQuery, env\)/);
  assert.match(apiChat, /rankTavilyResults\(searchQuery/);
  assert.match(centralWorker, /directWebSearchFallback/);
  assert.match(apiChat, /configured open-source SearXNG first/);
  assert.match(apiChat, /No stale-model fallback was used/);
  assert.match(apiChat, /WebAuthn passkey registration and assertion verification/);
  assert.match(apiChat, /speech barge-in cancels speech synthesis/);
  assert.match(apiChat, /D1 persists configured owner credentials/);
  assert.match(apiChat, /Bounded multi-agent research and task loops/);
  assert.match(apiChat, /webSearchExecuted: needsLiveSearch/);
});


test("voice transcripts are not persisted to conversation memory", () => {
  const submitStart = jarvisHtml.indexOf("async function submitCommand(source = \"text\")");
  const submitEnd = jarvisHtml.indexOf("// NEXUS visual intake", submitStart);
  assert.ok(submitStart >= 0 && submitEnd > submitStart, "submitCommand must exist");
  const submit = jarvisHtml.slice(submitStart, submitEnd);
  assert.match(submit, /if \(source !== "voice"\) \{/);
  assert.match(submit, /\/api\/memory/);
  assert.match(submit, /Voice transcripts and spoken replies are session-only/);
  assert.doesNotMatch(submit, /Loss Gods voice input captured/);
});

test("voice capture is singleton and competing microphone monitor is absent", () => {
  assert.doesNotMatch(jarvisHtml, /startBargeInMonitor|stopBargeInMonitor|bargeInStream/);
  assert.doesNotMatch(jarvisHtml, /getUserMedia\(\s*\{\s*audio/);
  assert.doesNotMatch(jarvisHtml, /sc_hands_free_autostart_v1/);
  assert.match(jarvisHtml, /state\.listening \|\| state\.recognition \|\| state\.chatBusy/);
  assert.match(jarvisHtml, /if \(state\.recognition !== recognition\) return/);
  assert.match(jarvisHtml, /state\.chatController\.abort\(\)/);
  assert.match(jarvisHtml, /function adaptSpeechTone\(/);
  assert.ok(jarvisHtml.includes("}, turnLanguage);"), "spoken reply should preserve the turn language");
  assert.match(jarvisHtml, /const turnLanguage = speechLanguage\(\);/);
});

test("capability ingestion is wired to an authenticated route and remains metadata-only", () => {
  assert.match(centralWorker, /url\.pathname === "\/api\/capabilities\/ingest"/);
  assert.match(centralWorker, /ingestCapabilitySpec\(specUrl, env\)/);
  assert.match(centralWorker, /executionEnabled:\s*false/);
  assert.match(capabilityIngestionSource, /CAPABILITY_SPEC_HOSTS/);
  assert.match(capabilityIngestionSource, /redirect:\s*"error"/);
});

test("scheduled intel is proposal-only and never self-deploys or self-grants", () => {
  assert.match(centralWorker, /runIntelCycle\(env\)/);
  assert.match(centralWorker, /upgradeExecution:\s*false/);
  assert.match(centralWorker, /INTEL_CRON_ENABLED/);
  assert.match(centralWranglerConfig, /"GITHUB_REPOSITORY":\s*"lostgodsgods-ops\/super-chatty-jarvis"/);
});


test("PWA update activation reloads after controllerchange and never leaves the update button stuck", () => {
  assert.match(jarvisHtml, /navigator\.serviceWorker\.addEventListener\(["']controllerchange["']/);
  assert.match(jarvisHtml, /location\.reload\(\)/);
  assert.match(jarvisHtml, /UPDATE APP NOW/);
  assert.match(jarvisHtml, /PWA update failed:/);
});

test("owner chat recognizes explicit live-search intent and returns dated source metadata", () => {
  assert.match(centralWorker, /LIVE_SEARCH_FRESH_RESULTS_UNAVAILABLE/);
  assert.match(centralWorker, /fetchTavilyWithRetry\(searchQuery, env\)/);
  assert.match(centralWorker, /publishedDate/);
  assert.match(centralWorker, /webSearchExecuted: needsLiveSearch/);
});


test("live search has independent no-key news fallbacks after Tavily and DuckDuckGo fail", () => {
  assert.match(centralWorker, /news\.google\.com\/rss\/search/);
  assert.match(centralWorker, /api\.gdeltproject\.org\/api\/v2\/doc\/doc/);
  assert.match(centralWorker, /x-search-provider.*google-news-rss|x-search-provider.*gdelt/i);
  assert.match(centralWorker, /LIVE_SEARCH_FRESH_RESULTS_UNAVAILABLE/);
});

test("live evidence search includes the Bing News RSS fallback", () => {
  assert.match(centralWorker, /www\.bing\.com\/news\/search/);
  assert.match(centralWorker, /name: "bing-news-rss"/);
  assert.match(centralWorker, /x-search-provider.*provider\.name/);
});


test("PWA /api/chat reports safe live-search provider diagnostics instead of hiding the root cause", () => {
  const routeStart = centralWorker.lastIndexOf('url.pathname === "/api/chat"');
  const route = centralWorker.slice(routeStart);
  assert.match(route, /central_api_chat_live_search_failed/);
  assert.match(route, /error\.providerDiagnostics/);
  assert.match(route, /LIVE_SEARCH_NETWORK_ERROR/);
  assert.match(route, /providers:\s*diagnostics/);
  assert.match(route, /No stale-model fallback was used/);
  assert.doesNotMatch(route, /SEARCH_API_KEY|SEARCH_BRIDGE_TOKEN|authorization:\s*["']/);
});


test("Central Agent deployment rejects stale live-search health contracts and prints provider diagnostics", () => {
  assert.match(centralDeployWorkflow, /liveSearchProviderChain/);
  assert.match(centralDeployWorkflow, /searchProviderMode!=="open-source-first"/);
  assert.match(centralDeployWorkflow, /tavilySearchEnabled!==false/);
  assert.match(centralDeployWorkflow, /disabled by production config to avoid quota-exhaustion HTTP 432/);
  assert.match(centralDeployWorkflow, /bing-news-rss/);
  assert.match(centralDeployWorkflow, /google-news-rss/);
  assert.match(centralDeployWorkflow, /gdelt-doc-api/);
  assert.match(centralDeployWorkflow, /diagnosticContractPresent/);
  assert.match(centralDeployWorkflow, /latest Central Agent Worker version is deployed/);
});


test("Central Agent runtime and PWA shell release markers stay synchronized", () => {
  const headerVersion = centralWorker.match(/REDULTRON Central Agent v([0-9]+\.[0-9]+\.[0-9]+)/)?.[1];
  const runtimeVersion = centralWorker.match(/const VERSION = "([^"]+)"/)?.[1];
  assert.ok(headerVersion, "Central Agent source header must declare a semantic version");
  assert.ok(runtimeVersion, "Central Agent runtime must declare its health-reported version");
  assert.equal(headerVersion, runtimeVersion, "source header and runtime health version must match");

  const appVersion = jarvisHtml.match(/application-version" content="REDULTRON-[0-9]{4}\.[0-9]{2}\.[0-9]{2}-COGNITIVE-CORE-V([0-9]+)/)?.[1];
  const cacheVersion = serviceWorker.match(/CACHE_NAME\s*=\s*"redultron-core-shell-v([0-9]+)-cognitive-core"/)?.[1];
  assert.ok(appVersion, "PWA HTML must declare its release version");
  assert.ok(cacheVersion, "service worker must declare its shell cache version");
  assert.equal(appVersion, cacheVersion, "PWA app and service-worker cache versions must match");
  assert.equal(manifest.name, "REDULTRON CORE 3.0", "install manifest identity must remain canonical");
});


test("REDULTRON CORE 3.0 is the canonical app identity with preferred male voice selection", () => {
  assert.match(jarvisHtml, /REDULTRON CORE 2\.0/, "the primary interface must use the new core identity");
  assert.equal(manifest.name, "REDULTRON CORE 3.0", "the installable app name must use the new identity");
  assert.match(jarvisHtml, /function selectPreferredMaleVoice\(/, "voice selection must prefer available male-sounding Hindi/Indian English voices");
  assert.match(jarvisHtml, /voiceschanged/, "voice selection must refresh when the device voice catalog loads");
  assert.match(jarvisHtml, /COGNITIVE CORE/, "the interface must expose cognitive-core framing");
  assert.match(centralWorker, /REDULTRON CORE 2\.0/, "backend system prompts must share the canonical identity");
});


test("spoken replies clean markdown, raw links, code blocks, and decorative symbols", () => {
  const declaration = jarvisHtml.match(/    function prepareSpeechText\(text\) \{[\s\S]*?\n    \}/);
  assert.ok(declaration, "speech output needs a dedicated text-normalization function");
  const prepareSpeechText = vm.runInNewContext("(" + declaration[0].trim() + ")");
  const spoken = prepareSpeechText("# Latest update\n\n**Status:** Ready. [Read source](https://example.com/path)\n\n```js\nsecret code\n```\n- First item 🚀");
  assert.match(spoken, /Latest update/);
  assert.match(spoken, /Status: Ready\./);
  assert.match(spoken, /Read source/);
  assert.match(spoken, /Code details are shown on screen/);
  assert.match(spoken, /First item/);
  assert.doesNotMatch(spoken, /https:\/\/|secret code|```|🚀|\*\*|^#/m);
  assert.match(jarvisHtml, /prepareSpeechText\(text\)\.slice\(0, 3000\)/, "speech synthesis must use normalized text");
});


test("voice catalog refreshes immediately and supports both voice-change event APIs", () => {
  const start = jarvisHtml.indexOf("function refreshVoiceCatalog()");
  const end = jarvisHtml.indexOf("function adaptSpeechTone(", start);
  assert.ok(start >= 0 && end > start, "voice catalog refresh function must exist");
  const catalog = jarvisHtml.slice(start, end);
  assert.match(catalog, /speechSynthesis\.addEventListener\("voiceschanged", refreshVoiceCatalog\)/);
  assert.match(catalog, /speechSynthesis\.onvoiceschanged\s*=\s*refreshVoiceCatalog/);
  assert.match(catalog, /refreshVoiceCatalog\(\);/, "voice selection should run once after setup");
});


test("Core release metadata is current and voice output uses clear, full-volume prosody", () => {
  assert.match(jarvisHtml, /application-version" content="REDULTRON-2026\.10\.28-COGNITIVE-CORE-V16/, "PWA release date and cache version must be refreshed together");
  const declaration = jarvisHtml.match(/    function adaptSpeechTone\(utterance, text, language\) \{[\s\S]*?\n    \}/);
  assert.ok(declaration, "speech output must have a prosody policy");
  const adaptSpeechTone = vm.runInNewContext("(" + declaration[0].trim() + ")");
  const utterance = {};
  adaptSpeechTone(utterance, "System ready.", "hi-IN");
  assert.equal(utterance.volume, 1, "voice output should use full configured volume");
  assert.ok(utterance.rate <= 0.93, "voice delivery should leave enough time for Hindi/Hinglish clarity");
  assert.ok(utterance.pitch <= 0.88, "voice delivery should retain the mature, grounded pitch profile");
});
