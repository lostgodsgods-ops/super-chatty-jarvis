import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const readme = await readFile(new URL("../README_HI.txt", import.meta.url), "utf8");
const agentBrief = await readFile(new URL("../AI_AGENT_PROMPT.md", import.meta.url), "utf8");
const deployWorkflow = await readFile(
  new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8",
);

test("public page contains the core project sections", () => {
  for (const id of ["about", "capabilities", "agents", "invest", "contact"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing section: ${id}`);
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

test("README accurately marks deployment as not yet live-verified", () => {
  assert.match(readme, /deployment workflow has not yet been verified against a real deployment/i);
  assert.match(readme, /does not itself provide a complete live multi-agent system/i);
  assert.match(readme, /inquiry form is a demo preview only/i);
});

test("Cloudflare deployment is main-only and gated on private repository secrets", () => {
  assert.match(deployWorkflow, /branches:\s*\n\s+- main/);
  assert.match(deployWorkflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(deployWorkflow, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(deployWorkflow, /steps\.credentials\.outputs\.ready == 'true'/);
});
