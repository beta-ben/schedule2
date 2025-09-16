# Architecture & Developer Guide

This document complements the user-facing README with data model, flows, and DX conventions.

## High-Level Pieces

1. Web Client (Vite + React)
2. (Removed) Dev Proxy – replaced by single Cloudflare Worker (DEV_MODE=1) for local auth + SSE
3. Cloudflare Worker (`team-schedule-api/worker-schedule-agents.ts`) – prod API

## Data Model (schema v2)

Top-level schedule document:
```ts
type ScheduleDoc = {
  schemaVersion: number // >=2
  agents: Agent[]
  shifts: Shift[]
  pto: PTO[]
  calendarSegs?: CalendarSegment[]
  updatedAt?: string // ISO for optimistic concurrency
  agentsIndex?: Record<string,string> // normalized person name -> agentId
}
```

Key rules:
- Shifts authored in PT; displayed in viewer TZ via `convertShiftsToTZ`.
- Cross-midnight: shift with end earlier than start (or explicit `endDay`) spans midnight.
- Agents may be hidden (flag persists; used for schedule display filtering).
- `agentsIndex` backfills `agentId` for legacy entries by name.

## Validation & Normalization

Implemented in Worker (`normalizeAndValidate`):
- Shape & referential integrity (person ⇆ agentId)
- End-day normalization for overnight shifts
- Duplicate shift id prevention
- Conflict detection via `updatedAt`

Planned: extract logic into shared module for reuse by dev proxy + possible future server.

## Client Data Flow (Current)

`App.tsx` orchestrates:
- Initial fetch (`cloudGet`)
- Poll / SSE (dev only) updates
- Local draft management (localStorage) + publish

Refactor target: custom hook `useScheduleData` consolidating fetch/publish/draft concerns, with a light Zustand or context store to reduce prop drilling.

## Utilities

`src/lib/utils.ts` holds pure helpers (time math, shift TZ conversion, segment merges). Unit tests live beside (`utils.test.ts`).

Guideline: keep pure, deterministic logic here and reference from components to avoid duplication.

## API Layer

`src/lib/api.ts` wraps REST endpoints with uniform error handling + CSRF management.
Future: consolidate multiple POST helpers into a single `client.schedule.update(...)` shape.

## DX Conventions

- Testing: Vitest + jsdom. Files: `*.test.ts(x)` adjacent to source.
- Linting: ESLint (strict, import order) + Prettier.
- Scripts: `npm run ci` executes typecheck + lint + tests.
- Commits: add focused tests for new util logic; avoid untested complex math in components.

## Refactor Roadmap (Phase 1)

1. Extract validation & normalization to shared module (`src/domain/validation.ts`).
2. Add `useScheduleData` hook + store for central schedule state.
3. Introduce primitive UI components (Button, Chip, Toggle) to unify styles.
4. Add overlap + time math tests (shift editor logic) beyond current basics.
5. Provide environment variable typings (`env.d.ts`).

## Performance Notes

Current scale is modest (dozens of shifts). If rows/segments grow (hundreds+), add virtualization for ribbon views.

## Security Surface

- Session + CSRF cookies; client stores a shadow CSRF for headers when cookie HttpOnly.
-- Unified dev server (Worker) runs via Wrangler; no local Express proxy.

## Contribution Checklist

- [ ] Add/Update tests for pure logic
- [ ] Run `npm run ci`
- [ ] Verify no console errors in dev tools
- [ ] Update `ARCHITECTURE.md` if altering data model

---
This document will evolve as refactors land.