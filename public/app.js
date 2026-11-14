// README PROOF dashboard client.
const $ = (sel) => document.querySelector(sel);

let state = { claims: [], events: [], active: [] };
let selected = null;

const CONCLUSIVE = ["passed", "failed"];

function latestRunFor(claimId) {
  const runs = state.events.filter((e) => e.type === "run" && e.claimId === claimId);
  return runs[runs.length - 1] || null;
}

// Badge status follows the latest CONCLUSIVE run; an interrupted run
// (sandbox/CI killed it) stays in the ledger and loop timeline but
// does not shadow the last real result.
function latestConclusiveRunFor(claimId) {
  const runs = state.events.filter((e) => e.type === "run" && e.claimId === claimId && CONCLUSIVE.includes(e.status));
  return runs[runs.length - 1] || null;
}

function statusOf(claim) {
  if (state.active.some((id) => id.endsWith(claim.id))) return "running";
  const r = latestConclusiveRunFor(claim.id);
  return r ? r.status : "unverified";
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function refresh() {
  const res = await fetch("/api/state");
  state = await res.json();
  render();
  if (state.active.length) setTimeout(refresh, 1500);
}

function render() {
  $("#app-url").textContent = state.appUrl;

  const verified = state.claims.filter((c) => statusOf(c) === "passed").length;
  $("#score").textContent = state.claims.length
    ? `${verified}/${state.claims.length} claims verified`
    : "no claims found in README";

  const ul = $("#claims");
  ul.innerHTML = "";
  for (const c of state.claims) {
    const st = statusOf(c);
    const run = latestRunFor(c.id);
    const li = document.createElement("li");
    li.className = "claim" + (selected === c.id ? " selected" : "");
    li.innerHTML = `
      <div class="claim-top">
        <span class="badge ${st}">${st}</span>
        <span class="claim-text"></span>
      </div>
      <div class="claim-meta">
        ${run ? `<span>${fmtTime(run.startedAt)}</span>` : "<span>never run</span>"}
        ${run && run.duration ? `<span>${run.duration.toFixed(1)}s</span>` : ""}
        ${run && run.credits ? `<span>${run.credits.toFixed(1)} cr</span>` : ""}
      </div>
      <div class="claim-meta">
        <button class="btn small" data-verify>Verify</button>
        <button class="btn small" data-detail>Detail</button>
      </div>`;
    li.querySelector(".claim-text").textContent = c.text;
    li.querySelector("[data-verify]").addEventListener("click", (e) => {
      e.stopPropagation();
      verify(c.id);
    });
    li.querySelector("[data-detail]").addEventListener("click", (e) => {
      e.stopPropagation();
      select(c.id);
    });
    li.addEventListener("click", () => select(c.id));
    ul.appendChild(li);
  }

  renderLoop();
  if (selected) renderDetail(selected);
}

function renderLoop() {
  const ol = $("#loop");
  ol.innerHTML = "";
  const evts = state.events.filter((e) => e.type === "run" || e.type === "fix").slice(-40);
  if (!evts.length) {
    ol.innerHTML = `<li class="fix"><span class="what">No loop activity yet. Run a claim to start the loop.</span></li>`;
    return;
  }
  for (const e of evts) {
    const li = document.createElement("li");
    if (e.type === "run") {
      li.className = e.status === "passed" ? "run-passed" : e.status === "failed" ? "run-failed" : "fix";
      li.innerHTML = `<span class="when">${fmtTime(e.startedAt)}</span>
        <span class="what"><strong>Kane ${e.status}</strong> · <code></code>${e.oneLiner ? " · " + escapeHtml(e.oneLiner) : ""}</span>`;
      li.querySelector("code").textContent = e.claimId;
    } else {
      li.className = "fix";
      li.innerHTML = `<span class="when">${fmtTime(e.at)}</span>
        <span class="what"><strong>agent fix</strong> · <code></code> · ${escapeHtml(e.note)}${e.commit ? " · " + escapeHtml(e.commit) : ""}</span>`;
      li.querySelector("code").textContent = e.claimId;
    }
    ol.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function select(claimId) {
  selected = claimId;
  render();
}

async function renderDetail(claimId) {
  const claim = state.claims.find((c) => c.id === claimId);
  // Detail follows the same rule as the badge: the latest CONCLUSIVE run.
  // An interrupted run has no evidence to show and must not mask the last
  // real proof (found by Kane: passed claims showed interrupted details).
  const run = latestConclusiveRunFor(claimId) || latestRunFor(claimId);
  $("#detail-title").textContent = claim ? claim.text : "Run detail";
  const el = $("#detail");
  const link = $("#evidence-link");
  if (!run) {
    el.className = "detail empty";
    el.textContent = "Never verified. Hit Verify to run this claim with Kane CLI.";
    link.hidden = true;
    $("#ndjson").hidden = true;
    return;
  }
  el.className = "detail";
  el.innerHTML = "";
  const rows = [
    ["status", run.status],
    ["objective", run.objective],
    ["started", fmtTime(run.startedAt)],
    ["duration", run.duration ? run.duration.toFixed(1) + "s" : "-"],
    ["credits", run.credits ? run.credits.toFixed(2) : "-"],
    ["summary", run.summary || "-"],
    ["reason", run.reason || "-"],
  ];
  for (const [k, v] of rows) {
    const div = document.createElement("div");
    div.innerHTML = `<span class="k">${k}: </span>`;
    div.appendChild(document.createTextNode(v ?? "-"));
    el.appendChild(div);
  }
  if (run.testUrl) {
    link.hidden = false;
    link.href = run.testUrl;
  } else {
    link.hidden = true;
  }

  const nd = $("#ndjson");
  nd.hidden = false;
  nd.textContent = "loading event stream…";
  try {
    const res = await fetch(`/api/runs/${run.runId}`);
    const text = await res.text();
    nd.textContent = text.trim().split("\n").slice(-14).join("\n");
  } catch {
    nd.textContent = "event stream unavailable";
  }
}

async function verify(claimId) {
  await fetch("/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(claimId ? { claimId } : {}),
  });
  setTimeout(refresh, 400);
}

$("#verify-all").addEventListener("click", () => verify(null));

refresh();
