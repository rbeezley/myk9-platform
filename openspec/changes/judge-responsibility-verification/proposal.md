## Why

The secretary responsibility verification (completed 2026-07-09, PR #1242) proved that docs-level "Covered" statuses hide real code defects — six were found and fixed. The judge is the least-verified show-day role: the scorecard has flagged the ringside judge/steward re-walk since June, and a historical silent RLS write failure for judges is recorded but unverified against current code. This change creates the judge equivalent: a responsibility coverage matrix and a verification plan, scoped to the fall reality that judges operate inside ringside `/at-show` (no judge portal).

## What Changes

- Add `docs/roles/judge-responsibility-coverage.md` mapping real-world judge responsibilities (ring access, preparation, scoring, completion, corrections, assignments) to current myK9 coverage with evidence-based statuses.
- Add `docs/roles/judge-responsibility-verification-plan.md` as the row-by-row audit roadmap, with J1.2 (judge write permissions) ordered first as the only potential show-day P0.
- Planning/audit change only; remediation of confirmed gaps happens in later scoped changes, exactly as `secretary-verification-remediation` followed `secretary-responsibility-verification`.

## Capabilities

### New Capabilities

- `judge-responsibility-verification`: Tracks how judge responsibility rows are verified against code, tests, ringside workflows, and remediation plans.

### Modified Capabilities

- None.

## Impact

- Affected docs: the two new `docs/roles/judge-*` files; `docs/README.md` index; later `OPEN-TODOS.md` when verification surfaces launch blockers.
- No app routes, database schema, APIs, or UI behavior change in this planning change.
