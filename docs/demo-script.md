# Demo video script

Recorded and submitted: https://youtu.be/gA3Nt-EHHU8 (3:10, narrated, bottom
caption strip). The script below is the outline the recorded cut follows.

Target: show the loop closing, live. Solo entry, screen recording + voiceover.

1. **Hook (0:00-0:20)** - "My README says my app does eight things. Does it?
   README PROOF turns the README into a test suite and proves every claim with
   Kane CLI - and when a claim fails, the agent fixes the app and Kane re-checks."
2. **The app (0:20-0:50)** - open the dashboard (localhost:4173). Show the claims
   extracted from the repo's own README, statuses, run detail, evidence link.
3. **One run, close up (0:50-1:40)** - click Verify on "The page header reads
   README PROOF". Show the NDJSON stream landing, the `run_end` event, the Test
   Manager evidence link opening with the recorded session.
4. **The loop (1:40-3:20)** - the money shot. Show the intentionally failing
   claim: Kane fails it, the failure brief lands in `loop/inbox/`, the agent edits
   the app, commits, Kane re-runs green. Show the Closed loop timeline:
   red run -> agent fix (commit sha) -> green run.
5. **Replayable suite (3:20-4:10)** - `kane-cli testrun run --tags readme`:
   committed `_test.md` files replay from cache, one sealed evidence pack,
   exit code gates CI.
6. **Close (4:10-4:30)** - phone view of the dashboard, one line on craft:
   "Your README is a test suite. Install it tonight, point it at your repo."
