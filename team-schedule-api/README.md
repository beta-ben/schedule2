## Staging deploys via GitHub Actions

The staging Worker is deployed by `.github/workflows/deploy-worker-staging.yml`.

If the job fails at `wrangler-action` with a generic `npx failed with exit code 1`, verify:

- CF_API_TOKEN has `Workers Scripts:Edit`, `Workers KV Storage:Edit` scopes and matches CF_ACCOUNT_ID.
- `wrangler --version` prints 3.x, and `wrangler whoami` works in the job logs.
- `wrangler.toml` has an `[env.staging]` with proper `kv_namespaces` and `vars`.

You can also run a quick local check:

```
npx wrangler@3 whoami
cd team-schedule-api && npx wrangler@3 deploy --env staging --dry-run
```

# team-schedule-api (Cloudflare Worker)

Worker that serves /api/schedule with agents (including hidden) and cookie-based sessions.

## Endpoints
- POST /api/login        → sets admin session (sid) + CSRF (csrf)
- POST /api/logout
- POST /api/login-site   → sets view session (site_sid)
- POST /api/logout-site
- GET  /api/schedule     → reads schedule (requires site session if REQUIRE_SITE_SESSION=true)
- POST /api/schedule     → writes schedule (requires admin + CSRF)

## Storage
- KV: `SCHEDULE_KV` stores the schedule doc and sessions
  - Doc key: `DATA_KEY` (default `schedule.json`)
  - Sessions: `admin:<sid>`, `site:<sid>` with 8h TTL

## Deploy (local)
- From repo root or this folder:

```bash
cd team-schedule-api
npm i
npm run dev
```

Then login and test with cookies:

```bash
# Admin login (sets sid + csrf)
curl -i http://localhost:8787/api/login \
  -H 'Origin: http://localhost:8787' \
  -H 'Content-Type: application/json' \
  --data '{"password":"<ADMIN_PASSWORD>"}'

# Read schedule
curl -i http://localhost:8787/api/schedule \
  -H 'Origin: http://localhost:8787' \
  --cookie 'site_sid=dev' # if REQUIRE_SITE_SESSION=false, this is not needed

# Write schedule
curl -i http://localhost:8787/api/schedule \
  -H 'Origin: http://localhost:8787' \
  -H 'Content-Type: application/json' \
  -H "x-csrf-token: <csrfFromCookie>" \
  --cookie "sid=<sidFromCookie>; csrf=<csrfFromCookie>" \
  --data '{"schemaVersion":2,"shifts":[],"pto":[],"calendarSegs":[],"agents":[],"updatedAt":"2020-01-01T00:00:00Z"}'
```

## Wrangler-first deploy (recommended)
Let Wrangler own bindings and deploys to avoid drift.

1) Configure secrets and vars
- Secrets (prompted, not stored in repo):
  - ADMIN_PASSWORD → `wrangler secret put ADMIN_PASSWORD`
  - SITE_PASSWORD  → `wrangler secret put SITE_PASSWORD`
- Vars (in wrangler.toml by default; override if needed):
  - ALLOWED_ORIGINS, COOKIE_DOMAIN, COOKIE_SECURE, COOKIE_SAMESITE, REQUIRE_SITE_SESSION, USE_D1=0

2) KV namespace
- `wrangler.toml` already binds `SCHEDULE_KV` with a concrete `id` for production.
- Optionally add `preview_id` for local previews.

3) Deploy
- `npm run deploy` (equivalent to `wrangler deploy`).

4) Verify
- GET `/api/_bindings` → includes `SCHEDULE_KV`.
- GET `/api/_health`   → `{ kv: { ok: true }, d1: { ok: false|no_binding }, use_d1: "0" }`.
- POST `/api/login` → receive `sid` + `csrf` cookies; then POST `/api/schedule` and GET `/api/schedule`.

## Notes
- The worker enforces schemaVersion >= 2 and persists `agents[]` (with `hidden`) so all clients see the same hidden state.
- If `agents` is omitted in POST, the previous `agents` list is preserved.
- The client already includes `agents` in publish/auto-save and prefers server-supplied `agents`.
