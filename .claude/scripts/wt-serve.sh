#!/usr/bin/env bash
# Serve a worktree on its own port, detached so the server outlives whoever started it. Idempotent: if the port is
# already served from the same tree, it only waits for it and prints the URL.
# Usage: .claude/scripts/wt-serve.sh <tree> <port>      (main stays on 3000, packages use 3001+ in plan order)
#        .claude/scripts/wt-serve.sh --stop <port>
# Log and pid: <tree>/.next/dev-<port>.log and .pid (gitignored).
set -uo pipefail

listeners() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null; }
cwd_of() { lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'; }
is_next() { ps -o command= -p "$1" 2>/dev/null | grep -q next; }

if [ "${1:-}" = "--stop" ]; then
  port="${2:?usage: wt-serve.sh --stop <port>}"
  pids=$(listeners "$port")
  [ -n "$pids" ] || { echo "nothing listens on :$port"; exit 0; }
  me=$(ps -o pgid= -p $$ | tr -d ' ')
  for p in $pids; do
    # A server started by this script leads its own process group (npx, next dev, the server): end all of it.
    g=$(ps -o pgid= -p "$p" | tr -d ' ')
    if [ -n "$g" ] && [ "$g" != "$me" ] && is_next "$g"; then kill -TERM -- "-$g"; else kill -TERM "$p"; fi
  done
  for _ in $(seq 20); do [ -z "$(listeners "$port")" ] && break; sleep 0.5; done
  [ -n "$(listeners "$port")" ] && kill -KILL $(listeners "$port") 2>/dev/null
  echo "stopped :$port"
  exit 0
fi

tree="$(cd "${1:?usage: wt-serve.sh <tree> <port>}" && pwd -P)" || exit 1
port="${2:?usage: wt-serve.sh <tree> <port>}"
url="http://localhost:$port/"
log="$tree/.next/dev-$port.log"
pidf="$tree/.next/dev-$port.pid"

pids=$(listeners "$port")
if [ -n "$pids" ]; then
  holder="$(cwd_of "$(echo "$pids" | head -1)")"
  if [ "$holder" != "$tree" ]; then
    echo "port $port is busy, held by ${holder:-an unknown process}, not $tree:"
    lsof -nP -iTCP:"$port" -sTCP:LISTEN
    exit 1
  fi
  echo "already running: $tree on :$port"
elif [ -f "$pidf" ] && kill -0 "$(cat "$pidf")" 2>/dev/null && is_next "$(cat "$pidf")"; then
  echo "already starting: $tree on :$port"
else
  [ -e "$tree/node_modules" ] || { echo "no node_modules in $tree: run .claude/scripts/wt-setup.sh there first"; exit 1; }
  mkdir -p "$tree/.next"
  cd "$tree"
  set -m # its own process group: it survives the caller's cleanup, and --stop can end it as one
  nohup npx next dev -p "$port" > "$log" 2>&1 < /dev/null &
  echo $! > "$pidf"
  disown
  set +m
  echo "starting: $tree on :$port (log $log)"
fi

end=$((SECONDS + 60))
while [ "$SECONDS" -lt "$end" ]; do
  code=$(curl -sL -o /dev/null -m 15 -w '%{http_code}' "$url" || true)
  [ "$code" = "200" ] && { echo "SERVING $url"; exit 0; }
  if [ -z "$(listeners "$port")" ] && ! { [ -f "$pidf" ] && kill -0 "$(cat "$pidf")" 2>/dev/null; }; then
    echo "the dev server exited; last lines of $log:"; tail -15 "$log"; exit 1
  fi
  sleep 1
done
echo "no 200 on $url after 60 s (last code ${code:-none}); last lines of $log:"
tail -15 "$log"
exit 1
