# Research: `entry_status = 'absent'` accounting mismatch

## Conclusion

The reported mismatch is verified. The client treats `entry_status='absent'` as non-running and excludes it from `isExpectedEntry`; the current server rollup migration excludes only `scratched`, `withdrawn`, `moved`, and `not_accepted`. Therefore the same live absent row contributes to the server's expected count but not the client's expected set. A class containing an absent lifecycle row can consequently disagree about completion and placement readiness, especially while that row has a pending result.

## Evidence

- The client declares `absent` in `NON_RUNNING_ENTRY_STATUSES` and folds that set into the exclusion predicate used by `isExpectedEntry` ([`entryAccounting.ts:36-43`](../../apps/myk9show/src/features/_shared/entryAccounting.ts:36)). The predicate also excludes soft-deleted rows and pulled entries ([`entryAccounting.ts:77-84`](../../apps/myk9show/src/features/_shared/entryAccounting.ts:77)).
- The client separately considers `result_status='absent'` accounted without a score ([`entryAccounting.ts:45-50`](../../apps/myk9show/src/features/_shared/entryAccounting.ts:86)). This is a distinct result axis from the lifecycle value in the report.
- The cited server migration's expected and accounted filters exclude `scratched`, `withdrawn`, `moved`, and `not_accepted`, but not `absent` ([`20260902174500_class_rollup_excludes_moved_and_not_accepted.sql:76-90`](../../supabase/migrations/20260902174500_class_rollup_excludes_moved_and_not_accepted.sql:76)). The query counts only non-deleted rows, so a live `entry_status='absent'` row reaches those filters.
- The server marks a class completed and invokes `recalculate_class_placements` only when `v_accounted_count = v_expected_count` ([`20260902174500_class_rollup_excludes_moved_and_not_accepted.sql:136-151`](../../supabase/migrations/20260902174500_class_rollup_excludes_moved_and_not_accepted.sql:136)). Thus the population mismatch can affect both completion and the placement recalculation gate.

## Tests and history

- Existing client tests cover `absent` as non-running, but do not include it in the `isExpectedEntry` exclusion table; they test only `scratched` and `withdrawn` there ([`entryAccounting.test.ts:10-29`](../../apps/myk9show/src/features/_shared/__tests__/entryAccounting.test.ts:10)). They do cover `result_status='absent'` as accounted ([`entryAccounting.test.ts:69-80`](../../apps/myk9show/src/features/_shared/__tests__/entryAccounting.test.ts:69)).
- The database contract test pins the latest rollup definition to the cited migration and checks the completion/placement branch structure, but does not assert that the expected-status predicate includes `absent` ([`classPlacementContract.test.ts:179-203`](../../apps/myk9show/src/test/database/classPlacementContract.test.ts:179)).
- Git history shows the client change was introduced by `debf07450` (`fix(at-show): unify non-running entry lifecycle policy`, 2026-09-02), while the cited migration is explicitly scoped to moved/not-accepted statuses. The migration comments state that the client mirror was updated in the same change ([`20260902174500...sql:35-52`](../../supabase/migrations/20260902174500_class_rollup_excludes_moved_and_not_accepted.sql:35)). That claim is incomplete for `absent`: the client and server predicates are not currently identical.

## Recommended issue scope

Align the server-side expected-entry predicates (rollup and any related reopen/board copies) with the canonical client rule for `entry_status='absent'`, and add regression coverage proving parity for an absent lifecycle row with both pending and terminal result states. No application code was modified during this research.
