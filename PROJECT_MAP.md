# Project Map

## Quick Facts
- Frontend: React 18 + Vite + TypeScript single-page app for schedule management.
- Backend: Cloudflare Worker in `team-schedule-api/worker-schedule-agents.ts` serving JSON schedule doc and auth endpoints.
- Styling: Tailwind-driven classes via `src/index.css`; light custom themes handled in `App.tsx` state.
- Tests: Vitest + Testing Library; utility and domain tests live next to source files.
- Data model: agents, shifts, PTO, overrides, calendar segments (schema v2) shared between client and Worker.

## Boot Flow
1. `src/main.tsx` mounts `<App />` into `#root` and pulls in global CSS.
2. `src/App.tsx` manages auth gating, timezone/week selection, data fetch (`cloudGet`), local draft state, and routing between Schedule, Manage V2, and Teams views via hash.
3. Manage view delegates to `src/components/v2/WeekEditor.tsx` plus supporting components for agents, shifts, postures, PTO, overrides, and the Stage publishing flow.
4. Schedule view (`src/pages/SchedulePage.tsx`) renders read-only ribbons with slimline pane toggles; Teams view aggregates meeting cohorts.

## Data & State
- `src/types.ts` defines core entities (Shift, PTO, Override, Task, CalendarSegment, AgentRow).
- `src/lib/utils.ts` handles time math, ID generation, timezone conversion, and helpers shared across pages.
- `src/lib/api.ts` centralizes network calls, offline mode toggles, CSRF management, and v2 endpoint detection.
- `src/lib/agents.ts` normalizes agent payloads; `src/lib/drafts.ts` tracks publish bundles and localStorage autosave.
- Domain validation/normalization lives in `src/domain/validation.ts` and `src/domain/schema.ts`; mirrored in the Worker for consistency.
- `src/hooks/useScheduleLive.ts` enables live updates via SSE/polling in dev; `src/context/TimeFormatContext.tsx` shares 12h/24h preference.

## Directory Guide
- `src/App.tsx`: SPA controller with theme, auth, and state orchestration.
- `src/main.tsx`: Vite entry point; bootstraps React root.
- `src/index.css`: Tailwind base plus custom utilities.
- `src/config.ts`, `src/constants.ts`: environment and timezone constants (`TZ_OPTS`, `DAYS`, meeting cohorts).
- `src/sample.ts`: offline sample dataset for UI-only mode (`npm run dev:offline`).

### Pages (`src/pages/`)
- `SchedulePage.tsx`: Read-only weekly schedule view with slimline toggle events and localStorage persistence for pane state.
- `ManageV2Page.tsx`: Primary admin editor with tabs (Agents, Shifts, Postures, PTO & Overrides, Integrations, Clock & Breaks), undo stacks, Stage tools, publish flow, and diagnostics.
- `ManageEditor.tsx` / `ManagePage.tsx`: Legacy manage UI retained for reference/migration.
- `TeamsPage.tsx`: Team-focused overview leveraging meeting cohorts and overrides.

### Components
- `src/components/TopBar.tsx`: Global navigation, auth prompts, theme switch, and route links.
- `src/components/v2/WeekEditor.tsx`: Coordinates Manage V2 tabs, local state, and dialog flows; imports many v2 components.
- `src/components/v2/AgentDetailsPanel.tsx`, `WeekEditor.tsx`, `DeleteAllShiftsModals.tsx`: Manage V2 editing widgets and modals.
- `src/components/AllAgentsWeekRibbons.tsx`, `AgentWeekGrid.tsx`, `DayGrid.tsx`: Schedule ribbons with drag, sort, and selection features.
- `src/components/CoverageHeatmap.tsx`, `WeeklyPTOCalendar.tsx`, `StageDiffPreview.tsx`, `TaskConfigPanel.tsx`: Supporting visuals for coverage, PTO, staging diffs, and task CRUD.
- `src/components/PostureToday.tsx`, `UpNext.tsx`: Dashboard-style summaries for live schedule views.

### Lib & Domain
- `src/lib/*.ts`: API access, agent mapping, draft persistence, overlap detection (`overlap.ts`), plus corresponding unit tests (`*.test.ts`).
- `src/domain/schema.ts`: Zod schema for the schedule doc; `src/domain/transform.ts` handles v1/v2 conversions; `src/domain/legacy.ts` keeps backward compatibility helpers.
- `src/domain/validation.test.ts` and `validation.extra.test.ts`: coverage for normalization edge cases.

