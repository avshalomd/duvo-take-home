#!/usr/bin/env bash
# Lay the stack into the empty repo, at T+0, in the background. Copies .claude/scaffold/ to the repo root (never
# over a file that already exists, so docs written before it survive), installs the pinned dependencies with
# npm ci, proves it with npm run check, and commits exactly the files it laid. Safe to run again.
# The stack: Next.js 16, React 19, TypeScript, Tailwind v4 + shadcn/ui, Drizzle on Neon Postgres, Zod 4,
# Vercel AI SDK 7, Vitest, Playwright. What each piece is for: .claude/docs/stack.md.
set -euo pipefail
cd "$(dirname "$0")/../.."
kit=.claude/scaffold
t0=$SECONDS

if [ -f package.json ] && [ -d node_modules ]; then echo "SCAFFOLD already in place"; exit 0; fi

files=$(cd "$kit" && find . -type f | sed 's|^\./||' | sort)
# A .gitignore already at the root (vercel link writes one) gets the kit's lines appended, not skipped.
if [ -f .gitignore ]; then
  grep -qxF -- "# --- from .claude/scaffold" .gitignore || { printf '\n# --- from .claude/scaffold\n' >> .gitignore; cat "$kit/.gitignore" >> .gitignore; }
fi
rsync -a --ignore-existing "$kit/" ./
echo "scaffold: $(echo "$files" | wc -l | tr -d ' ') files laid ($((SECONDS - t0))s)"

npm ci --no-audit --no-fund --loglevel=error
echo "scaffold: npm ci done ($((SECONDS - t0))s)"

log=$(mktemp)
if ! npm run check > "$log" 2>&1; then
  tail -30 "$log"; echo "SCAFFOLD CHECK FAILED ($((SECONDS - t0))s): the files are laid and installed, not committed"
  exit 1
fi

# Commit only the scaffold's own paths: the main thread may be committing docs at the same moment.
for i in 1 2 3; do
  if echo "$files" | xargs git add -f -- && echo "$files" | xargs git commit -q -m "chore: lay the stack from .claude/scaffold (Next.js 16, Drizzle on Neon, AI SDK 7)" --; then
    break
  fi
  [ "$i" = 3 ] && { echo "SCAFFOLD laid and green but NOT committed (git busy): commit it by hand"; exit 1; }
  sleep 2
done
# `scaffold` marks the kit as laid, so `git diff scaffold` is the session's own work. `baseline` is the harness
# before the task; without this tag the kit's 60-odd files would count as work done in the hour.
git tag -f scaffold >/dev/null 2>&1 || true
echo "SCAFFOLD OK in $((SECONDS - t0))s: $(git log -1 --format=%h) tagged scaffold, npm run check green. Not pushed (WP0 pushes it and the tag), never deployed by itself."
