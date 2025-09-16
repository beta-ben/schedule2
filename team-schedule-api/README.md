# team-schedule-api (Cloudflare Worker)

Worker that serves /api/schedule with agents (including hidden) using a single admin session (sid + csrf). View-only/site session removed.

## Endpoints
- POST /api/login        → sets admin session (sid) + CSRF (csrf)
- POST /api/logout       → clears admin session
- GET  /api/schedule     → reads schedule (no secondary site session required)
- POST /api/schedule     → writes schedule (requires admin + CSRF)
<<<<<<< HEAD
- GET  /api/events       → Server-Sent Events (SSE) stream; emits "updated" when schedule KV updated
=======
 - GET  /api/v2/agents   → list agents (D1)
 - GET  /api/v2/shifts   → list shifts in range (D1)
 - PATCH /api/v2/agents  → upsert agents (admin)
 - POST /api/v2/shifts/batch → upsert/delete shifts (admin)
 - POST /api/login-magic/request → request magic link (dev echo returns link)
 - GET  /api/login-magic/verify?token=… → verify token, set cookies
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13

## Storage
<<<<<<< HEAD
- KV: `SCHEDULE_KV` stores the schedule doc and admin sessions
  - Doc key: `DATA_KEY` (default `schedule.json`)
  - Sessions: `admin:<sid>` with 8h TTL
=======
- D1 (preferred when `USE_D1=1`):
  - Table `settings` stores the schedule doc at key `DATA_KEY` (default `schedule.json`).
  - Table `sessions` stores short‑lived sessions (8h TTL) for `admin`/`site`.
  - Table `magic_tokens` stores one‑time magic tokens.
  - Table `users` stores an allowlist of users (role, active).
- KV (fallback when `USE_D1=0`):
  - Doc key: `DATA_KEY` (default `schedule.json`).
  - Sessions: `admin:<sid>`, `site:<sid>` with 8h TTL.
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13

## Deploy (local)

```bash
cd team-schedule-api
npm i
npm run dev
```

Then login and test with cookies & optional SSE listener:

```bash
<<<<<<< HEAD
# Admin login (sets sid + csrf)
curl -i http://localhost:5174/api/login \
  -H 'Origin: http://localhost:5173' \
=======
# Admin login (sets cookies; in dev, body also includes csrf and sid)
curl -i http://localhost:8787/api/login \
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
  -H 'Content-Type: application/json' \
  --data '{"password":"<ADMIN_PASSWORD>"}'

<<<<<<< HEAD
# Read schedule (no extra cookie needed)
curl -i http://localhost:5174/api/schedule \
  -H 'Origin: http://localhost:5173'
=======
# Example dev response body:
# {"ok":true,"csrf":"<token>","sid":"<sid>"}

# Read schedule
curl -i http://localhost:8787/api/schedule
# If your dev env enforces a site session, login first:
# curl -i -X POST http://localhost:8787/api/login-site -H 'content-type: application/json' --data '{"password":"<SITE_PASSWORD>"}'
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13

<<<<<<< HEAD
# Write schedule
curl -i http://localhost:5174/api/schedule \
  -H 'Origin: http://localhost:5173' \
=======
# Write schedule (dev‑friendly): requires admin session and CSRF header
curl -i -X POST http://localhost:8787/api/schedule \
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
  -H 'Content-Type: application/json' \
<<<<<<< HEAD
  -H "x-csrf-token: <csrfFromCookie>" \
  --cookie "sid=<sidFromCookie>; csrf=<csrfFromCookie>" \
  --data '{"schemaVersion":2,"shifts":[],"pto":[],"calendarSegs":[],"agents":[],"updatedAt":"2020-01-01T00:00:00Z"}'

# Listen for update events (SSE)
curl -N http://localhost:5174/api/events -H 'Origin: http://localhost:5173'
=======
  -H "x-csrf-token: <csrfFromLoginBody>" \
  --cookie "sid=<sidFromLoginBody>" \
  --data '{"schemaVersion":2,"shifts":[],"pto":[],"calendarSegs":[],"agents":[],"updatedAt":"2025-01-01T00:00:00Z"}'
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
```

