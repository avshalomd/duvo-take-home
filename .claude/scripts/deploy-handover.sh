#!/usr/bin/env bash
# Deploys Handover (v2) to its own Vercel project, "handover" - separate from v1 (duvo-take-home), which keeps its
# own project, database, URL and deploy.sh. It deploys from a separate folder, ../handover, a detached worktree of
# the v2 branch linked to the handover project, so this checkout (linked to v1) can never deploy v2 by mistake.
#
# It builds locally and uploads the build (--prebuilt). Vercel's own build cannot fit the Hobby plan: every route
# carries the agent's Linux binary (~240 MB), a route over 225 MB is never grouped with another, and v2's 22 routes
# became 22+ functions against a cap of 12. Locally the size budget is raised (MAX_UNCOMPRESSED_LAMBDA_SIZE, read
# by the Vercel Next builder), so routes with the same settings share a function again: 8 in all. Fluid Compute
# allows functions up to 5 GB, so the grouped ones are within limits.
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
echo "building v2 at $sha in $dir"
cd "$dir"

# Dependencies as locked, plus the SDK's Linux binary, which npm skips on a Mac. It is unpacked by hand: an install
# with --os=linux would swap every native build tool (lightningcss, ...) for its Linux twin and break the build.
npm ci --no-audit --no-fund > .vercel/install.log 2>&1 || { echo "npm ci failed:"; tail -20 .vercel/install.log; exit 1; }
ver=$(node -p "require('./node_modules/@anthropic-ai/claude-agent-sdk/package.json').optionalDependencies['@anthropic-ai/claude-agent-sdk-linux-x64']")
tmp=$(mktemp -d)
(cd "$tmp" && npm pack --silent "@anthropic-ai/claude-agent-sdk-linux-x64@$ver" > /dev/null)
mkdir -p node_modules/@anthropic-ai/claude-agent-sdk-linux-x64
tar -xzf "$tmp"/*.tgz -C node_modules/@anthropic-ai/claude-agent-sdk-linux-x64 --strip-components=1
rm -rf "$tmp"

# The project settings from Vercel, then no install inside `vercel build`: npm would prune the unpacked binary.
vercel pull --yes --environment production > /dev/null 2>&1
node -e 'const fs=require("fs"),p=".vercel/project.json",j=JSON.parse(fs.readFileSync(p));j.settings={...j.settings,installCommand:"echo installed"};fs.writeFileSync(p,JSON.stringify(j))'

rm -rf .vercel/output
log="$dir/.vercel/deploy.log"
MAX_UNCOMPRESSED_LAMBDA_SIZE=1073741824 vercel build --prod > "$log" 2>&1 || { echo "build failed:"; tail -20 "$log"; exit 1; }
funcs=$(find .vercel/output/functions -name "*.func" -type d | while read -r f; do [ -L "$f" ] || echo "$f"; done | wc -l | tr -d ' ')
carried=$(grep -l "claude-agent-sdk-linux-x64/claude" $(find .vercel/output/functions -name ".vc-config.json") | wc -l | tr -d ' ')
echo "functions: $funcs (Hobby cap 12), carrying the agent binary: $carried"
[ "$funcs" -le 12 ] || { echo "over the Hobby plan's 12 functions: refusing"; exit 1; }
[ "$carried" -gt 0 ] || { echo "no function carries the agent binary: runs would fail, refusing"; exit 1; }

vercel deploy --prebuilt --prod --yes --env APP_COMMIT="$sha" >> "$log" 2>&1 || { echo "deploy failed:"; tail -20 "$log"; exit 1; }

dep=$(grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' "$log" | tail -1)
# the stable production URL is the shortest alias of the deployment
prod=$(vercel inspect "$dep" 2>&1 | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | awk '{print length, $0}' | sort -n | head -1 | cut -d' ' -f2)
echo "$prod" > "$dir/.vercel/prod-url"
mkdir -p "$repo/.claude/run" && echo "$prod" > "$repo/.claude/run/handover-url"

# smoke, read-only: health with the database and the model, the sign-in page, a signed-out visit redirected to it
code=$(curl -s -o "$dir/.vercel/health.json" -w '%{http_code}' "$prod/api/health?deep=1" || true)
echo "health: $code $(cut -c1-200 "$dir/.vercel/health.json" 2>/dev/null)"
echo "sign-in: $(curl -s -o /dev/null -w '%{http_code}' "$prod/sign-in")"
echo "signed-out home: $(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' "$prod/")"
echo "LIVE: $prod"
