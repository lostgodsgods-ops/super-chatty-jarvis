import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const jarvisHtml = await readFile(new URL("../jarvis/index.html", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../jarvis/sw.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../jarvis/manifest.webmanifest", import.meta.url), "utf8"));
const centralWorker = await readFile(new URL("../central-agent/worker.mjs", import.meta.url), "utf8");
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

test("public page contains the core project sections", () => {
  for (const id of ["about", "capabilities", "agents", "invest", "contact"]) {
    assert.ok(html.indexOf("id=" + String.fromCharCode(34) + id + String.fromCharCode(34)) >= 0, "missing section: " + id);
  }
  assert.match(html, /Super Chatty Jarvis/);
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
  assert.match(serviceWorker, /CACHE_NAME\s*=\s*"super-chatty-jarvis-shell-v5"/, "shell cache must be version-bumped");
  assert.match(serviceWorker, /self\.skipWaiting\(\)/, "new worker must activate without waiting for an old tab to close");
  assert.match(serviceWorker, /self\.clients\.claim\(\)/, "new worker must claim open PWA clients");
  assert.match(serviceWorker, /key !== CACHE_NAME.*caches\.delete\(key\)/s, "activation must delete older Super Chatty shell caches");
  assert.match(serviceWorker, /new Request\(request,\s*\{\s*cache:\s*"no-store"\s*\}\)/, "navigation must bypass stale browser HTTP cache");
  assert.match(jarvisHtml, /application-version" content="NEXUS-2026\.10\.17-PWA5"/, "frontend version must be bumped");
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


test("owner session survives PWA reloads through a Secure HttpOnly cookie, never JS storage", () => {
  assert.match(centralWorker, /function readSessionCookie\(request\)/);
  assert.match(centralWorker, /__Host-sc_session/);
  assert.match(centralWorker, /access-control-allow-credentials": "true"/);
  assert.match(centralWorker, /Secure; HttpOnly; SameSite=Strict/);
  assert.match(centralWorker, /set-cookie": sessionCookie\(token\)/);
  assert.match(centralWorker, /set-cookie": sessionCookie\("", 0\)/);
  assert.match(jarvisHtml, /async function resumeOwnerSession\(\)/);
  assert.match(jarvisHtml, /credentials:\s*"include"/);
  assert.match(jarvisHtml, /state\.ownerToken = "cookie-session"/);
  assert.match(jarvisHtml, /resumeOwnerSession\(\);/);
  assert.match(jarvisHtml, /token === "cookie-session" \? \{\} : \{ authorization:/);
  assert.doesNotMatch(jarvisHtml, /localStorage\.setItem\([^\n]*(?:token|session)/i);
  assert.doesNotMatch(jarvisHtml, /sessionStorage\.setItem\([^\n]*(?:token|session)/i);
});

test("PWA exposes real WebAuthn passkey sign-in and authenticated registration controls", () => {
  assert.match(centralWorker, /\/auth\/passkey\/login\/options/);
  assert.match(centralWorker, /\/auth\/passkey\/login\/verify/);
  assert.match(centralWorker, /\/auth\/passkey\/register\/options/);
  assert.match(centralWorker, /\/auth\/passkey\/register\/verify/);
  assert.match(centralWorker, /verifyAssertion\(body, challenge, origin/);
  assert.match(centralWorker, /verifyRegistration\(body, challenge, origin/);
  assert.match(jarvisHtml, /navigator\.credentials\.get/);
  assert.match(jarvisHtml, /navigator\.credentials\.create/);
  assert.match(jarvisHtml, /ownerPasskeyLogin/);
  assert.match(jarvisHtml, /ownerPasskeyRegister/);
  assert.match(jarvisHtml, /ownerSetupOpen/);
});


test("standalone install metadata advertises app-window behavior and a branded launch surface", () => {
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.display_override, ["standalone"]);
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.background_color, "#08090d");
  assert.equal(manifest.theme_color, "#08090d");
  assert.ok(manifest.icons.some(icon => icon.src === "./icon.svg" && icon.purpose.includes("maskable")));
  assert.ok(manifest.icons.some(icon => icon.src === "./icon-192.png" && icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some(icon => icon.src === "./icon-512.png" && icon.sizes === "512x512" && icon.type === "image/png"));
  assert.match(serviceWorker, /icon-192\.png/);
  assert.match(serviceWorker, /icon-512\.png/);
  assert.match(jarvisHtml, /name="mobile-web-app-capable" content="yes"/);
  assert.match(jarvisHtml, /name="apple-mobile-web-app-capable" content="yes"/);
});

test("owner gate prevents health checks and SSE from starting before session verification", () => {
  assert.match(jarvisHtml, /async function checkHealth\(\)\s*\{\s*if\s*\(!state\.ownerToken\)/);
  assert.match(jarvisHtml, /async function connect\(\)\s*\{\s*if\s*\(!state\.ownerToken\)/);
  assert.match(jarvisHtml, /function connectEvents\(\)\s*\{\s*if\s*\(!state\.ownerToken\)/);
  assert.match(jarvisHtml, /await checkHealth\(\);\s*await restoreConversationMemory\(\);/);
  assert.match(jarvisHtml, /async function resumeOwnerSession\(\)[\s\S]*?session\.authenticated !== true[\s\S]*?return;[\s\S]*?await checkHealth\(\);/);
  assert.match(jarvisHtml, /Owner session required\. Backend health, telemetry, and event streams remain disabled until verified\./);
});


test("one-click install button invokes the native prompt only after browser eligibility", () => {
  assert.match(jarvisHtml, /id="installPanel"/, "install card must be present on the initial interface");
  assert.match(jarvisHtml, /id="installAppBtn"[^>]*>INSTALL SUPER CHATTY APP<\/button>/, "a high-visibility direct install button must be present");
  assert.match(jarvisHtml, /addEventListener\("beforeinstallprompt"/, "the browser install event must be captured");
  assert.match(jarvisHtml, /event\.preventDefault\(\)/, "the browser's automatic mini-infobar must be deferred for the custom button");
  assert.match(jarvisHtml, /promptEvent\.prompt\(\)/, "the button must invoke the native install prompt");
  assert.match(jarvisHtml, /addEventListener\("appinstalled"/, "successful installation must update the UI");
  assert.match(jarvisHtml, /Chrome has not offered the native install prompt yet/i, "the UI must not claim installation is possible before browser eligibility");
  assert.match(jarvisHtml, /application-version" content="NEXUS-2026\.10\.17-PWA5"/, "the PWA version must be bumped");
  assert.match(serviceWorker, /CACHE_NAME\s*=\s*"super-chatty-jarvis-shell-v5"/, "the shell cache must be invalidated for this release");
});
