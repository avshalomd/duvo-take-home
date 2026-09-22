#!/usr/bin/env bash
# Add a secret without it ever appearing on screen: writes .env.local and Vercel (production + preview).
# Usage: .claude/scripts/set-secret.sh ANTHROPIC_API_KEY     (run it yourself, in a plain terminal)
set -euo pipefail
cd "$(dirname "$0")/../.."
name="$1"
read -r -s -p "Paste value for $name (hidden): " val; echo
touch .env.local
grep -v "^${name}=" .env.local > .env.local.tmp || true
mv .env.local.tmp .env.local
printf '%s="%s"\n' "$name" "$val" >> .env.local
for env in production preview; do
  printf '%s' "$val" | vercel env add "$name" "$env" --force >/dev/null 2>&1 && echo "vercel $env: $name set" || echo "vercel $env: FAILED for $name"
done
echo ".env.local: $name set (${#val} chars)"
