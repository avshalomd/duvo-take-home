#!/usr/bin/env bash
# Stage gates of the timed session. Due times are for a 60-minute clock; other lengths scale proportionally.
#   .claude/scripts/gate.sh <id>       record that gate <id> passed now: appends "<id> <epoch>" to .claude/run/gates
#   .claude/scripts/gate.sh            print the schedule, in clock time once the clock runs
#   .claude/scripts/gate.sh --status   one line per gate, "<id> <due minute> done|overdue|open" (read by the clock hooks)
#   .claude/scripts/gate.sh --report   planned against actual, one line per gate: paste it into the tuning notes after a run
set -euo pipefail
GATES="summary:5 aligned:12 design:17 plan:19 skeleton:22 last-deploy:45 freeze:50 pushed:57"

root="$(cd "$(dirname "$0")/../.." && pwd)"
# Called from an agent worktree, record in the main checkout, where the clock lives.
common="$(git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [ -n "$common" ] && [ -f "$(dirname "$common")/.claude/run/clock" ]; then root="$(dirname "$common")"; fi
cd "$root"

start=""; dur=60
if [ -f .claude/run/clock ]; then read -r start dur < .claude/run/clock; fi
now=$(date +%s); el=0
if [ -n "$start" ]; then el=$(( (now - start) / 60 )); fi

due() { echo $(( ($1 * dur + 30) / 60 )); }   # the 60-minute due time scaled to this clock, rounded
at() { date -r $(( start + $1 * 60 )) +%H:%M; }
passed() { if [ -f .claude/run/gates ]; then awk -v id="$1" '$1 == id { print $2; exit }' .claude/run/gates; fi; }
next_gate() {
  for g in $GATES; do
    id=${g%%:*}; d=$(due "${g#*:}")
    if [ -z "$(passed "$id")" ]; then  # the first gate not yet passed, overdue or not
      w="in $(( d - el ))m"; [ "$d" -gt "$el" ] || w=now
      echo "next gate: $id due $(at "$d") ($w)"; return 0
    fi
  done
}

case "${1:-}" in
  --status)
    [ -n "$start" ] || exit 0
    for g in $GATES; do
      id=${g%%:*}; d=$(due "${g#*:}")
      if [ -n "$(passed "$id")" ]; then s=done; elif [ "$el" -gt "$d" ]; then s=overdue; else s=open; fi
      echo "$id $d $s"
    done ;;
  --report)
    [ -n "$start" ] || { echo "clock not started"; exit 0; }
    echo "| gate | planned | actual | late by |"; echo "|---|---|---|---|"
    for g in $GATES; do
      id=${g%%:*}; d=$(due "${g#*:}"); t=$(passed "$id")
      if [ -n "$t" ]; then a=$(( (t - start) / 60 )); l=$(( a - d )); [ "$l" -gt 0 ] || l=0; echo "| $id | T+$d | T+$a | $l |"
      else echo "| $id | T+$d | not passed | |"; fi
    done ;;
  "")
    echo "gates, ${dur}-minute clock${start:+, started $(at 0)}"
    for g in $GATES; do
      id=${g%%:*}; d=$(due "${g#*:}"); t=$(passed "$id"); when=""
      if [ -n "$t" ] && [ -n "$start" ]; then when="passed T+$(( (t - start) / 60 ))"; elif [ -n "$t" ]; then when="passed"; fi
      printf "  %-14s T+%-3s %s%s\n" "$id" "$d" "${start:+$(at "$d")  }" "$when"
    done ;;
  *)
    id="$1"; d=""
    for g in $GATES; do if [ "${g%%:*}" = "$id" ]; then d=$(due "${g#*:}"); fi; done
    if [ -z "$d" ]; then
      echo "unknown gate '$id'; the gates are: $(echo "$GATES" | sed 's/:[0-9]*//g')" >&2; exit 2
    fi
    mkdir -p .claude/run; echo "$id $now" >> .claude/run/gates
    if [ -z "$start" ]; then echo "gate $id recorded; clock not started (.claude/scripts/clock-start.sh)"; exit 0; fi
    if [ "$el" -gt "$d" ]; then echo "gate $id passed at T+$el (due T+$d), late by $(( el - d )) min"
    else echo "gate $id passed at T+$el (due T+$d)"; fi
    next_gate ;;
esac
