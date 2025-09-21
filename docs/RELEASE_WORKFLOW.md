# Release Workflow

A single build artifact should move from local dev → staging → production with the fewest surprises possible. This playbook focuses on:
- keeping `main` always deployable;
- using `staging` as the dress rehearsal for both the site (Cloudflare Pages) and the Worker API; and
- running the same validation in every step so we catch issues before customers do.

## Branch + environment map

| Branch | Cloudflare target | Trigger | Purpose |
| --- | --- | --- | --- |
| feature/* | none | local only | Experiments and day-to-day feature work. |
| main | Pages: production (`teamschedulecc`), Worker: production | Push/merge to `main` | Production source of truth. Auto-deploys the site to https://teamschedule.cc via `.github/workflows/deploy-cf-pages-prod.yml` (set `CF_PAGES_PROJECT_NAME_PROD=teamschedulecc`) or `wrangler pages deploy`. |
| staging | Pages: staging (`schedule2-staging`) | Push/merge to `staging` | Release-candidate environment. Auto-deploys the site to https://staging.teamschedule.cc via `.github/workflows/deploy-cf-pages-staging.yml`. |

> The Worker (API) currently requires a manual staging deploy via “Deploy API (staging) to Cloudflare Workers” in GitHub Actions. Production Worker deploys when `main` changes.

## 0. Daily dev loop

1. Install once: `npm run setup` (installs root + worker deps).
2. Keep `.env.local` committed as-is; add per-developer overrides in `.env.development.local` if needed.
3. Run `npm run dev` for the frontend + Worker in unified mode.
4. Before pushing, lint + typecheck quickly with `npm run check` (runs `tsc --noEmit` + `vite build --mode development`).

## 1. Prepare a release candidate

1. Update from origin:
   ```sh
   git checkout main
   git pull --ff-only
   ```
2. Cut a short-lived release branch off `main` (optional but recommended when batching features):
   ```sh
   git checkout -b release/<yyyymmdd-short-desc>
   ```
3. Run the full preflight locally:
   ```sh
   npm run release:preflight
   ```
   This is an alias for `npm run ci:full` (guard hosts → typecheck → lint → unit tests → production build → smoke test).
4. Open a PR targeting `staging`. Treat it like a normal review—code should already be on `main`, so this PR is only to capture the promotion.

## 2. Deploy the frontend to staging

1. Fast-forward `staging` to the release branch (or to `main` if you skipped the release branch):
   ```sh
   git checkout staging
   git pull --ff-only
   git merge --ff-only release/<...>
   git push origin staging
   ```
   Keep the branch clean—`npm run build:staging` (next step) copies `.env.production.staging` so the bundle talks to the staging API.
2. Build the staging bundle (temporarily swaps `.env.production` with `.env.production.staging`):
   ```sh
   npm run build:staging
   ```
3. Deploy the staging site via direct upload (requires `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` in your shell):
   ```sh
   npm run deploy:pages:staging
   ```
4. Optional: kick off the staging Worker deploy so API + site match:
   - GitHub → Actions → “Deploy API (staging) to Cloudflare Workers” → Run workflow.

## 3. Verify staging

Run the exact validations we expect passing in production:

```sh
npm run release:preflight
npm run smoke
npm run validate:prod        # Confirms prod endpoints still healthy before we promote
```

Manual checks (recommended):
- Sign into https://staging.teamschedule.cc/manage and publish a no-op change (ensures session + CSRF still work).
- Hit the staging API version endpoint: `curl https://team-schedule-api-staging.phorbie.workers.dev/api/_version`.

## 4. Promote to production

1. Merge staging back to `main` (fast-forward only):
   ```sh
   git checkout main
   git pull --ff-only
   git merge --ff-only staging
   git push origin main
   ```
2. Tag releases when you want a traceable history:
   ```sh
   git tag vYYYY.MM.DD
   git push origin vYYYY.MM.DD
   ```
3. Trigger the production Pages deploy using the direct-upload command (requires `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`):
   ```sh
   npm run deploy:pages:prod
   ```
   The Worker/API deploy still runs automatically from the push (Wrangler step inside the workflow).

4. Post-deploy smoke test the live site:
   ```sh
   npm run smoke
   npm run validate:prod
   ```
   These call public production endpoints and ensure CSPs, cookies, and schedule reads still work.

## 5. Rollback / hotfixes

- To revert a bad main deploy, use `git revert <sha>` on main and push—workflows redeploy the reverted build automatically.
- For emergency API fixes, run the staging Worker workflow first, verify, then cherry-pick to main and push so production matches.

## Cheat sheet

| Task | Command |
| --- | --- |
| Full preflight | `npm run release:preflight` |
| Local API deploy (staging config) | `(cd team-schedule-api && npm run deploy:staging)` *(add when ready; currently via GitHub Actions)* |
| Smoke test (prod) | `npm run smoke` |
| Validate production endpoints | `npm run validate:prod` |
| Launch unified dev env | `npm run dev` |
| Cloudflare resource checklist | See `docs/CLOUDFLARE_SETUP.md` |
| Trigger staging Pages deploy | `npm run deploy:pages:staging` |
| Trigger production Pages deploy | `npm run deploy:pages:prod` |
| Build staging bundle | `npm run build:staging` |

Keep the release branch history linear—always fast-forward when merging between `main` and `staging`. That guarantees the exact commit tested in staging is what ships to customers.
