#!/usr/bin/env bash
set -euo pipefail

# Deploy API (reads open + KV fallback) and publish site to Cloudflare Pages
# Usage:
#   PROJECT=teamschedulecc DOMAIN=teamschedule.cc bash scripts/deploy-to-pages.sh
# Defaults:
#   PROJECT=${PROJECT:-teamschedulecc}
#   DOMAIN=${DOMAIN:-teamschedule.cc}

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
API_DIR="$ROOT_DIR/team-schedule-api"
PROJECT_NAME="${PROJECT:-teamschedulecc}"
DOMAIN_NAME="${DOMAIN:-teamschedule.cc}"

echo "[1/5] Node version (need >= 20.19 or 22.12)"
node -v || { echo "Node not found"; exit 1; }
VER=$(node -p "process.versions.node"); MAJOR=${VER%%.*}; if [ "$MAJOR" -lt 20 ]; then echo "Node $VER too old. nvm use 22"; exit 1; fi

echo "[2/5] Configure Worker for immediate data visibility (gate off; keep D1)"
perl -0777 -pe 's/\bREQUIRE_SITE_SESSION\s*=\s*"true"/REQUIRE_SITE_SESSION = "false"/g' -i "$API_DIR/wrangler.toml"
rg -n 'REQUIRE_SITE_SESSION|USE_D1' "$API_DIR/wrangler.toml" || true

echo "[3/5] Deploy Cloudflare Worker"
pushd "$API_DIR" >/dev/null
npx --yes wrangler@4 deploy
popd >/dev/null

echo "[4/5] Build site"
pushd "$ROOT_DIR" >/dev/null
rm -rf dist
npm ci
npm run build
popd >/dev/null

echo "[5/5] Publish to Cloudflare Pages project: $PROJECT_NAME"
npx --yes wrangler@4 pages deploy dist --project-name "$PROJECT_NAME"
echo "Mapping custom domain: $DOMAIN_NAME (idempotent)"
npx --yes wrangler@4 pages domain add "$PROJECT_NAME" "$DOMAIN_NAME" || true

echo "--- Verify ---"
echo "API version:    https://api.$DOMAIN_NAME/api/_version"
echo "API schedule:   https://api.$DOMAIN_NAME/api/schedule"
echo "Pages origin:   https://$PROJECT_NAME.pages.dev/?v=$(date +%s)"
echo "Custom domain:  https://$DOMAIN_NAME/?v=$(date +%s)"
