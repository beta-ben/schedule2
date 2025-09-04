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
- GET `https://<staging-worker-subdomain>/api/_bindings` → shows `SCHEDULE_KV`.
- GET `https://<staging-worker-subdomain>/api/_health` → KV ok, D1 off (use_d1: "0").
- POST `/api/login` → set cookies; then POST `/api/schedule` and GET `/api/schedule`.

6) Point web app to staging API
- Create `.env.production.staging` at repo root with:
```
VITE_SCHEDULE_API_BASE=https://<staging-worker-subdomain>
```
- In your staging build workflow, copy it to `.env.production` before build:
```
cp .env.production.staging .env.production
```
- Deploy the staging site to `https://staging.teamschedule.cc`.
