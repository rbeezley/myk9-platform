# Plan — Phase D Incident Logging

**Date:** 2026-05-19
**Status:** PR 1 shipped in [PR #247](https://github.com/rbeezley/myk9-platform/pull/247); PR 2 current.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)

## Goal

Give the trial secretary a calm, permanent way to record bites, complaints, disqualifications, injuries, and other reportable show-day incidents without leaving the workbench.

This follows the Trial Secretary intent in [`docs/INTENT.md`](INTENT.md): during show-day chaos, the software should make serious follow-up feel handled, not buried in notes or memory.

## PR 1 — Workbench Incident Log

**Status:** Shipped 2026-05-19 in [PR #247](https://github.com/rbeezley/myk9-platform/pull/247).

Deliverables:

- Add a staff-only `show_incidents` table with show, trial, class, entry, dog, handler, and judge linkage where available.
- Preserve copied dog/handler/judge display names so downstream reports remain readable if related records change.
- Add a Today workbench card for logging and reviewing recent incidents.
- Keep the UI single-screen and non-modal: type, severity, optional entry/dog, optional judge, summary, details, and action taken.

Tests:

- Pure helper test for the exact insert payload, including linked entry/judge fields.
- Component test for saving an incident from the workbench card and refreshing the recent list.
- Workbench integration test proving the Today phase exposes the incident log.

## PR 2 — Wrap-up Incident Closeout

**Status:** Current slice.

Deliverables:

- Add a Wrap-up workbench card that summarizes all incidents, reportable incidents, and urgent incidents for closeout.
- Surface the latest reportable incident so the secretary has a clear final-file reminder.
- Keep the incident log append path in Today and the review path in Wrap-up.

Tests:

- Pure helper test for reportable/urgent closeout counts.
- Component test for the Wrap-up closeout card.
- Workbench integration test proving Wrap-up exposes the incident closeout.

## Later

- Feed AKC/UKC PDF form-fill once the official templates are wired.
- Add report export/download after the schema has been exercised in one live walk.
