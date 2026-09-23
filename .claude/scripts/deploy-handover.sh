#!/usr/bin/env bash
# Deploys Handover (v2) to its own Vercel project, "handover" - separate from v1 (duvo-take-home), which keeps its
# own project, database, URL and deploy.sh. It deploys from a separate folder, ../handover, a detached worktree of
# the v2 branch linked to the handover project, so this checkout (linked to v1) can never deploy v2 by mistake.
# Usage: .claude/scripts/deploy-handover.sh   (deploys the committed HEAD of the v2 branch; prints the URL last)
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd -P)"
dir="$(cd "$repo/.." && pwd -P)/handover"

[ -d "$dir/.vercel" ] || { echo "no deploy folder at $dir (git worktree add --detach ../handover v2; vercel link --project handover)"; exit 1; }
[ "$(node -e 'console.log(require(process.argv[1]).projectName)' "$dir/.vercel/project.json")" = "handover" ] ||
  { echo "the deploy folder is not linked to the handover project: refusing"; exit 1; }
[ -z "$(git -C "$repo" status --porcelain --untracked-files=no)" ] || { echo "commit your changes on v2 first: the deploy is the committed v2 HEAD"; exit 1; }

git -C "$dir" checkout -q --detach v2
sha="$(git -C "$dir" rev-parse --short HEAD)"
echo "deploying v2 at $sha from $dir"

log="$dir/.vercel/deploy.log"
(cd "$dir" && vercel deploy --prod --yes --env APP_COMMIT="$sha" > "$log" 2>&1) || { echo "deploy failed:"; tail -20 "$log"; exit 1; }

dep=$(grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' "$log" | head -1)
# the stable production URL is the shortest alias of the deployment
prod=$(cd "$dir" && vercel inspect "$dep" 2>&1 | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | awk '{print length, $0}' | sort -n | head -1 | cut -d' ' -f2)
echo "$prod" > "$dir/.vercel/prod-url"
mkdir -p "$repo/.claude/run" && echo "$prod" > "$repo/.claude/run/handover-url"

# smoke, read-only: health with the database and the model, the sign-in page, a signed-out visit redirected to it
code=$(curl -s -o "$dir/.vercel/health.json" -w '%{http_code}' "$prod/api/health?deep=1" || true)
echo "health: $code $(cut -c1-200 "$dir/.vercel/health.json" 2>/dev/null)"
echo "sign-in: $(curl -s -o /dev/null -w '%{http_code}' "$prod/sign-in")"
echo "signed-out home: $(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' "$prod/")"
echo "LIVE: $prod"
