## Why

MYK9-250 follows up the At-Show class-picker sweep with one judge-facing duplication defect and three low-severity reliability/performance decisions. Resolving them now reduces ringside scrolling and makes the picker's offline and refresh behavior explicit for fall 2026 launch readiness.

Original request: `start myk9-250`.

## What Changes

- Treat the pinned **Your ring** section as the complete picker for a judge-only account with known assignments, and omit the duplicate trial sections.
- Add coverage that asserts assigned class rows render exactly once for judge-only accounts while broader staff roles retain the full trial-grouped picker.
- Measure the current entry-table invalidation/refetch path at a show-scale fixture before deciding whether optimization is warranted; optimize only if the measurement demonstrates material repeated work.
- Resolve the cold-offline, genuinely class-less show copy using available cached-data evidence rather than assuming an in-memory `idle` table status means the device was never primed.
- Explicitly accept the two deliberate fail-opens as a documented availability trade-off; authorization remains enforced by route/capability gates and `ringside_update_entry()`.
- Non-goals: no new page, panel, warning dialog, authorization boundary, replication transport, or scoresheet behavior; raw ringside Tailwind palette cleanup remains outside this issue.

This change consolidates an existing surface rather than duplicating one. A link is not relevant because the defect is the same assigned rows being rendered twice on the same picker; removing the redundant trial rendering is the direct fix.

## Capabilities

### New Capabilities

- `at-show-class-picker-integrity`: Defines judge-only non-duplication, truthful cold-offline empty states, bounded live-refresh work, and the accepted fail-open availability contract for the existing At-Show picker.

### Modified Capabilities

None.

## Impact

- `apps/myk9show/src/features/at-show/AtShowClassListPage.tsx` and focused component tests.
- `apps/myk9show/src/features/at-show/useAtShowClassList.ts`, the class-list adapter, and/or replication query helpers only if the benchmark proves a material hot path.
- Replication empty-state evidence helpers and tests for the class-less cold-offline case.
- No schema, API, RBAC, RLS, deployment, or new dependency changes.
