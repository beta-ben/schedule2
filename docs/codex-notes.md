# Codex Collaboration Notes

## Repository
- Source of truth: `https://github.com/beta-ben/schedule2/`
- Default branch: `main`; release rehearsal branch: `staging`
- Structure: Vite SPA at repo root + Cloudflare Worker in `team-schedule-api/`
- Issue tracking: centralize must-fix tickets here (add links from GitHub issues when available)

## Environment & Credentials
- Frontend env files:
  - `.env.local` committed baseline; per-dev overrides in `.env.development.local`
  - `.env.production` used for production builds; staging workflow swaps in `.env.production.staging`
- Worker secrets:
  - Copy `team-schedule-api/.dev.vars.example` → `.dev.vars` for local dev (do **not** commit secrets)
  - Production/staging secrets managed via `wrangler secret put` or Dashboard (`wrangler.toml` documents current bindings)
- Cloudflare targets:
  - Pages (prod) `teamschedulecc` → https://teamschedule.cc
  - Pages (staging) `schedule2-staging` → https://staging.teamschedule.cc
  - Worker (prod) `team-schedule-api` → `api.teamschedule.cc`
  - Worker (staging) `team-schedule-api-staging` → staging routes (`staging-api.teamschedule.cc` / workers.dev)
- Auth: session cookie + CSRF token; local Worker DEV_MODE relaxes requirements. Optional `VITE_DEV_BEARER_TOKEN` gates dev-only bypasses.

## Workflows & Commands
- Setup: `npm run setup` (installs root + Worker deps)
- Local dev (SPA + Worker unified): `npm run dev`
- Offline UI mode: `npm run dev:offline` (sets `VITE_DISABLE_API=1`)
- Health checks:
  - Quick parse/typecheck: `npm run check`
  - CI bundle: `npm run ci` / `npm run ci:full`
  - Release preflight (smoke, build, lint, tests): `npm run release:preflight`
  - Smoke + prod validation: `npm run smoke`, `npm run validate:prod`
- Staging flow:
  - Build staging bundle: `npm run build:staging`
  - Deploy staging Pages: `npm run deploy:pages:staging`
  - Trigger staging Worker via GitHub Action “Deploy API (staging) to Cloudflare Workers”
- Production flow:
  - Deploy Pages: `npm run deploy:pages:prod`
  - Worker deploy runs from GitHub workflow on `main`
- Diagnostics: `npm run dev:doctor` (port + version check)

## Conventions & Gotchas
- Keep `main` and `staging` fast-forward only; release branches merged via FF to avoid drift.
- Run `npm run check` (or `npm run ci`) before pushing; Worker + SPA share domain schema (`src/domain/*`, mirrored in Worker).
- Secrets stay out of repo; describe sensitive values conceptually here, never copy from `.dev.vars`.
- Known doc references:
  - Architecture overview: `ARCHITECTURE.md`
  - File-by-file map: `PROJECT_MAP.md`
  - Staging specifics: `STAGING.md`
  - Cloudflare resources: `docs/CLOUDFLARE_SETUP.md`
  - Release steps: `docs/RELEASE_WORKFLOW.md`
  - Dev lint/type checklist: `docs/DEV_CHECKS.md`
- Drag-and-drop schedule editor relies on strict shift overlap rules; cross-midnight handling uses `endDay` normalization (see `src/lib/utils.ts`).
- Worker uses KV + optional D1; ensure `USE_D1` alignment across envs when toggling DB behavior.

## Keeping This File Useful
- Append GitHub issue snapshots (title, link, state) under **Repository** as they arise.
- Refresh workflow notes when scripts change; add date stamps if helpful for history.
- Note any flaky tests or temporary workarounds in **Conventions & Gotchas** so future sessions can spot landmines quickly.
