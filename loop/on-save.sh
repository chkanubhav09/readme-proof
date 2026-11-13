#!/usr/bin/env bash
# on-save.sh - hook: re-verify on every save.
# Watches app source and README; on change, runs the closed loop.
# Needs inotifywait (Linux) or fswatch (macOS). With Claude Code, prefer a
# PostToolUse hook on Edit|Write that runs: npm run loop
set -u
cd "$(dirname "$0")/.."

WATCH="README.md server.js claims.js public tests"

if command -v inotifywait >/dev/null; then
  echo "[on-save] watching with inotifywait"
  while inotifywait -q -e modify,create $WATCH -r; do
    npm run loop || true
  done
elif command -v fswatch >/dev/null; then
  echo "[on-save] watching with fswatch"
  fswatch -o $WATCH | while read -r _; do
    npm run loop || true
  done
else
  echo "[on-save] install inotify-tools or fswatch, or use your agent's hook:"
  echo '  Claude Code settings.json: { "hooks": { "PostToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "npm run loop" }] }] } }'
  exit 1
fi
