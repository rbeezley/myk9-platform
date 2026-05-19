# Plan — Phase D Hospitality Tracking

**Date:** 2026-05-19
**Status:** Current slice.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)

## Goal

Give the trial secretary a small, calm place to track judge lunch orders, water, coffee, and delivery reminders during show day.

This follows the Trial Secretary intent in [`docs/INTENT.md`](INTENT.md): during show-day chaos, the software should make small operational tasks feel handled instead of relying on memory or sticky notes.

## PR 1 — Today Hospitality Card

Deliverables:

- Add a Today workbench card for each assigned judge.
- Capture lunch order text, notes, and water/coffee/lunch delivered checkboxes.
- Persist state locally per show so a desk refresh does not lose the active hospitality checklist.
- Keep v1 scoped to the workbench; a future personnel manager can move this to shared storage once the broader owner model is clear.

Tests:

- Pure helper test for lunch/water/handled summary counts.
- Component test for updating a judge's lunch/water/lunch state and persisting it locally.
- Workbench integration test proving the Today phase exposes the hospitality card.

## Later

- Move hospitality state into shared personnel storage if multiple desk devices need to collaborate.
- Add optional print/export for runner or hospitality volunteer handoff.
