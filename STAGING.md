## Staging setup

Two options:

1) GitHub Pages (gh-pages-staging branch)
- Push to the `staging` branch.
- Workflow `.github/workflows/deploy-staging.yml` publishes `dist` to `gh-pages-staging`.
- In repo settings → Pages, you can temporarily point to `gh-pages-staging` for preview, or use the raw `https://<owner>.github.io/<repo>/` URL for that branch.

2) Custom subdomain (recommended):
- Add `staging.teamschedule.cc` CNAME to GitHub Pages or to a separate hosting bucket.
- If using the same repo Pages, you’ll need a separate project for staging (so CNAMEs don’t collide), or host via Cloudflare Pages.

API for staging:
Wrangler-first, KV-only staging API:

1) Create a staging KV namespace and capture its id
```
wrangler kv namespace create SCHEDULE_KV --env staging --config team-schedule-api/wrangler.toml
```
- Replace `<replace-with-staging-kv-id>` in `team-schedule-api/wrangler.toml` under `[env.staging].kv_namespaces` with the printed id.

2) Set staging secrets
```
cd team-schedule-api
wrangler secret put ADMIN_PASSWORD --env staging
wrangler secret put SITE_PASSWORD --env staging
```

3) (Optional) Adjust staging vars
- In wrangler.toml `[env.staging.vars]`, set `ALLOWED_ORIGINS` to your staging site origin, keep cookies secure and domain to `.teamschedule.cc`.

4) Deploy staging API
```
cd team-schedule-api
wrangler deploy --env staging
```

5) Verify staging API
- workers.dev URL shape for environments is: `https://<env>-<service>.<account>.workers.dev`
- Example: `https://staging-team-schedule-api.<your-account-subdomain>.workers.dev`
- GET `https://staging-team-schedule-api.<your-account-subdomain>.workers.dev/api/_bindings` → shows `SCHEDULE_KV`.
- GET `https://staging-team-schedule-api.<your-account-subdomain>.workers.dev/api/_health` → KV ok, D1 off (use_d1: "0").
- POST `/api/login` → set cookies; then POST `/api/schedule` and GET `/api/schedule`.

6) Point web app to staging API
- Create `.env.production.staging` at repo root with the env-prefix workers.dev URL:
```
VITE_SCHEDULE_API_BASE=https://staging-<service>.<your-account-subdomain>.workers.dev
# e.g.: VITE_SCHEDULE_API_BASE=https://staging-team-schedule-api.phorbie.workers.dev
```
- In your staging build workflow, copy it to `.env.production` before build:
```
cp .env.production.staging .env.production
```
- Deploy the staging site to `https://staging.teamschedule.cc`.

Note: Staging secret VITE_SCHEDULE_API_BASE_STAGING configured; rebuilt on push.

## Cloudflare Pages (recommended for staging subdomain)

This repo includes workflows to deploy:
- Frontend (staging) to Cloudflare Pages: `.github/workflows/deploy-cf-pages-staging.yml`
- API (staging) to Cloudflare Workers: `.github/workflows/deploy-worker-staging.yml`

What you'll need to add in GitHub repo Secrets:
- `CF_API_TOKEN` (Cloudflare API token with Pages:Edit + Workers Scripts:Edit)
- `CF_ACCOUNT_ID` (Cloudflare account id)
- `CF_PAGES_PROJECT_NAME` (Cloudflare Pages project name, e.g. `schedule2-staging`)
- Optional: `VITE_SCHEDULE_API_BASE_STAGING` (overrides `.env.production.staging`). Use the env-prefix URL, e.g. `https://staging-team-schedule-api.phorbie.workers.dev`.

Steps:
1) API staging deploy
	- Push to `staging` or run the workflow manually. The worker deploys with `wrangler deploy --env staging` using `team-schedule-api/wrangler.toml`.
	- Verify endpoints:
	  - `GET https://team-schedule-api-staging.<your-workers-subdomain>.workers.dev/api/_health`
	  - `GET https://.../api/_bindings`

2) Frontend staging deploy
	- Create a Cloudflare Pages project and set the project name.
	- Push to `staging` or run the workflow manually. Build uses `.env.production` copied from `.env.production.staging` (or the secret override) and publishes `dist/`.

3) Custom domain (staging)
	- Add CNAME in DNS: `staging.teamschedule.cc` → `<your-pages-project>.pages.dev`
	- In Cloudflare Pages, add the custom domain `staging.teamschedule.cc` and issue a certificate.

4) Verify staging
	- Visit `https://staging.teamschedule.cc`
	- Confirm the app points to the staging API base in network requests.
