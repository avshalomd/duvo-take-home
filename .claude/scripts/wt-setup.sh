#!/usr/bin/env bash
# First step of every package agent, run in its worktree: gives it node_modules from the main checkout and makes
# sure .env.local is there (copied from the main checkout if .worktreeinclude did not bring it). Never prints a
# secret, only the names of the variables in .env.local. Safe to run again.
# node_modules is an APFS clone (cp -c: about 5 s, no extra disk), not a symlink: Next stops its root at the
# worktree boundary and Turbopack refuses a node_modules link that points outside it.
set -euo pipefail
cd "$(dirname "$0")/../.."
tree="$(pwd -P)"
main="$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd -P)"
branch="$(git branch --show-current)"

if [ "$tree" = "$main" ]; then
  nm="main checkout, node_modules not touched"
elif [ -d node_modules ] && [ ! -L node_modules ]; then
  nm="node_modules present"
elif [ -d "$main/node_modules" ]; then
  [ -L node_modules ] && rm node_modules # a link from an earlier setup: Turbopack cannot use it
  src="$(cd "$main/node_modules" && pwd -P)"
  if cp -Rc "$src" node_modules 2> /dev/null; then
    nm="node_modules cloned from main"
  else
    rm -rf node_modules
    ln -s "$main/node_modules" node_modules
    nm="node_modules LINKED (clone failed): tsc, eslint and vitest work, next dev will not"
  fi
else
  nm="node_modules MISSING (none in the main checkout either: run npm ci there)"
fi

if [ -f .env.local ]; then
  env_state=".env.local present"
elif [ "$tree" != "$main" ] && [ -f "$main/.env.local" ]; then
  cp "$main/.env.local" .env.local
  env_state=".env.local copied from main"
else
  env_state=".env.local MISSING (none in the main checkout either)"
fi
if [ -f .env.local ]; then
  names="$(sed -nE 's/^(export +)?([A-Za-z_][A-Za-z0-9_]*)=.*/\2/p' .env.local | paste -sd ' ' -)"
  env_state="$env_state, $(grep -cE '^(export +)?[A-Za-z_][A-Za-z0-9_]*=' .env.local || true) vars: ${names:-none}"
fi

echo "wt-setup: $tree (branch ${branch:-detached}), main checkout $main"
echo "wt-setup: $nm; $env_state"
