# Plan — Phase D Schedule-Slip Communication

**Date:** 2026-05-18
**Status:** In progress; PR 1 and PR 2 shipped, PR 3 current.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)

## Goal

When a ring falls behind, help the secretary say the right thing quickly: clear PA copy first, in-app broadcast next, push delivery only after the target audience is verified.

This follows the Trial Secretary intent in [`docs/INTENT.md`](INTENT.md): show-day chaos should feel like "I can handle this," not like writing messaging from scratch while people are waiting.

## PR 1 — PA Script Generator

**Status:** Shipped 2026-05-18 in PR #239.

Deliverables:

- Add a Today workbench card for schedule delays.
- Generate a calm PA script from ring/area, delay minutes, affected class, and optional note.
- Support copying the generated script to the clipboard.

Tests:

- Pure helper test for generated script copy.
- Component test for field edits and clipboard copy.
- Show workbench integration test proving the Today phase exposes the card.

## PR 2 — Announcement Broadcast Wiring

**Status:** Shipped 2026-05-18 in PR #242.

- Reuse the announcements / notification substrate already present in the repo.
- Persist the generated message as an announcement for the selected show.
- Auto-expire schedule-delay announcements so stale ring-delay copy does not live in the feed forever.
- Provide an undo affordance after posting so accidental broadcasts are recoverable.
- Leave push delivery gated until target audience and RLS behavior are verified.

Tests:

- Pure helper test for announcement title generation.
- Component test asserting the generated script is posted to `show_announcements` as a normal-priority announcement.
- Existing workbench integration test continues to prove the Today phase exposes the schedule-delay card.

## PR 3 — Opt-In Push Alert Lane

**Status:** Current slice.

- Add an explicit Send push alert checkbox to the schedule-delay card.
- Keep regular schedule announcements on the normal in-app announcement lane.
- Use high priority only when the secretary opts into push delivery.
- Reuse the existing announcement push trigger and require the service-role bearer before any push send.

Tests:

- Pure helper test proving default workbench announcements stay `normal` and opted-in alerts use `high`.
- Component test asserting checked schedule announcements post with `priority: 'high'`.
- Function contract test proving the announcement push function checks the service-role bearer before sending push notifications.
