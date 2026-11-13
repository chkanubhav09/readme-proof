#!/usr/bin/env node
// One-shot verifier: run every README claim through Kane CLI once.
// Usage: node scripts/verify.js [claimId]
// Streams NDJSON to runs/<runId>.ndjson and updates runs/ledger.json,
// exactly like the dashboard's Verify button.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { extractClaims } = require("../claims");

const ROOT = path.join(__dirname, "..");
const RUNS = path.join(ROOT, "runs");
const LEDGER = path.join(RUNS, "ledger.json");
const README = process.env.README_PATH || path.join(ROOT, "README.md");
const APP_URL = process.env.APP_URL || "http://localhost:4173";
const KANE = process.env.KANE_CLI || "kane-cli";

function readLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  } catch {
    return { events: [] };
  }
}

function runClaim(claim) {
  return new Promise((resolve) => {
    const runId = `${Date.now().toString(36)}-${claim.id}`;
    const ndjsonPath = path.join(RUNS, `${runId}.ndjson`);
    const out = fs.createWriteStream(ndjsonPath);
    const args = ["run", claim.objective, "--url", APP_URL, "--agent", "--headless", "--max-steps", "25"];
    console.error(`[verify] ${claim.id}: ${claim.objective}`);
    const child = spawn(KANE, args, { env: process.env });
    child.stdout.on("data", (d) => out.write(d));
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
      const ledger = readLedger();
      ledger.events.push({
        type: "run",
        runId,
        claimId: claim.id,
        claim: claim.text,
        objective: claim.objective,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: end ? end.status : code === 0 ? "passed" : "failed",
        duration: end && end.duration,
        credits: end && end.credits_consumed,
        summary: end && end.summary,
        oneLiner: end && end.one_liner,
        reason: end && end.reason,
        testUrl: end && end.test_url,
        exitCode: code,
      });
      fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
      console.error(`[verify] ${claim.id}: ${end ? end.status : "exit " + code}`);
      resolve(end);
    });
  });
}

(async () => {
  const only = process.argv[2];
  const claims = extractClaims(fs.readFileSync(README, "utf8"));
  const targets = only ? claims.filter((c) => c.id === only) : claims;
  if (!targets.length) {
    console.error("no matching claims");
    process.exit(2);
  }
  let failed = 0;
  for (const c of targets) {
    const end = await runClaim(c);
    if (!end || end.status !== "passed") failed++;
  }
  process.exit(failed ? 1 : 0);
})();
