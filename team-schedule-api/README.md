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
Two supported flows; choose one and align `wrangler.toml` accordingly.

1) Workers Builds (recommended for versions upload)
- In Cloudflare Dashboard → Workers → Your Worker → Settings → Build:
  - Root directory: `team-schedule-api`
  - Deploy command: `npx wrangler versions upload`
  - Build command: leave empty
- Under Settings → Bindings, add KV Namespace binding:
  - Variable name: `SCHEDULE_KV`
  - Select your existing KV namespace (do not hard-code its id in wrangler.toml)
- Under Settings → Variables, set required env vars: `ADMIN_PASSWORD`, `SITE_PASSWORD`, and optionally `ALLOWED_ORIGINS` (or `CORS_ORIGINS`), `COOKIE_DOMAIN`, `COOKIE_SECURE`, etc.
- Note: wrangler.toml should NOT specify a concrete `id` under `[[kv_namespaces]]` for this flow.

2) Direct Wrangler deploy (CI or local)
- Command: `npx wrangler deploy`
- In this case, `wrangler.toml` may include:
  - `[[kv_namespaces]]` with an `id` for production
  - Optional `preview_id` for local dev
- Secrets/vars can be set via `wrangler secret put` and `wrangler kv namespace` commands, or in the dashboard.

## Notes
- The worker enforces schemaVersion >= 2 and persists `agents[]` (with `hidden`) so all clients see the same hidden state.
- If `agents` is omitted in POST, the previous `agents` list is preserved.
- The client already includes `agents` in publish/auto-save and prefers server-supplied `agents`.
