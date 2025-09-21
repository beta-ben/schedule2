# Cloudflare Stack

Authoritative list of Cloudflare resources this project depends on. If something is missing here, it can usually be deleted.

## Projects to keep

| Type | Name | Purpose | Notes |
| --- | --- | --- | --- |
| Pages | `teamschedulecc` | Production frontend | Currently serves https://teamschedule.cc and https://www.teamschedule.cc. Deploy either via the GitHub Actions workflow (set `CF_PAGES_PROJECT_NAME_PROD=teamschedulecc`) or manual `wrangler pages deploy`. |
| Pages | `schedule2-staging` | Staging frontend | Hosts https://staging.teamschedule.cc. Deploys when the `staging` branch updates. |
| Worker | `team-schedule-api` | Production API | Bound to `api.teamschedule.cc`. Use `wrangler deploy --env production` (default). |
| Worker | `team-schedule-api-staging` | Staging API | Bound to staging routes (workers.dev or custom subdomain). Used by the staging Pages build. |

## Projects to delete

| Type | Name | Why it can go |
| --- | --- | --- |
| Pages | `schedule2` | Previously trial production project. If domains stay on `teamschedulecc`, this can be deleted. |
| Worker | `team-schedule-api-preview` | Auto-created preview Worker. No routes, not used in the release pipeline. Remove to reduce clutter. |

> Tip: If you ever need ad-hoc preview Workers, create them with `wrangler deploy --env preview` temporarily. Don’t keep them around in the account list.

## DNS / domains

- `teamschedule.cc` → Cloudflare Pages project `teamschedulecc`
- `www.teamschedule.cc` → alias to `teamschedule.cc`
- `staging.teamschedule.cc` → Cloudflare Pages project `schedule2-staging`
- `api.teamschedule.cc` → Worker route for `team-schedule-api`
- `staging-api.teamschedule.cc` (or workers.dev) → Worker route for `team-schedule-api-staging`

Keep DNS + custom-domain mappings aligned with the tables above; other mappings can be removed.

## Direct-upload deploys

Both Pages projects use the Wrangler direct-upload flow. Required environment variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` (needs Pages write access)

Deploy commands (run after building the matching bundle):

```
npm run build:staging && npm run deploy:pages:staging   # project: schedule2-staging, branch: staging
npm run build && npm run deploy:pages:prod              # project: teamschedulecc, branch: main
```

Flags are available via `node scripts/deploy-pages.mjs --help` if you need to override the default dist directory, branch, or project name.
