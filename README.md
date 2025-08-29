# Schedule 2

- PTO support: days on PTO gray out a person’s shift chips in the grid.
- Overnight shifts supported (end next day) and split correctly at local midnight.
- On deck: who’s on right now. Up next: who starts in the next 2 hours.
- Manage area:
	- Unified Shift Manager panel (quick add, inline edit, filter, select, bulk delete).
	- PTO add, filter, select, bulk delete, and per-row delete.
	- Export JSON to clipboard; Load/Save with a Cloudflare Worker API.

## Quickstart

```bash
npm i
npm run dev
```

Open the printed local URL (Vite), then use the Manage tab to edit data.

## Dev → Prod Playbook

Use this checklist to avoid surprises when promoting changes to production.

1) Environment
- .env.production must define:
	- `VITE_SCHEDULE_API_BASE=https://api.teamschedule.cc` (or your API domain)
- API requirements (Cloudflare Worker or server):
	- Endpoints: `POST /api/login`, `POST /api/logout`, `GET /api/schedule`, `POST /api/schedule`
	- Cookies: set `sid` and `csrf` with `Secure; HttpOnly; SameSite=Lax; Domain=.teamschedule.cc`
	- CORS: `Access-Control-Allow-Origin: https://teamschedule.cc`, `Access-Control-Allow-Credentials: true`

2) Local validation
- Login in dev via proxy: `npm run dev:all` and use the Manage tab
- Typecheck/build: `npm run typecheck && npm run build`
- Smoke test: `npm run smoke`
- Validate prod config: `npm run validate:prod`

3) Deploy
- Manual: `npm run deploy` (predeploy copies CNAME and mirrors assets under `dist/schedule2` for cache safety)
- CI: push to `main` runs `.github/workflows/deploy.yml` to build and publish automatically

4) Verify
- Open https://teamschedule.cc and hard refresh
- Confirm header date range is correct and CSS/JS load (no 404s)
- Manage: sign in once; navigating back should not re-prompt constantly
- Publish: create a tiny change and publish; confirm API accepts write (CSRF header is sent)

5) Troubleshooting
- Custom domain shows 404/CSP: ensure `public/CNAME` exists and lands in `dist/CNAME`
- Login loops: check API cookie attributes and CORS; browser devtools → Application → Cookies
- Data mismatch: if drafts are active locally, publish or discard so Schedule reflects live
- Cache: avoid caching HTML at CDN; allow assets to cache, JSON minimal TTLs


## Environment

These are optional; sensible defaults are provided for local use.

- `VITE_SCHEDULE_API_BASE` — Cloud API base for read (default: `https://team-schedule-api.bsteward.workers.dev`). For production writes, your API must implement cookie session auth and CSRF at `/api/schedule`.
- `VITE_DEV_PROXY_BASE` — Dev auth proxy (e.g., `http://localhost:8787`). When set, the app uses cookie auth + CSRF and never sends passwords from the client.

Manage now requires an authenticated session (cookie + CSRF). The legacy client-side password header path has been removed.

### Dev auth proxy

A minimal dev-only server sits in `dev-server/` to avoid client-embedded secrets:

```
cd dev-server
cp .env.example .env # set DEV_ADMIN_PASSWORD
npm i && npm start
```

Set `VITE_DEV_PROXY_BASE=http://localhost:8787` in your frontend `.env.local`. The Manage page will prompt for sign-in and then use cookies + CSRF for GET/POST of schedule data. Without a proxy (or a production API that sets session cookies), the app runs in read-only mode.

## Using Manage

- Go to the Manage tab and enter the password.
- Shifts: use the Shift Manager to add/edit/remove. Overnight is supported.
- PTO: add ranges, filter, select, bulk delete.
- Export/Load/Save: copy JSON to clipboard or sync with the cloud API.

## Timezones

- Shifts are authored relative to PT and converted to the viewer’s TZ.
- "Now" calculations and labeling are done in the selected TZ.
- Cross-midnight shifts split into segments at local midnight.
- PTO days gray out shift chips instead of adding a row overlay.

## Deploy to GitHub Pages

This project is configured for a custom domain (Vite `base` = `/`). A `CNAME` file is included for `teamschedule.cc`.

```bash
npm run build
npm run deploy
```

Then in GitHub → Settings → Pages:
- Source: `gh-pages` branch
- Custom domain: `teamschedule.cc`
- Enable “Enforce HTTPS”

DNS (at your registrar):
- CNAME `www` → `<username>.github.io`
- Apex `@` → ALIAS/ANAME to `www` or A records to GitHub Pages IPs

If you need to deploy under a subpath instead, set `GHPAGES_BASE` (e.g., `/schedule2/`) before building.

## Tasks & Shift Segments

Optionally configure Tasks (name, color, posture) under Manage → Tasks & Postures. Shifts can include segments (minutes from shift start) that render as colored sub-bars inside each shift chip. This lets you allocate parts of a shift to different work types without changing the base shift times.
