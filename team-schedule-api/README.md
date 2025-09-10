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

## Git-based deploy via Cloudflare dashboard
- In Workers > Your Worker > Settings > Build, connect repo to this folder.
  - Root directory: `team-schedule-api`
  - Deploy command: `npx wrangler deploy`
  - Build command: leave empty (Wrangler builds directly)
- Ensure KV binding exists on the Worker: `SCHEDULE_KV`
- Set variables: `ADMIN_PASSWORD`, `SITE_PASSWORD`, optionally `ALLOWED_ORIGINS` (or `CORS_ORIGINS`), `COOKIE_DOMAIN`.

## Notes
- The worker enforces schemaVersion >= 2 and persists `agents[]` (with `hidden`) so all clients see the same hidden state.
- If `agents` is omitted in POST, the previous `agents` list is preserved.
- The client already includes `agents` in publish/auto-save and prefers server-supplied `agents`.

## Seed dev from live

Use the repo script to copy a live schedule into your local Worker (D1) so you can reproduce real scenarios.

Prereqs
- Local Worker running: `npm run dev` (from repo root)
- Dev vars in `team-schedule-api/.dev.vars` (already added):
  - `ADMIN_PASSWORD` (defaults to `dev-admin`)
  - `REQUIRE_SITE_SESSION="false"` so dev reads don’t need site login

Quick start

```bash
# From repo root
npm run dev    # in one terminal (starts Vite + wrangler dev on :8787)

# In another terminal, seed from live
(npm run seed:dev -- https://api.teamschedule.cc/api/schedule)
```

Advanced usage
- Provide a site password if your source requires view login before GET:

```bash
SOURCE_SITE_PASSWORD="<live_site_pw>" npm run seed:dev -- https://api.teamschedule.cc/api/schedule
```

- Override the source URL and destination base via env vars:

```bash
SOURCE_URL="https://your-live-api.example.com/api/schedule" \
DEST_BASE="http://localhost:8787" \
npm run seed:dev
```

How it works
- Logs into the source (if `SOURCE_SITE_PASSWORD` set), fetches the schedule JSON.
- Logs into your local Worker admin with `ADMIN_PASSWORD` (reads from `.dev.vars` if not provided via env), gets CSRF, and POSTs to `/api/schedule` with `updatedAt` set to now.

Troubleshooting
- 401 on dest login: verify `ADMIN_PASSWORD` in `team-schedule-api/.dev.vars` matches what the Worker is using.
- 401 on source GET: set `SOURCE_SITE_PASSWORD` if the live API requires a site session.
- Connection refused: ensure `npm run dev` is running and the Worker is listening on `http://localhost:8787`.