## Git-based deploy via Cloudflare dashboard
- In Workers > Your Worker > Settings > Build, connect repo to this folder.
  - Root directory: `team-schedule-api`
  - Deploy command: `npx wrangler deploy`
  - Build command: leave empty (Wrangler builds directly)
- Ensure KV binding exists on the Worker: `SCHEDULE_KV`
- Set variable: `ADMIN_PASSWORD`, optionally `ALLOWED_ORIGINS` (or `CORS_ORIGINS`), `COOKIE_DOMAIN`.

## Env Vars
See `.dev.vars.example` for a documented template. Key vars:
- ADMIN_PASSWORD: required for login.
- ALLOWED_ORIGINS / CORS_ORIGINS: optional allowlist of origins.
- COOKIE_DOMAIN: production cookie domain.
- DATA_KEY: override schedule doc key (default schedule.json).
- USE_D1: enable optional D1-backed endpoints.
- DEV_MODE: relax caching, extra logs locally.

## Notes
- Single-session model only (no separate site/view session or password).
- /api/events SSE lets clients react quickly; falls back to polling if desired.
- Enforces schemaVersion >= 2 and persists `agents[]` (including `hidden`).
- Omitted `agents` in POST preserves prior list (idempotent agent updates).

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
- Tries to fetch a real agents catalog from the source (`/api/agents` or `/api/v2/agents`) and, if found, enriches the doc so `person` fields are replaced by the proper agent names (via `agentId`). This fixes cases where shifts contain placeholders like "Agent1".
- Logs into your local Worker admin with `ADMIN_PASSWORD` (reads from `.dev.vars` if not provided via env), gets CSRF, and POSTs to `/api/schedule` with `updatedAt` set to now. In dev bearer mode, the script uses `Authorization: Bearer <token>` instead and skips CSRF/cookies.

### Dev bearer mode
Enable bearer in `team-schedule-api/.dev.vars`:

```
AUTH_DEV_MODE="true"
DEV_BEARER_TOKEN="dev"
```

Examples with bearer:

```
# Upsert agents
curl -i -X PATCH http://localhost:8787/api/v2/agents \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer dev' \
  --data '{"agents":[{"id":"a1","firstName":"Ada","lastName":"Lovelace"}]}'

# Import doc (force bypasses updatedAt conflict in dev mode)
curl -i -X POST 'http://localhost:8787/api/schedule?force=1' \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer dev' \
  --data '{"schemaVersion":2,"shifts":[],"pto":[],"calendarSegs":[],"agents":[],"updatedAt":"2025-01-01T00:00:00Z"}'
```

Troubleshooting
- 401 on dest login: verify `ADMIN_PASSWORD` in `team-schedule-api/.dev.vars` matches what the Worker is using.
- 401 on source GET: set `SOURCE_SITE_PASSWORD` if the live API requires a site session.
- Connection refused: ensure `npm run dev` is running and the Worker is listening on `http://localhost:8787`.

## Magic link auth

Dev (echo):
```
AUTH_MODE="magic"
MAGIC_ECHO_DEV="true"
MAGIC_ALLOWED_DOMAINS="*"
```
Request a link (echo returns link):
```
curl -s -X POST http://localhost:8787/api/login-magic/request \
  -H 'content-type: application/json' \
  --data '{"email":"you@yourco.com","role":"admin"}'
```
Open the `link` to sign in.

Prod/Staging:
- Env (example for Resend):
```
RESEND_API_KEY=...                 # provider API key
MAGIC_FROM_EMAIL=auth@auth.yourdomain.com
MAGIC_ALLOWED_DOMAINS=yourcompany.com,partner.com
MAGIC_ADMIN_ALLOWLIST=you@yourcompany.com  # optional; D1 users table also supported
```
- DNS (Cloudflare): add provider SPF/DKIM; DMARC p=none recommended.

Admin allowlist (D1):
```
# List
curl -s http://localhost:8787/api/admin/allowlist -H 'authorization: Bearer dev'
# Add admin(s)
curl -i -X POST http://localhost:8787/api/admin/allowlist \
  -H 'content-type: application/json' -H 'authorization: Bearer dev' \
  --data '{"add":["you@yourco.com"],"role":"admin"}'
```
