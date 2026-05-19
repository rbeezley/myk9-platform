# Plan — Phase D Schedule-Slip Communication

**Date:** 2026-05-18
**Status:** In progress.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)

## Goal

When a ring falls behind, help the secretary say the right thing quickly: clear PA copy first, broadcast plumbing later.

This follows the Trial Secretary intent in [`docs/INTENT.md`](INTENT.md): show-day chaos should feel like "I can handle this," not like writing messaging from scratch while people are waiting.

## PR 1 — PA Script Generator

**Status:** Current slice.

Deliverables:

- Add a Today workbench card for schedule delays.
- Generate a calm PA script from ring/area, delay minutes, affected class, and optional note.
- Support copying the generated script to the clipboard.

Tests:

- Pure helper test for generated script copy.
- Component test for field edits and clipboard copy.
- Show workbench integration test proving the Today phase exposes the card.

## Future Slice — Broadcast Wiring

- Reuse the announcements / notification substrate already present in the repo.
- Persist the generated message as an announcement for the selected show.
- Add push delivery only after target audience and RLS behavior are verified.
