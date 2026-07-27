## Original request

`start myk9-107`

## Why

The stateful Playwright regression suite has no green evidence after three failed runs, leaving the exhibitor, secretary, judge, scoring, and cross-role journeys outside the PR smoke gate untrusted. MYK9-61 has since replaced the shared-staging workflow with a disposable local Supabase target, so MYK9-107 must verify that the reported configuration gap is closed, repair any current regressions, and keep the suite from silently rotting again.

This directly supports fall 2026 launch readiness by restoring repeatable evidence for secretary and show-day reliability.

## What Changes

- Reproduce the current isolated workflow contract and distinguish stale failures from failures that still exist on `main`.
- Keep the UAT service-role and app Supabase configuration sourced from the disposable target's generated job environment; add focused contract coverage that prevents either value from disappearing.
- Repair or explicitly triage each current curated-suite failure without weakening the tested journey or adding retries.
- Repair the production mutation-upload race exposed by the strengthened secretary check-in journey so a mutation queued during an active upload pass receives a follow-up drain instead of remaining stranded.
- Enable a bounded schedule now that the workflow target is disposable and resettable, while preserving manual dispatch and fail-closed target verification.
- Record the successful dispatched run, schedule decision, and remaining risks in the repository evidence and MYK9-107.
- Keep the existing two-spec PR smoke gate unchanged.

No user-facing surface is added or duplicated. A link or new UI is not relevant; the only production change is an internal replication scheduler correction required to make the existing Show Desk check-in workflow reliably persist.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `testing-e2e-ci`: Require the stateful regression workflow to receive generated isolated-target configuration, run successfully after a deterministic reset, and run on a bounded schedule now that the target is disposable.
- `replication-core-contract-preservation`: Require a follow-up upload pass when new work arrives while an upload pass is already running.

## Impact

- Affected workflow: `.github/workflows/nightly-e2e.yml`.
- Affected test infrastructure: `scripts/qa/isolated-e2e-*`, the curated Playwright specs/config, and focused workflow/source-contract tests.
- Affected production infrastructure: `packages/replication` upload scheduling; public APIs and persistence formats remain unchanged.
- Affected documentation: isolated regression runbook, E2E suite map/history, and MYK9-107 evidence.
- No application UI, production/shared-staging data, database migration, real payment, or outbound email behavior changes are intended. Production replication behavior changes only to drain newly queued work after an overlapping upload attempt.
