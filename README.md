# Schedule 2

React + TypeScript + Vite + Tailwind. Password-gated Manage area, cloud sync, timezone-aware daily grid, and helpful "On deck"/"Up next" side panels.

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

## Quickstart

```bash
npm i
npm run dev
```

Open the printed local URL (Vite), then use the Manage tab to edit data.

## Environment

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

## Tasks & Shift Segments

Optionally configure Tasks (name, color, posture) under Manage → Tasks & Postures. Shifts can include segments (minutes from shift start) that render as colored sub-bars inside each shift chip. This lets you allocate parts of a shift to different work types without changing the base shift times.
