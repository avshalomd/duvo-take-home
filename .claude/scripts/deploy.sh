#!/usr/bin/env bash
# The production deploy of Handover, with the read-only smoke that follows every deploy. Deploys are manual: the Vercel
# project "handover" is not connected to GitHub and vercel.json turns Git deploys off, so nothing ships on a push.
#
# Vercel builds it (a local build cannot be uploaded: the Hobby plan caps one uploaded file at 100 MB, and the agent's
# Linux binary is ~240 MB). Runs execute in /api/runner/<id>, the only function that carries that binary
# (RUNNER=route, next.config.ts); the smoke checks health reports it.
# Usage: .claude/scripts/deploy.sh   (deploys the committed HEAD; prints the URL last)
set -euo pipefail
cd "$(dirname "$0")/../.."

[ "$(node -e 'console.log(require("./.vercel/project.json").projectName)' 2>/dev/null)" = "handover" ] ||
  { echo "this checkout is not linked to the Vercel project handover (vercel link --project handover): refusing"; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "commit your changes first: the deploy is the committed HEAD"; exit 1; }

sha="$(git rev-parse --short HEAD)"
echo "deploying $sha"
log=.vercel/deploy.log
vercel deploy --prod --yes --env APP_COMMIT="$sha" > "$log" 2>&1 || { echo "deploy failed:"; tail -20 "$log"; exit 1; }

dep=$(grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' "$log" | head -1)
# the stable production URL is the shortest alias of the deployment
prod=$(vercel inspect "$dep" 2>&1 | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | awk '{print length, $0}' | sort -n | head -1 | cut -d' ' -f2)
echo "$prod" > .vercel/prod-url

# smoke, read-only: health with the database and the model, the sign-in page, a signed-out visit redirected to it
code=$(curl -s -o .vercel/health.json -w '%{http_code}' "$prod/api/health?deep=1" || true)
echo "health: $code $(cut -c1-200 .vercel/health.json 2>/dev/null)"
grep -q '"runner":"route"' .vercel/health.json ||
  echo "WARNING: runs will fail - set RUNNER=route (node .claude/scripts/handover-env.mjs RUNNER=route) and deploy again"
echo "sign-in: $(curl -s -o /dev/null -w '%{http_code}' "$prod/sign-in")"
echo "signed-out home: $(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' "$prod/")"
echo "runner without a token: $(curl -s -o /dev/null -w '%{http_code}' -X POST "$prod/api/runner/00000000-0000-4000-8000-000000000000") (401 expected)"
echo "LIVE: $prod"
