## Staging setup

### Cloudflare Pages (current)
- Push to the `staging` branch.
- Workflow `.github/workflows/deploy-cf-pages-staging.yml` builds the app and publishes to the Cloudflare Pages project (default: `schedule2-staging`).
- The workflow attaches the custom domain `staging.teamschedule.cc`; no GitHub Pages configuration is required.

### API configuration
- Deploy a staging Worker/API route (e.g., `https://staging-api.teamschedule.cc`).
- Keep `.env.production.staging` with `VITE_SCHEDULE_API_BASE=https://staging-api.teamschedule.cc`.
- The staging workflow copies that file to `.env.production` before the build so the site points at the staging Worker.
