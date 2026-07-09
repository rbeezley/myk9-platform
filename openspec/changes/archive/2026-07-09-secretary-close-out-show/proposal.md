## Why

Secretary responsibility row S8.4 is a fall 2026 launch-risk gap: the app has Reports, Submit Results, Results Control, and a Show Desk closeout summary, but no verified action that closes the show after those steps are done. Secretaries need one calm end-of-show action that records "this show is closed" and prevents the responsibility matrix from treating adjacent routes as coverage.

Original user request: "start S8.4, 'Close Out Show.'" Follow-up: "proceed".

## What Changes

- Add a **Close Out Show** action to the existing Show Desk closeout section.
- Reuse current closeout surfaces: Results & Check-In, Reports, Submit Results, and the existing Show closeout summary.
- Mark the show `completed` and cascade any non-cancelled trials/classes to `completed` through existing replicated mutation paths.
- Show clear readiness/blocker copy before the action, including unresolved result, incident, and reconciliation cues.
- Update secretary responsibility docs after implementation evidence exists.
- Non-goal: no new closeout page, wizard, dashboard, or duplicate report/submission workflow.
- Non-goal: no registry-specific report/form work; AKC/UKC/ASCA packet work remains on Reports and Submit Results.
- Non-goal: no Stripe payout or treasurer operations beyond the existing secretary-level reconciliation evidence.

This does not duplicate an existing page. The closeout destination already exists as a section inside the canonical Show Desk workflow, but links alone cannot close/archive the show because no current surface writes the final show/trial/class closeout state.

## Capabilities

### New Capabilities

- `secretary-close-out-show`: Covers the secretary's final show closeout action, readiness blockers, and offline-first cascade to show/trial/class completion state.

### Modified Capabilities

- None.

## Impact

- Affected app code: Show Desk closeout composition, show-workbench closeout helpers/components, and focused tests.
- Affected data paths: replicated show, trial, and class update mutations.
- Affected docs: secretary responsibility coverage and verification plan evidence for S8.4.
- No database migration expected; existing status values already include `completed` for shows, trials, and classes.

## Archive Evidence

- Implemented and merged in PR #1226: https://github.com/rbeezley/myk9-platform/pull/1226
- CI, PR review, merge, and branch/worktree cleanup completed on 2026-07-09 before archive.
