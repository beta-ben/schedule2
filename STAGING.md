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
- Deploy a staging Worker/API route (e.g., `https://staging-api.teamschedule.cc`).
- Add `.env.production.staging` with `VITE_SCHEDULE_API_BASE=https://staging-api.teamschedule.cc`.
- In staging workflow, add a step to copy that env file to `.env.production` before build.
