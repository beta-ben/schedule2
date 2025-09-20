# Schedule Management Guide

This document explains how to use the Management interface to add agents, manage shifts, assign postures, handle PTO, and publish changes.

Tip: The Management interface lives under the “Manage” section of the app. You’ll be prompted to sign in; a valid session is required to save.

## Sign in and layout

- Sign in once when prompted. The app uses a session cookie and CSRF token.
- Tabs inside Manage:
	- Agents: create/edit agents and their timezones; per‑agent shift editing.
	- Shifts: weekly ribbons for all agents with fast drag/keyboard moves and sorting.
	- Postures: configure tasks and assign posture windows by day/time (supports across midnight).
	- PTO: add and manage paid‑time‑off ranges.

Top‑right tools (Shifts tab):
- Sort ribbons (by earliest start, latest end, shift count, total minutes, first day, timezone, or name) and toggle direction.
- Include hidden agents toggle.
- Toggle all time labels on ribbons.
- Visible days selector (1–7). When <7, the ribbons and day labels become horizontally scrollable to view the rest of the week.
- Undo/Redo recent edits in the Shifts tab.
- Discard working changes; Publish to live.
- Local autosave: unpublished changes persist per week/timezone in your browser and restore on reload. Discard/Publish clears them.
- Import panel to load legacy JSON.

Publishing model
- Edit locally in the Shifts tab. Changes autosave locally (per week/TZ) until you Publish or Discard.
- Publish writes changes to live. Discard abandons local changes and returns to live.

## Agents tab

What you can do
- Add agents with first/last name and a timezone.
- Edit an agent inline (names, timezone).
- Hide/Show an agent from the schedule (preserves their data).
- Delete an agent (requires confirmation).

Per‑agent shift editor
- Select an agent to open the right‑side editor.
- Add shifts (defaults to a sensible day/time and avoids overlap by nudging).
- Edit shift day/time; set End Day for overnight shifts (across midnight).
- Drag a shift left/right to move it; keyboard nudges are supported (15 min).
- The editor prevents overlapping shifts for the same agent.
- Undo the most recent per‑agent change (Ctrl/Cmd+Z).

Tips
- Timezone per agent controls how their shifts display and how “now” is calculated in views.
- Overnight shifts show with an End Day (e.g., Sat → Sun) and split at local midnight in weekly views.

## Shifts tab (all‑agents ribbons)

Purpose
- Quickly review and adjust all agents’ shifts in one weekly band per agent.

Key actions
- Drag entire rows (agent’s whole week) or a single shift to move by minutes.
- Keyboard: when hovering over the band or a chip, Arrow Left/Right nudges by 15 min.
- Multi‑select shifts (click chips) and drag any selected chip to move the group.
- Sorting: switch between multiple sort modes and asc/desc to organize rows.
- Visible days: choose 1–7 days. When fewer than 7 are visible, scroll horizontally to see all days; labels and ribbons remain aligned.
- Include hidden agents: show/hide agents marked hidden on the Agents tab.
- Show all time labels: always display start/end tags at chip edges.
- Undo/Redo: step through your recent Shifts‑tab edits.

Publishing
- Discard: abandon working changes and return to the live schedule.
- Publish: write current working data to live.
Note: Named “Drafts” tools were removed. We’re migrating to a proposal workflow; for now, unpublished changes are autosaved locally only.

## Postures tab (Tasks & calendar assignments)

Tasks (postures)
- Create tasks with names and colors. Archiving hides them from new assignments.

Assign postures to agents
- Choose an Agent, Day, Start and End time, and (optional) End Day.
- End Day lets you assign posture windows that cross midnight (e.g., 22:00 → 02:00, Mon → Tue).
- The assignment will display when it overlaps a shift for that agent.
- Edit or delete assignments inline from the list.

Visual calendar
- A compact weekly calendar preview shows how posture windows overlay each day (cross‑midnight postures are split per day).

## PTO tab

- Add PTO date ranges per person. PTO days subtly tint in weekly/day views and gray out that person’s shift chips.
- Edit or delete PTO entries from the list.
- People on PTO are excluded from On Deck / Up Next counts.

## Tools and utilities

- Import legacy: paste or fetch a JSON payload with shifts, PTO, and postures to seed the editor; review then Publish.
- Cloud save: the Publish button saves to the live API once you’re signed in.
 
- Time labels: toggle labels to reduce noise or increase detail in Shifts.
- Visible days: pick 1–7 to zoom the weekly ribbons and scroll when needed.

## How things work (reference)

