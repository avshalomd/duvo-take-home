#!/usr/bin/env bash
# PostToolUse hook: during long autonomous turns, re-announce the clock and the gates once per 5-minute bucket.
# The hook also fires for every SUBAGENT's tool calls (their input carries a non-empty "agent_id"), and with five
# packages building they would use up each bucket before the orchestrator made a call. The tick is the
# orchestrator's: a subagent's call leaves the bucket alone. Who got each tick: .claude/run/clock-ticks.log.
input=$(cat)
d="${CLAUDE_PROJECT_DIR:-.}"; f="$d/.claude/run/clock"
[ -f "$f" ] || exit 0
read -r start dur < "$f"
el=$(( ($(date +%s) - start) / 60 )); bucket=$(( el / 5 ))
last=$(cat "$d/.claude/run/clock-last" 2>/dev/null || echo -1)
[ "$bucket" -gt "$last" ] || exit 0
if [[ "$input" =~ \"agent_id\"[[:space:]]*:[[:space:]]*\"[^\"]+\" ]]; then
  skipped=$(cat "$d/.claude/run/clock-skip" 2>/dev/null || echo -1)
  if [ "$bucket" -gt "$skipped" ]; then
    echo "$bucket" > "$d/.claude/run/clock-skip"
    echo "T+$el bucket $bucket: a subagent's call, left for the orchestrator" >> "$d/.claude/run/clock-ticks.log"
  fi
  exit 0
fi
echo "$bucket" > "$d/.claude/run/clock-last"
echo "T+$el bucket $bucket: delivered to the orchestrator" >> "$d/.claude/run/clock-ticks.log"
msg=$(CLAUDE_PROJECT_DIR="$d" bash "$d/.claude/hooks/clock.sh" --compact)
printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":%s}}\n' "$(printf '%s' "$msg" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"
