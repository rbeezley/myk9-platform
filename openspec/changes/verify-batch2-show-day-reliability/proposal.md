# Proposal

## User request (verbatim)

“Start batch 2 and ship it through completion. Fix the next set of Linear issues in review, then verify and close them.”

## Why

MYK9-1204 and MYK9-992 have merged fixes but still lack their deployed show-day evidence. Proving queue durability after token expiry and truthful place-in-line across roles supports fall 2026 secretary/ringside reliability.

## What Changes

- Verify existing fixes for offline expired-session score/check-in upload and queue-position display with current focused tests and a deployed cross-role browser/SQL walk.
- Preserve evidence, close only fully passing issues, and ship one evidence PR. If a real product defect is reproduced, amend this change and fix it through assertion-first coverage before release.
- Hold real shared-data fixture writes until the owner approves the exact bounded test. Do not replace the 61-minute real offline interval with a clock stub.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: this is verification/documentation of already-merged behavior. `skip_specs: true` is intentional; add deltas if an implementation correction changes behavior.

## Impact

Tracking: [MYK9-1204](https://linear.app/myk9-platform/issue/MYK9-1204), [MYK9-992](https://linear.app/myk9-platform/issue/MYK9-992). Existing fixes: #3040, #2727 and #2824. The deployed `/at-show`, secretary run-order and exhibitor day-of surfaces are exercised through established replicated queries/mutations. This duplicates no existing product surface; links cannot supply missing verification evidence. Non-goals: Stripe/load/DQ issues, auth policy changes, a new scoring UI, changes to other agents’ work, payments, notifications, class completion or score release.

## Owner boundary — 2026-10-15

Owner response to the exact fixture/offline-proof approval request: **“Prepare checks without shared-data writes.”** This supersedes the pending approval in the original plan. Only read-only preparation/evidence is authorized now. No disposable entry, run-order change, score/check-in, 61-minute score-upload proof, or substitute closure acceptance was authorized. Preserve the original live tasks as blocked and keep both issues In Progress. Ship the read-only preparation records; do not archive the unfinished change or claim either issue closed.
