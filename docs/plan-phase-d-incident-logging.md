# Plan — Phase D Incident Logging

**Date:** 2026-05-19
**Status:** In progress; PR 1 current.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)

## Goal

Give the trial secretary a calm, permanent way to record bites, complaints, disqualifications, injuries, and other reportable show-day incidents without leaving the workbench.

This follows the Trial Secretary intent in [`docs/INTENT.md`](INTENT.md): during show-day chaos, the software should make serious follow-up feel handled, not buried in notes or memory.

## PR 1 — Workbench Incident Log

**Status:** Current slice.

Deliverables:

- Add a staff-only `show_incidents` table with show, trial, class, entry, dog, handler, and judge linkage where available.
- Preserve copied dog/handler/judge display names so downstream reports remain readable if related records change.
- Add a Today workbench card for logging and reviewing recent incidents.
- Keep the UI single-screen and non-modal: type, severity, optional entry/dog, optional judge, summary, details, and action taken.

Tests:

- Pure helper test for the exact insert payload, including linked entry/judge fields.
- Component test for saving an incident from the workbench card and refreshing the recent list.
- Workbench integration test proving the Today phase exposes the incident log.

## Later

- Surface incident counts in Wrap-up closeout.
- Feed AKC/UKC PDF form-fill once the official templates are wired.
- Add report export/download after the schema has been exercised in one live walk.
