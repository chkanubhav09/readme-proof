// README PROOF server - serves the dashboard, extracts README claims,
// runs Kane CLI against the live app, and keeps the closed-loop ledger.
// No dependencies: Node 18+ only.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { extractClaims } = require("./claims");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const RUNS = path.join(ROOT, "runs");
const LEDGER = path.join(RUNS, "ledger.json");
const README = process.env.README_PATH || path.join(ROOT, "README.md");
const PORT = Number(process.env.PORT || 4173);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const KANE = process.env.KANE_CLI || "kane-cli";

fs.mkdirSync(RUNS, { recursive: true });
if (!fs.existsSync(LEDGER)) fs.writeFileSync(LEDGER, JSON.stringify({ events: [] }, null, 2));

function readLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  } catch {
    return { events: [] };
  }
}

function writeLedger(l) {
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8",
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(buf);
  });
}

// --- Kane runs -----------------------------------------------------------

const activeRuns = new Map(); // runId -> { claimId, startedAt, status }
const runQueue = [];
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_RUNS || 4);

function enqueueRun(claim) {
  const rec = {
    type: "run",
    runId: `${Date.now().toString(36)}-${claim.id}`,
    claimId: claim.id,
    claim: claim.text,
    objective: claim.objective,
    startedAt: new Date().toISOString(),
    status: "queued",
  };
  const ledger = readLedger();
  ledger.events.push(rec);
  writeLedger(ledger);
  activeRuns.set(rec.runId, rec);
  runQueue.push({ claim, rec });
  pumpQueue();
  return rec;
}

function pumpQueue() {
  const running = [...activeRuns.values()].filter((r) => r.status === "running").length;
  while (runQueue.length && [...activeRuns.values()].filter((r) => r.status === "running").length < MAX_CONCURRENT) {
    const { claim, rec } = runQueue.shift();
    rec.status = "running";
    const ledger = readLedger();
    const evt = ledger.events.find((e) => e.runId === rec.runId);
    if (evt) evt.status = "running";
    writeLedger(ledger);
    startRun(claim, rec);
  }
}

// Authored testmd members: once a claim has an authored *_test.md, verifications
// replay its recorded steps - no LLM authoring, so a run costs no credits and
// finishes in seconds. This also makes Verify-all safe to click from inside a
// Kane run: nested runs are replays, not fresh agent-mode runs.
const TESTS = path.join(ROOT, "tests");
const TESTMD = [
  [/header-reads/i, "header_test.md"],
  [/listed-with-a-sta/i, "claims-listed_test.md"],
  [/has-a-verify-button/i, "verify-buttons_test.md"],
  [/closed-loop-section/i, "loop-section_test.md"],
  [/run-detail-including/i, "claim-detail_test.md"],
  [/link-to-its-evidence/i, "evidence-link_test.md"],
  [/narrow-screen/i, "responsive_test.md"],
  [/verify-all-starts/i, "verify-all_test.md"],
];

