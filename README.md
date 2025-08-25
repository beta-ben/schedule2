# Schedule 2

React + TypeScript + Vite + Tailwind. Password-gated Manage area, cloud sync, timezone-aware daily grid, and helpful "On deck"/"Up next" side panels. **Version 0.3** includes the new Draft Scheduling Tool with backend API integration.

## Features

- Sunday-first week layout and week start selector.
- Timezone-aware rendering: shifts authored in PT, viewed in selected TZ. "Now" line and panels use IANA tz for accuracy.
- Day grid with hour labels, red "now" line (today only), and colored shift chips.
- PTO support: days on PTO gray out a person’s shift chips in the grid.
- Overnight shifts supported (end next day) and split correctly at local midnight.
- On deck: who’s on right now. Up next: who starts in the next 2 hours.
- Manage area:
	- Unified Shift Manager panel (quick add, inline edit, filter, select, bulk delete).
	- PTO add, filter, select, bulk delete, and per-row delete.
	- Export JSON to clipboard; Load/Save with a Cloudflare Worker API.
- **NEW: Draft Tool** (Version 0.3):
	- Schedule version management (active, draft, archived)
	- Coverage heatmap visualization
	- CSV export functionality
	- Backend API integration

## Quickstart

```bash
npm i
npm run dev:all # starts API on 3001 and Vite on 5173
```

Open the printed local URL (Vite), then use the Manage tab to edit data or the **Draft Tool** tab to work with schedule versions.

## Environment
- `DATABASE_URL` — Postgres connection string (default: postgres://postgres:postgres@localhost:5432/schedule2)
- `PORT` — API port (default 3001)

These are optional; sensible defaults are provided for local use.

- `VITE_SCHEDULE_API_BASE` — Cloud API base (default: `https://team-schedule-api.bsteward.workers.dev`)
- `VITE_SCHEDULE_WRITE_PASSWORD` — Manage password and API write password (default: `betacares`)

The Manage page is gated by this password. It’s also sent as `X-Admin-Password` for cloud writes.

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

This project is preconfigured with Vite `base` = `/schedule2/`.

```bash
npm run build
npm run deploy
```

Then in GitHub → Settings → Pages: choose `gh-pages` as the source. Your URL will be:

```
https://<username>.github.io/schedule2/
```

## Draft Tool (Version 0.3)

The Draft Tool provides advanced schedule version management and visualization:

### Running Options
- **Full Stack**: `npm run dev:all` (API + Frontend)
- **Frontend Only**: `npm run dev` (uses mock data if API unavailable)  
- **API Only**: `npm run dev:api` (backend on port 3001)

### Features
- **Version Management**: View and switch between active, draft, and archived schedule versions
- **Coverage Heatmap**: Visual 24-hour coverage analysis with 30-minute time bins
- **CSV Export**: Download schedule data for external tools
- **Shift Inspection**: View schedule data in JSON format

### Database Setup (Optional)
```bash
docker compose up -d          # Start PostgreSQL
npm run migrate              # Run database migrations  
npm run dev:all              # Start with real database
```

Without PostgreSQL, the system uses mock data for demonstration.
