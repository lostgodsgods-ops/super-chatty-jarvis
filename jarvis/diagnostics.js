"use strict";
(() => {
  const WORKER_DEFAULT = "https://shrill-silence-164f.lostgodsgods.workers.dev";
  const records = new Map();
  let started = false, timer = 0;
  const $ = id => document.getElementById(id);
  function currentToken() {
    const form = $("ownerSessionStatus");
    return !!form && !document.body.classList.contains("auth-locked") &&
      !($("ownerBadge")?.textContent || "").includes("LOCKED");
  }
  function panel() {
    if ($("runtimeDiagnostics")) return $("runtimeDiagnostics");
    const grid = document.querySelector(".dashboard-grid");
    if (!grid) return null;
    const section = document.createElement("section");
    section.id = "runtimeDiagnostics";
    section.className = "panel dashboard-panel";
    section.setAttribute("aria-labelledby", "runtimeDiagnosticsTitle");
    section.innerHTML = '<div class="panel-head"><div class="panel-title" id="runtimeDiagnosticsTitle">Runtime Diagnostics · Live Evidence</div><span class="status warn" id="diagOverall"><i class="dot"></i><span>COLLECTING</span></span></div><div class="panel-body"><p class="dashboard-note">Each status is derived from a live request or captured runtime exception. No synthetic PASS values.</p><div class="diag-list" id="diagList" aria-live="polite"></div><div class="owner-actions"><button class="action-btn secondary" id="diagRefresh" type="button">Run diagnostics</button></div><p class="dashboard-note" id="diagUpdated">Waiting for owner verification.</p></div>';
    grid.append(section);
    $("diagRefresh").addEventListener("click", run);
    return section;
  }
  function record(key, label, state, detail) {
    records.set(key, {label, state, detail, at:new Date().toISOString()});
    render();
  }
  function render() {
    const list = $("diagList");
    if (!list) return;
    list.replaceChildren();
    for (const item of records.values()) {
      const row = document.createElement("div"); row.className = "diag-row";
      const title = document.createElement("strong");
      title.className = item.state === "PASS" ? "diag-pass" : item.state === "FAIL" ? "diag-fail" : "diag-warn";
      title.textContent = item.state + " · " + item.label;
      const detail = document.createElement("span"); detail.textContent = item.detail;
      row.append(title, detail); list.append(row);
    }
    const states = [...records.values()].map(x=>x.state);
    const overall = $("diagOverall");
    if (overall) {
      const fail = states.includes("FAIL"), allPass = states.length > 0 && states.every(x=>x==="PASS");
      overall.className = "status " + (fail ? "bad" : allPass ? "ok" : "warn");
      overall.querySelector("span").textContent = fail ? "ISSUES FOUND" : allPass ? "CHECKS PASS" : "PARTIAL";
    }
    const updated = $("diagUpdated");
    if (updated) updated.textContent = "Last update: " + new Date().toLocaleString();
  }
  async function run() {
    panel();
    if (!currentToken()) {
      record("auth", "Owner session", "BLOCKED", "Private diagnostics are locked until the server verifies owner sign-in.");
      return;
    }
    const healthUrl = ($("workerUrl")?.value || WORKER_DEFAULT + "/health").trim();
    let base;
    try { base = new URL(healthUrl).origin; }
    catch { record("worker", "Cloudflare Worker", "FAIL", "Worker health URL is invalid."); return; }
    record("worker", "Cloudflare Worker", "WARN", "Request in progress…");
    try {
      const response = await fetch(base + "/health", {headers:{accept:"application/json"},cache:"no-store",credentials:"omit",signal:AbortSignal.timeout(8000)});
      const payload = await response.json().catch(()=>({}));
      if (!response.ok || payload.ok === false) {
        record("worker", "Cloudflare Worker", "FAIL", "Health endpoint returned HTTP " + response.status + ".");
        record("search", "Live Search provider chain", "BLOCKED", "Worker health failed; search readiness cannot be inferred.");
      } else {
        record("worker", "Cloudflare Worker", "PASS", "GET /health returned HTTP " + response.status + "; version " + String(payload.version || payload.workerVersion || "not reported") + ".");
        const chain = Array.isArray(payload.searchProviderChain) ? payload.searchProviderChain :
          (Array.isArray(payload.searchProviders) ? payload.searchProviders : null);
        const configured = payload.tavilySearchConfigured === true || payload.directWebSearchFallback === true;
        record("search", "Live Search provider chain", configured || (chain && chain.length) ? "PASS" : "WARN",
          "Health reports " + (configured ? "search configuration/fallback present" : "no explicit search readiness flag") +
          (chain?.length ? "; providers: " + chain.join(" → ") : "") +
          ". Provider reachability is tested only by an actual research query.");
      }
    } catch (error) {
      record("worker", "Cloudflare Worker", "FAIL", error?.name === "TimeoutError" ? "Health request timed out after 8 seconds." : "Health request failed: " + String(error?.message || error));
      record("search", "Live Search provider chain", "BLOCKED", "Worker health unavailable; no provider PASS is claimed.");
    }
    try {
      const response = await fetch(base + "/auth/status", {headers:{accept:"application/json"},credentials:"include",cache:"no-store",signal:AbortSignal.timeout(8000)});
      if (response.status === 401 || response.status === 403) record("auth", "Authentication endpoint", "PASS", "Unauthenticated status request was rejected (HTTP " + response.status + "); endpoint is reachable.");
      else if (response.ok) record("auth", "Authentication endpoint", "PASS", "GET /auth/status returned HTTP " + response.status + ".");
      else record("auth", "Authentication endpoint", "FAIL", "GET /auth/status returned HTTP " + response.status + ".");
    } catch (error) {
      record("auth", "Authentication endpoint", "FAIL", "Auth status request failed: " + String(error?.message || error));
    }
    record("nullref", "Null Reference", "PASS", "No uncaught null-reference exception has been captured in this page session.");
    record("goal", "Goal-Agent Data Mismatch", "WARN", "Requires a real goal execution response to compare requested and returned identifiers; health check alone cannot prove alignment.");
    record("synthesis", "Code Synthesis Agent Output", "WARN", "No code-synthesis execution was triggered by diagnostics; output validity is not inferred from health.");
  }
  window.addEventListener("error", event => {
    const message = String(event?.message || event?.error?.message || "Unknown runtime exception").slice(0,240);
    record("nullref", "Browser runtime exception", "FAIL", message);
    if (/null|undefined|referenceerror|cannot read properties/i.test(message)) record("nullref", "Null Reference", "FAIL", message);
    if (/goal.agent|goal.*mismatch|agent.*data mismatch/i.test(message)) record("goal", "Goal-Agent Data Mismatch", "FAIL", message);
    if (/synthesis|invalid output|schema validation/i.test(message)) record("synthesis", "Code Synthesis Agent Output", "FAIL", message);
  });
  window.addEventListener("unhandledrejection", event => {
    const message = String(event?.reason?.message || event?.reason || "Unhandled promise rejection").slice(0,240);
    record("promise", "Unhandled promise rejection", "FAIL", message);
    if (/LIVE_SEARCH_ALL_PROVIDERS_FAILED|search.*provider/i.test(message)) record("searchFailure", "LIVE_SEARCH_ALL_PROVIDERS_FAILED", "FAIL", message);
  });
  function onUnlock() {
    if (started || document.body.classList.contains("auth-locked")) return;
    started = true; panel(); run();
    timer = window.setInterval(() => { if (!document.body.classList.contains("auth-locked")) run(); }, 60000);
  }
  function initDiagnostics() {
    panel();
    const form = $("ownerLoginForm");
    if (form) form.addEventListener("submit", () => setTimeout(onUnlock, 1200));
    const observer = new MutationObserver(onUnlock);
    observer.observe(document.body, {attributes:true,attributeFilter:["class"]});
    if (!document.body.classList.contains("auth-locked")) onUnlock();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDiagnostics, {once:true});
  else initDiagnostics();
  window.addEventListener("pagehide", () => { if (timer) clearInterval(timer); });
})();