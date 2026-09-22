#!/usr/bin/env bash
# The task clock: .claude/run/clock ("start dur") plus the stage gates (.claude/scripts/gate.sh, which reads .claude/run/gates).
#   clock.sh            UserPromptSubmit hook: where we are, the next gate, overdue gates, FREEZE and STOP
#   clock.sh --compact  the same on one line (clock-tick.sh, during long turns)
#   clock.sh --line     the status line
d="${CLAUDE_PROJECT_DIR:-.}"; mode="${1:-}"
if [ ! -f "$d/.claude/run/clock" ]; then [ "$mode" = --line ] && echo "clock not started: .claude/scripts/clock-start.sh"; exit 0; fi
read -r start dur < "$d/.claude/run/clock"
now=$(date +%s); el=$(( (now - start) / 60 )); left=$(( dur - el ))
at() { date -r $(( start + $1 * 60 )) +%H:%M; }

# Gates: the first one not passed is next; every one past due and not recorded is overdue.
frz=$(( dur - 10 )); next=""; ndue=""; late=""; mine=""; his=""; overdue=()
while read -r id due state; do
  [ "$id" = freeze ] && frz=$due
  if [ "$state" = overdue ]; then
    late="$late,$id"
    # aligned and design are his decisions: the clock shortens them, it never closes them for him (CLAUDE.md).
    # last-deploy is his word too: deploys are on demand, so only his /ship can pass it. Telling the orchestrator
    # to "finish" it would mean deploying unasked - the clock overruling him, which is what sim 2 got wrong.
    case "$id" in
      aligned|design) his=1; overdue+=("OVERDUE: $id (due T+$due), his gate: wait for his answer, never skip it") ;;
      last-deploy) his=1; overdue+=("OVERDUE: last-deploy (due T+$due), his word: offer DEPLOY? /ship again and keep building; never deploy unasked") ;;
      *) mine=1; overdue+=("OVERDUE: $id (due T+$due)") ;;
    esac
  fi
  if [ "$state" != done ] && [ -z "$next" ]; then next=$id; ndue=$due; fi  # the first gate not yet passed, overdue or not
done < <(bash "$d/.claude/scripts/gate.sh" --status 2>/dev/null)

# FREEZE comes with the freeze gate (T+50 of 60), STOP in the last two minutes.
if [ "$left" -le 2 ]; then phase="STOP: commit and push what exists now."
elif [ "$el" -ge "$frz" ]; then phase="FREEZE: no new features. Run the wrapup skill now."
else phase=""; fi

if [ "$mode" = --line ]; then
  s=$(( now - start )); r=$(( dur * 60 - s ))
  [ "$r" -gt 0 ] || { echo "time is up"; exit 0; }
  out=$(printf "T+%02d:%02d | %02d:%02d left" $((s / 60)) $((s % 60)) $((r / 60)) $((r % 60)))
  [ -n "$late" ] && out="$out | late: ${late#,}"
  [ -n "$next" ] && out="$out | next: $next $(at "$ndue")"
  if [ "$left" -le 2 ]; then out="$out | STOP"; elif [ "$el" -ge "$frz" ]; then out="$out | FREEZE"
  elif [ "$next" != freeze ]; then out="$out | freeze $(at "$frz")"; fi
  echo "$out"; exit 0
fi

nextline=""
if [ -n "$next" ]; then
  w="in $(( ndue - el ))m"; [ "$ndue" -gt "$el" ] || w=now
  nextline="next gate: $next due $(at "$ndue") ($w)"
fi

if [ "$mode" = --compact ]; then
  msg="[clock] T+${el}m of ${dur}, ${left}m left, freeze $(at "$frz")."
  [ -n "$nextline" ] && msg="$msg $nextline."
  for o in "${overdue[@]}"; do msg="$msg $o."; done
  echo "$msg${phase:+ $phase}"; exit 0
fi

echo "[clock] $(date +%H:%M) = T+${el}m of ${dur}. ${left}m left. Freeze at $(at "$frz"), hard stop $(at "$dur").${phase:+ $phase}"
[ -n "$nextline" ] && echo "$nextline"
if [ -n "$late" ]; then
  printf '%s\n' "${overdue[@]}"
  [ -n "$mine" ] && echo "Overdue and yours: finish that stage now, cutting scope if needed, and record it with .claude/scripts/gate.sh <id>."
  [ -n "$his" ] && echo "Overdue and his (aligned, design, last-deploy): never closed or recorded by the clock. Shorten what he reads, offer the deploy again, name the wait in the status block, and take the time out of the Should tier."
fi
exit 0
