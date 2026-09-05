# Plan: MYK9-17 Role-Journey Visual QA Matrix

> **Status:** Active — metadata reconciled 2026-09-05.
> Richard owns reconciliation: existing historical implementation/status is preserved below; closure evidence is not independently established in this pass. Keep active pending that evidence.


## Goal

Create one typed, data-driven Playwright matrix for the four highest-risk myK9Show
role journeys. It should make the role, viewport, theme, expected UI states, and
browser-health checks explicit and runnable from a focused local command.

## Scope

- Exhibitor: Browse Shows → Show Detail → registration guardrails.
- Secretary: setup/workbench and Entry Management.
- Judge/steward: `/judge/dashboard` and `/judge/check-in`.
- Admin: concise support/management path.
- Viewports: phone, tablet, and desktop; themes: light and dark.
- Checks: render, horizontal overflow, console/page errors, modal feedback, and
  selected/disabled state behavior where the journey exposes those states.
- Visual screenshots are captured for geometry-sensitive checkpoints without
  making a new CI gate or duplicating existing feature specs.

## Testing phase

1. Unit-test the matrix contract and route/viewport/theme coverage.
2. Run the focused Playwright matrix on Chromium with local E2E credentials when
   available.
3. Run myK9Show typecheck and lint, the suite-map drift check, and `git diff --check`.
4. Review the diff for duplicate route coverage and unrelated changes.

## Non-goals

- No new production UI or route.
- No database writes, seed changes, or shared Supabase mutations.
- No replacement of existing feature-specific Playwright specs.
- No promotion of this broad, credential-backed matrix to PR smoke until it proves
  stable through repeated local runs.
