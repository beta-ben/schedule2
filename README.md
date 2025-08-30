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
- Drafts: Save, Save new, Load, Delete; Discard working changes; Publish to live.
- Import panel to load legacy JSON.

Publishing model
- You edit a working draft locally. Click Publish to write changes to live.
- You can save named drafts, re‑load them later, or discard to revert to live.

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

Drafts and publishing
- Save/Save new: persist your current working draft locally with a name.
- Load/Delete: bring back a saved draft or remove it from the list.
- Discard: abandon working changes and return to the live schedule.
- Publish: write current working data to live.

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
- Drafts: keep multiple offline drafts, load one to continue, or discard.
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
- What’s the difference between Live and Draft?
	- Draft is your local working copy. Publish writes the current draft to live. You can save multiple named drafts and load them later.
- How do I reduce visual clutter on ribbons?
	- Use the time label toggle, choose fewer visible days, and sort by start or name.
- How do I hide an agent without deleting them?
	- On the Agents tab, toggle the eye icon to hide/show in schedule views.
- Can I show first names only on schedule chips?
	- Chips show first names in Schedule; tooltips include full names and hours.

—

For developers: build/deploy and environment details are in STAGING.md and comments in the source. If you need the old README content, check the Git history.
