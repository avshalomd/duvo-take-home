#!/usr/bin/env bash
# Start the task clock (default 60 min). Writes .claude/run/clock; the hooks and the status line read it.
# A restart keeps the previous gate record as .claude/run/gates.prev.
set -euo pipefail
cd "$(dirname "$0")/../.."
dur="${1:-60}"; start=$(date +%s)
mkdir -p .claude/run
echo "$start $dur" > .claude/run/clock; rm -f .claude/run/clock-last .claude/run/clock-skip .claude/run/clock-ticks.log
if [ -f .claude/run/gates ]; then mv .claude/run/gates .claude/run/gates.prev; fi
echo "Clock started $(date -r "$start" +%H:%M), ${dur} min, stop at $(date -r $(( start + dur * 60 )) +%H:%M)."
.claude/scripts/gate.sh
