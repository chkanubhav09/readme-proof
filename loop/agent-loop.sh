#!/usr/bin/env bash
# agent-loop.sh - the closed loop.
# Verify every claim; for each failure, write a structured brief the coding
# agent reads (run_end + evidence path), then stop and hand over. After the
# agent's fix lands, run again. Green suite = loop closed.
#
# Usage: npm run loop
set -u
cd "$(dirname "$0")/.."

APP_URL="${APP_URL:-http://localhost:4173}"
INBOX=loop/inbox
mkdir -p "$INBOX"

echo "[loop] verifying all claims against $APP_URL"
if node scripts/verify.js; then
  echo "[loop] all claims green. loop closed."
  rm -f "$INBOX"/*.json 2>/dev/null
  exit 0
fi

echo "[loop] failures found - writing agent briefs"
node - <<'EOF'
const fs = require("fs");
const path = require("path");
const ledger = JSON.parse(fs.readFileSync("runs/ledger.json", "utf8"));
const latest = {};
for (const e of ledger.events) if (e.type === "run") latest[e.claimId] = e;
for (const [claimId, run] of Object.entries(latest)) {
  if (run.status === "failed") {
    const brief = {
      claimId,
      claim: run.claim,
      objective: run.objective,
      failure: { reason: run.reason, summary: run.summary, testUrl: run.testUrl },
      evidence: `runs/${run.runId}.ndjson`,
      instruction:
        "Read the NDJSON run_end and the .evidence pack. Fix the app (or correct the README claim). " +
        "Record the fix with: curl -X POST " + (process.env.APP_URL || "http://localhost:4173") +
        "/api/loop -d '{\"claimId\":\"" + claimId + "\",\"note\":\"what you changed\",\"commit\":\"<sha>\"}' -H 'content-type: application/json'. " +
        "Then re-run: npm run loop",
    };
    fs.writeFileSync(path.join("loop/inbox", claimId + ".json"), JSON.stringify(brief, null, 2));
    console.log("[loop] brief:", "loop/inbox/" + claimId + ".json");
  }
}
EOF
echo "[loop] hand the briefs to your coding agent, then re-run: npm run loop"
exit 1