function testmdFor(claimId) {
  for (const [re, file] of TESTMD) {
    if (re.test(claimId)) {
      const p = path.join(TESTS, file);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function lastEvidenceUrl(claimId) {
  const ledger = readLedger();
  for (let i = ledger.events.length - 1; i >= 0; i--) {
    const e = ledger.events[i];
    if (e.type === "run" && e.claimId === claimId && e.testUrl && (e.status === "passed" || e.status === "failed")) return e.testUrl;
  }
  return null;
}

function startRun(claim, rec) {
  const runId = rec.runId;
  const ndjsonPath = path.join(RUNS, `${runId}.ndjson`);
  const out = fs.createWriteStream(ndjsonPath);

  const testmd = testmdFor(claim.id);
  const args = testmd
    ? ["testrun", "run", testmd, "--agent", "--headless"]
    : ["run", claim.objective, "--url", APP_URL, "--agent", "--headless", "--max-steps", "25"];
  const child = spawn(KANE, args, { env: process.env });

  child.stdout.on("data", (d) => {
    out.write(d);
  });
  child.stderr.on("data", () => {});
  child.on("close", (code) => {
    out.end();
    let end = null;
    try {
      const raw = fs.readFileSync(ndjsonPath, "utf8").trim().split("\n");
      for (let i = raw.length - 1; i >= 0; i--) {
        const ev = JSON.parse(raw[i]);
        if (ev.type === "run_end") {
          end = ev;
          break;
        }
      }
    } catch {}
    let member = null;
    if (testmd) {
      try {
        const raw = fs.readFileSync(ndjsonPath, "utf8").trim().split("\n");
        for (let i = raw.length - 1; i >= 0; i--) {
          const ev = JSON.parse(raw[i]);
          if (ev.type === "testrun_authored_member_end") {
            member = ev;
            break;
          }
        }
      } catch {}
    }
    const ledger2 = readLedger();
    const evt = ledger2.events.find((e) => e.runId === runId);
    if (evt) {
      if (member) {
        evt.status = member.status === "passed" ? "passed" : "failed";
        evt.duration = member.duration_s;
        evt.credits = 0; // replay of authored steps: no LLM authoring cost
        evt.summary = `replay of ${path.basename(testmd)}`;
        evt.testId = member.test_id || null;
        // Replays publish a sealed evidence pack but no share URL; keep the
        // claim's most recent agent-run evidence link alongside the replay.
        evt.testUrl = lastEvidenceUrl(claim.id);
        evt.evidenceNote = "step replay (0 credits); link is the latest agent-mode evidence for this claim";
      } else {
        evt.status = end ? end.status : code === 0 ? "passed" : "failed";
        evt.duration = end && end.duration;
        evt.credits = end && end.credits_consumed;
        evt.summary = end && end.summary;
        evt.oneLiner = end && end.one_liner;
        evt.reason = end && end.reason;
        evt.testUrl = end && end.test_url;
      }
      evt.finishedAt = new Date().toISOString();
      evt.exitCode = code;
      writeLedger(ledger2);
    }
    activeRuns.delete(runId);
    pumpQueue();
  });
  return rec;
}

// --- routes ---------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (p === "/api/state" && req.method === "GET") {
      const md = fs.existsSync(README) ? fs.readFileSync(README, "utf8") : "";
      const claims = extractClaims(md);
      const ledger = readLedger();
      return json(res, 200, {
        appUrl: APP_URL,
        claims,
        events: ledger.events.slice(-200),
        active: [...activeRuns.keys()],
      });
    }

    if (p === "/api/verify" && req.method === "POST") {
      const body = await readBody(req);
      const md = fs.readFileSync(README, "utf8");
      const claims = extractClaims(md);
      let targets = body.claimId ? claims.filter((c) => c.id === body.claimId) : claims;
      // Recursion guard: Verify-all never queues the verify-all claim itself,
      // or a Kane run clicking the button would retrigger the button forever.
      if (!body.claimId) targets = targets.filter((c) => !/verify all/i.test(c.objective));
      if (!targets.length) return json(res, 404, { error: "no matching claim" });
      const started = targets.map((c) => enqueueRun(c));
      return json(res, 202, { started: started.map((r) => r.runId) });
    }

    if (p === "/api/loop" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.note || !body.claimId) return json(res, 400, { error: "claimId and note required" });
      const ledger = readLedger();
      ledger.events.push({
        type: "fix",
        claimId: body.claimId,
        note: body.note,
        commit: body.commit || null,
        at: new Date().toISOString(),
      });
      writeLedger(ledger);
      return json(res, 201, { ok: true });
    }

    if (p.startsWith("/api/runs/") && req.method === "GET") {
      const runId = p.split("/").pop();
      const file = path.join(RUNS, `${runId}.ndjson`);
      if (!file.startsWith(RUNS) || !fs.existsSync(file)) return json(res, 404, { error: "unknown run" });
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      return fs.createReadStream(file).pipe(res);
    }

    if (p === "/" || p === "/index.html") return serveStatic(res, path.join(PUBLIC, "index.html"));
    if (p === "/readme") return serveStatic(res, README);

    const safe = path.normalize(path.join(PUBLIC, p));
    if (safe.startsWith(PUBLIC)) return serveStatic(res, safe);
    res.writeHead(403);
    return res.end();
  } catch (e) {
    return json(res, 500, { error: String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`README PROOF on ${APP_URL}`);
  console.log(`Kane binary: ${KANE}`);
});
