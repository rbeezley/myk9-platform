## Why

The secretary responsibility coverage document identifies the real-world duties that matter for fall 2026 launch readiness, but many rows still depend on route-level evidence, stale snapshots, or manual assumptions. We need a line-by-line verification and remediation plan so secretary/show-day reliability is driven by code evidence instead of guesses.

This supports the fall 2026 goal by turning the secretary coverage matrix into a prioritized audit plan, with the highest-risk launch blockers surfaced first.

## What Changes

- Add `docs/roles/secretary-responsibility-verification-plan.md` as the operating plan for verifying every row in `docs/roles/secretary-responsibility-coverage.md`.
- Define the evidence standard for each row: code locations, route/workflow proof, data path verification, tests, print checks, offline/reconnect checks, and user/rehearsal evidence where needed.
- Group the work into small remediation batches so gaps can become focused OpenSpec changes or PRs instead of one large ambiguous effort.
- Keep this as a planning/audit change only; implementation of uncovered gaps will happen in later scoped changes.

This does not duplicate an existing product surface. It adds a repo planning artifact that links each secretary responsibility back to the existing canonical routes before any new UX is proposed.

## Capabilities

### New Capabilities

- `secretary-responsibility-verification`: Tracks how secretary responsibility rows are verified against code, tests, existing workflows, and remediation plans.

### Modified Capabilities

- None.

## Impact

- Affected docs: `docs/roles/secretary-responsibility-verification-plan.md`, `docs/roles/secretary-responsibility-coverage.md` as the source matrix, and related launch-readiness tracking docs when later remediation work completes.
- Affected OpenSpec artifacts: `openspec/changes/secretary-responsibility-verification/`.
- No app routes, database schema, APIs, or UI behavior change in this planning PR.
