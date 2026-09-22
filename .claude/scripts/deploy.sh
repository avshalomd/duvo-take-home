#!/usr/bin/env bash
# Production deploy + smoke test against the public production URL. Prints the URL last.
# Attempt 1 builds on Vercel. A deploy that does not finish within DEPLOY_TIMEOUT seconds (default 180) is cancelled,
# so it cannot hold the Hobby account's single build slot, and attempt 2 builds locally and uploads the output
# (--prebuilt). If both fail, the previous deploy stays live: say so, demo locally, and keep going.
# Only e2e/smoke.spec.ts runs against production, and it must stay read-only (dev and prod share one database).
set -uo pipefail
cd "$(dirname "$0")/../.."
LIMIT="${DEPLOY_TIMEOUT:-180}"
log=.vercel/deploy.log

attempt() {
  : > "$log"
  if [ "$1" = 1 ]; then
    perl -e 'alarm shift; exec @ARGV' "$LIMIT" \
      vercel deploy --prod --yes --env APP_COMMIT="$(git rev-parse --short HEAD)" > "$log" 2>&1
  else
    echo "building locally for a prebuilt deploy..."
    vercel pull --yes --environment=production > /dev/null 2>&1 &&
      APP_COMMIT="$(git rev-parse --short HEAD)" vercel build --prod > .vercel/build.log 2>&1 ||
      { echo "local build failed:"; tail -20 .vercel/build.log; return 1; }
    perl -e 'alarm shift; exec @ARGV' "$LIMIT" \
      vercel deploy --prebuilt --prod --yes --env APP_COMMIT="$(git rev-parse --short HEAD)" > "$log" 2>&1
  fi
}

cancel_stuck() {
  local url id
  url=$(grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' "$log" | head -1)
  [ -n "$url" ] || { echo "no deployment was created"; return; }
  id=$(vercel inspect "$url" 2>&1 | awk '$1=="id"{print $2}')
  echo "cancelling stuck deployment $url ($id)"
  [ -n "$id" ] && vercel api "/v12/deployments/$id/cancel" -X PATCH > /dev/null 2>&1 && echo "cancelled"
}

ok=0
for n in 1 2; do
  echo "deploy attempt $n (timeout ${LIMIT}s)..."
  if attempt "$n"; then ok=1; break; fi
  echo "attempt $n failed or timed out; last lines:"; tail -8 "$log"
  cancel_stuck
done
[ "$ok" = 1 ] || { echo "DEPLOY FAILED twice (Vercel queue). The previous deploy is still live: $(cat .vercel/prod-url 2>/dev/null). Keep building; demo locally; retry later."; exit 1; }

dep=$(grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' "$log" | head -1)
prod=$(vercel inspect "$dep" 2>&1 | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | grep -v "$dep" | awk '{print length, $0}' | sort -n | head -1 | cut -d' ' -f2)
prod="${prod:-$dep}"
echo "deployment: $dep"
echo "production: $prod"
echo "$prod" > .vercel/prod-url
code=$(curl -s -o .vercel/health.json -w '%{http_code}' "$prod/api/health?deep=1" || true)
echo "health: $code $(cut -c1-300 .vercel/health.json 2>/dev/null)"
[ "$code" = "200" ] || { echo "SMOKE FAILED"; exit 1; }
grep -q '"usable":false' .vercel/health.json && echo "WARNING: the LLM is configured but NOT usable in production (see ai.error above)"
grep -q '"provider":"none"' .vercel/health.json && echo "WARNING: no LLM configured in production"
# The smoke's own exit code decides: piped straight to tail it was lost, and a failed smoke still ended in LIVE.
BASE_URL="$prod" npx playwright test e2e/smoke.spec.ts --reporter=line > .vercel/smoke.log 2>&1; smoke=$?
tail -3 .vercel/smoke.log
[ "$smoke" = 0 ] || { echo "SMOKE FAILED (playwright, exit $smoke): deployed at $prod but the smoke test did not pass - read .vercel/smoke.log"; exit 1; }
echo "LIVE: $prod"
