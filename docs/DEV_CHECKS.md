Developer checks

Run a fast, reliable parse + type check before pushing UI changes that touch JSX/TSX:

  npm run check

What it does
- tsc --noEmit: Parses all TS/TSX and does a full type check (catches most JSX/tag mistakes).
- vite build --mode development: Runs the Vite/Rollup pipeline to ensure JSX compiles the same way dev does.

Tips
- If `npm run dev` is running, stop and restart after syntax fixes so the dev server reloads a clean graph.
- Avoid top‑level JSX comments outside of an expression; prefer line comments or wrap comments inside a fragment with content beneath.

Next (optional)
- Add ESLint + Prettier with a pre‑commit hook (husky) once dependencies can be installed in this environment.
- Split large components (like WeekEditor) into smaller pieces (AgentList, AgentDetailsPanel, AgentShiftsList, DeleteAllShiftsModals) to reduce JSX depth.

