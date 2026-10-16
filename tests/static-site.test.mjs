import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const jarvisHtml = await readFile(new URL("../jarvis/index.html", import.meta.url), "utf8");
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
