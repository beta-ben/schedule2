#!/usr/bin/env bash
set -euo pipefail

# Opinionated one-button deploy for prod API + site
# - Turns reads ON immediately (REQUIRE_SITE_SESSION=false); keeps D1 as primary (USE_D1 stays 1)
# - Deploys the Cloudflare Worker via wrangler
# - Builds the site and force-publishes to GitHub Pages (gh-pages branch)
#
# Prereqs on your machine:
# - Node.js >= 20.19 or 22.12 (node -v)
# - Cloudflare auth (CLOUDFLARE_API_TOKEN env or `npx wrangler login`)
# - GitHub auth for publish (either `gh auth login && gh auth setup-git`, or export GH_TOKEN with repo scope)

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
API_DIR="$ROOT_DIR/team-schedule-api"

echo "[1/5] Checking Node version (need >= 20.19 or 22.12)"
node -v || { echo "Node not found"; exit 1; }

VER=$(node -p "process.versions.node")
MAJOR=${VER%%.*}
if [ "$MAJOR" -lt 20 ]; then
  echo "Node $VER too old. Please 'nvm use 22' or install Node 22+."
  exit 1
fi

echo "[2/5] Ensuring Worker is configured for immediate data visibility (no site gate)"
perl -0777 -pe 's/\bREQUIRE_SITE_SESSION\s*=\s*"true"/REQUIRE_SITE_SESSION = "false"/g' -i "$API_DIR/wrangler.toml"

echo "[3/5] Deploying Cloudflare Worker (team-schedule-api)"
pushd "$API_DIR" >/dev/null
npx --yes wrangler@4 deploy
popd >/dev/null

echo "[4/5] Building site"
pushd "$ROOT_DIR" >/dev/null
rm -rf dist
npm ci
npm run build
popd >/dev/null

echo "[5/5] Publishing site to gh-pages (force)"
REPO_URL="https://github.com/beta-ben/schedule2.git"
if [ -n "${GH_TOKEN:-}" ]; then
  REPO_URL="https://$GH_TOKEN@github.com/beta-ben/schedule2.git"
fi
npx --yes gh-pages -d "$ROOT_DIR/dist" -b gh-pages -f -r "$REPO_URL" -m "force publish $(date -u +%FT%TZ)"

echo "Done. Verify quickly:"
echo "- API version:   curl -s https://api.teamschedule.cc/api/_version | jq ."
echo "- API schedule:  curl -i https://api.teamschedule.cc/api/schedule | head"
echo "- Origin (GH):   https://beta-ben.github.io/schedule2/?v=$(date +%s)"
echo "- Prod domain:   https://teamschedule.cc/?v=$(date +%s)"

echo "If the site still shows old UI, purge Cloudflare cache for /, /index.html, and the new assets hash referenced in gh-pages index.html."