- Timezones: Shifts are authored in PT and displayed in the selected view TZ. “Now” and labels use the selected TZ.
- Overnight: A shift that ends the next day sets an End Day and splits at local midnight in weekly views.
- Postures: Calendar posture segments are merged into shifts; manual shift segments (if any) take precedence when overlaps occur.
- No overlap rule: The app prevents overlapping shifts for the same agent.

## FAQ (predicted)

- Why won’t my posture show up on the schedule?
	- Posture windows display only when they overlap a shift for that agent on that local day.
- How do I make an overnight shift?
	- Set an End Day that is the next day (e.g., Sat → Sun), or end time earlier than start and pick the next End Day. The app splits at midnight.
- How do I move shifts across the week without breaking order?
	- Drag a whole row in the Shifts tab to move that agent’s entire week together; internal gaps are preserved and overlap is prevented.
- Why are some chips gray or tinted?
	- PTO days tint the background and gray out shift chips for that agent.
- I can’t publish; it says session/CSRF missing.
	- Sign in again on the Manage page, then retry Publish. If it persists, reload the page.
 
- How do I reduce visual clutter on ribbons?
	- Use the time label toggle, choose fewer visible days, and sort by start or name.
- How do I hide an agent without deleting them?
	- On the Agents tab, toggle the eye icon to hide/show in schedule views.
- Can I show first names only on schedule chips?
	- Chips show first names in Schedule; tooltips include full names and hours.

—

For developers: a quick orientation to the codebase lives in `PROJECT_MAP.md`, while build/deploy and environment details are in `STAGING.md`. The authoritative Cloudflare resource map is in `docs/CLOUDFLARE_SETUP.md`, and the end-to-end release process is captured in `docs/RELEASE_WORKFLOW.md`. If you need the old README content, check the Git history.

## Developer Quick Start
### Zero-Config Dev (Unified Backend)

Daily loop:
1. Install once: `npm run setup` (installs root + worker deps)
2. Copy worker vars: `cp team-schedule-api/.dev.vars.example team-schedule-api/.dev.vars` then edit passwords.
3. Start everything: `npm run dev`
4. Build product features. That’s it.

No more local proxy / dual passwords / origin lists. The Worker (Wrangler) is the backend; Vite is the frontend.

### Fast Environment Sanity Check
### Offline UI Mode (Optional)

If backend auth or proxy issues are blocking you and you just want to build UI logic:

```
npm run dev:offline
```

This sets `VITE_DISABLE_API=1` so all network calls become no-ops and data stays local (sample + your edits). Publishing writes to localStorage only. Switch back to `npm run dev` when ready to hit the real API.


Run a quick diagnostic before starting everything:

```
npm run dev:doctor
```

It verifies:
- Node version (>=18)
- Port availability (5173 Vite, 5174 Worker)

### Minimal .env setup

Usually not needed. If you want to override the API prefix or force offline mode, see `.env.example`.

### Release workflow (dev → staging → production)

- Skim `docs/RELEASE_WORKFLOW.md` for the full playbook.
- Run `npm run release:status` to see how far `main` and `staging` have drifted (local + remote).
- Run `npm run release:preflight` before pushing to staging or main; it executes the same checks as our deploy workflows.
- Deploy the Pages projects directly with Wrangler via `npm run deploy:pages:staging` or `npm run deploy:pages:prod` after exporting `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

### Flattening a nested duplicate project

If your local clone ended up as `schedule2/schedule2` (an extra nested copy of the repo):

1. From the outer repo root (the one with `.git/`), run a dry run copy of missing files up:
```sh
npm run flatten
```
2. Inspect `flatten-conflicts.txt` (if present). Decide whether to keep root or nested versions; manually merge as needed.
3. When satisfied, remove the nested folder:
```sh
npm run flatten -- --delete
```
4. Commit the changes.

Flags:
- `--force-conflicts` also writes differing nested files beside existing ones with a `.nested` suffix.


Prereqs: Node 18+.

Install deps:

```sh
npm install
```

Run app (Vite + Worker):

```sh
npm run dev
```

Type check, lint, test (CI bundle):

```sh
npm run ci
```

Individual tasks:

```sh
npm run typecheck
npm run lint
npm run test
```

Formatting:

```sh
npm run format
```

Key folders:
- `src/lib/utils.ts`: time + shift conversion helpers (tested in `utils.test.ts`).
- `team-schedule-api/worker-schedule-agents.ts`: Cloudflare Worker (validation + auth logic).
- (Removed) `dev-server/`: legacy local proxy & SSE broadcaster.

See `ARCHITECTURE.md` for higher-level data flow and planned refactors.