### Tests
- `src/__tests__/smoke.weekeditor.test.tsx`: UI smoke test for the Week Editor.
- Utility/domain tests sit next to their sources (e.g., `src/lib/utils.test.ts`, `src/lib/overlap.test.ts`).
- `vitest.config.ts` configures jsdom environment; `src/setupTests.ts` wires Testing Library matchers.

### Docs & Ops
- `ARCHITECTURE.md`: deeper architecture, data model, and refactor roadmap (must-read before structural changes).
- `STAGING.md`: deployment runbook and environment notes.
- `docs/DEV_CHECKS.md`: developer checklist; `docs/v0.5-shift-management-overhaul.md`: historical changelog.
- `README.md`: management UI guide for end users/admins.

### Tooling & Scripts
- Root `package.json` scripts:
  - `npm run setup` installs root + Worker deps.
  - `npm run dev` starts Vite (5173) and Worker (5174) via `concurrently`.
  - `npm run dev:offline` disables API calls; `npm run dev:proxy` starts legacy proxy.
  - `npm run ci` runs `typecheck`, `lint`, and `vitest`; `npm run ci:full` adds build + smoke.
  - `npm run smoke`, `npm run validate:prod`, `npm run seed*` use Node scripts under `scripts/`.
- `scripts/*.mjs` cover deployment, seeding, host guard, flattening nested shifts, API smoke tests, etc.
- `dev-server/`: legacy Node proxy (Express) kept for reference; modern dev uses the Worker instead.
- `team-schedule-api/`: Cloudflare Worker project.
  - `worker-schedule-agents.ts`: defines REST endpoints (`/api/schedule`, `/api/v2/*`, auth, proposals) with KV/D1 persistence.
  - `db.ts`: D1 helpers and SQL queries; `migrations/` contains schema evolution.
  - `wrangler.toml`, `.dev.vars.example`: environment and local dev config.
  - Scripts: `npm run dev` (wrangler dev on 8787), `npm run deploy` for production.

### Environment & Config
- Frontend env vars go in `.env.local` (must be prefixed `VITE_`). Key flags: `VITE_DISABLE_API`, `VITE_FORCE_API_BASE`, `VITE_REQUIRE_SITE_PASSWORD`.
- Worker secrets live in `team-schedule-api/.dev.vars` (copy from example); includes admin/site passwords, KV binding IDs, optional bearer tokens, magic link settings.
- Auth flow relies on CSRF cookie plus optional dev bearer token (`VITE_DEV_BEARER_TOKEN`).
- Offline/local sample data is driven by `src/sample.ts` and persisted drafts in `localStorage` keys prefixed with `schedule_`.

### Data Flow Summary
- `App.tsx` calls `cloudGet` to load the schedule document (agents, shifts, PTO, overrides, calendar segments, schemaVersion).
- Manage V2 clones live data into local working copies, tracks undo/redo stacks, persists autosave snapshots (`localStorage`), and publishes via `publishDraftBundle` (`src/lib/drafts.ts`).
- `cloudPostDetailed` (`src/lib/api.ts`) posts schedule updates; `cloudPostAgents` handles agent-only saves; batch shift updates use `/api/v2/shifts/batch` when available.
- Worker performs `normalizeAndValidate` to ensure referential integrity, end-day normalization, and concurrency checks before committing to KV/D1.

### Build/Test Checklist
- Install once: `npm run setup`.
- Daily dev: `npm run dev` (Vite + Worker). Use `npm run dev:offline` for UI-only work.
- Before pushing: `npm run ci`; consider `npm run ci:full` for build + smoke coverage.
- API smoke/validation helpers: `npm run smoke`, `npm run validate:prod`, `npm run test:api`.

### Future Work Signals
- `ARCHITECTURE.md` roadmap highlights upcoming refactors (e.g., extracting `useScheduleData`, consolidating validation module).
- Shared domain logic lives under `src/domain`; keep it in sync with Worker code.
- Changing API contracts requires updates in `src/lib/api.ts`, Worker endpoints, and associated tests.
- Use `scripts/seed-from-cloud.mjs` or Worker seed scripts to populate local data when testing changes.
