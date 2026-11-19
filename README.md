# README PROOF

Your README is a test suite. README PROOF reads the claims your README makes about
your app, compiles each one into a Kane CLI flow, runs it against the live app in a
real browser, and shows proof per claim: pass, fail, and a sealed evidence pack.

Built with an AI coding agent. Verified by [Kane CLI](https://www.testmuai.com/kane-cli/).
The loop is the point: Kane does not just check the app, its output drives the next fix.

## The loop

```
 README claim ──▶ Kane CLI flow ──▶ run in real Chrome
                                       │
                              fail ◀──┴──▶ pass
                               │              │
              NDJSON run_end + .evidence      │
              pack read by the agent          │
                               │              │
                     agent edits the app      │
                     (or the README)          │
                               │              │
                               └────▶ re-run ─┘
```

Every iteration is recorded in the ledger (`runs/ledger.json`) and shown on the
dashboard's Closed loop timeline: red run, agent fix with commit, green run.

## Quickstart

```bash
npm install -g @testmuai/kane-cli   # the verifier
kane-cli login                       # one-time auth
npm start                            # serves the dashboard on http://localhost:4173
npm run verify                       # verify every claim, one pass
npm run loop                         # verify, brief the agent on failures, repeat to green
```

Open http://localhost:4173 — the dashboard verifies itself. The claims below are
extracted from this file and run against the page you are looking at.

## Verified Claims

- The page header reads README PROOF
- Every claim from the README is listed with a status badge
- Each listed claim has a Verify button
- The dashboard shows a Closed loop section with the run and fix timeline
- Clicking Verify all starts a verification run for every claim
- Selecting a claim shows its run detail, including status and summary
- A passing claim shows a link to its evidence :: verify: open the run detail of a claim whose status badge says passed, then verify an evidence link is shown
- On a narrow screen the panels stack in a single column :: verify: assert the Claims panel and the Run detail panel are stacked vertically in one column, not side by side

## What the dashboard shows

- **Claims** - every claim in this README, with live status (unverified / running /
  passed / failed), last run time, duration, and credit cost.
- **Run detail** - the full `run_end` result and the NDJSON event stream for the
  latest run of the selected claim, plus the Test Manager evidence link.
- **Closed loop** - the interleaved timeline of Kane runs and agent fixes, so the
  verify → fix → re-verify cycle is visible instead of implied.

## Replayable tests

`tests/` holds the authored `_test.md` files, one per claim, so the suite replays in CI:

```bash
kane-cli testrun run --match '^tests/' --tags readme --headless
```

## Repo layout

```
claims.js        README claim extractor (shared by server and CLI)
server.js        dashboard backend: static, /api/state, /api/verify, /api/loop
public/          responsive dashboard (no build step)
loop/            the closed loop: agent-loop.sh + on-save hook
tests/           committed replayable *_test.md files
runs/            NDJSON event streams + ledger.json (the proof)
scripts/verify.js  one-shot verifier used by npm run verify
```

## How it was built

An AI coding agent wrote the app; Kane CLI verified it. During the build the loop
closed for real: one claim failed on the first run, the agent read the `run_end`
failure and the `.evidence` pack, fixed the app, and the next run went green. That
iteration is preserved in `runs/ledger.json` and told in the demo video.

## Hackathon

Entry for the Kane CLI Online Hackathon (Nov 12-26, 2026), solo. Agent: an AI coding
agent driving the repo; verifier: Kane CLI in agent mode (`--agent --headless`),
NDJSON `run_end` events parsed programmatically after every run.
