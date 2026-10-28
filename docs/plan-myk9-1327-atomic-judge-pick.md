# Atomic class-judge pick (MYK9-1327, Option C)

> **Status:** Active (design approved by the owner 2026-10-28; implementation not started)

## Why

A secretary picks a class judge. Today one pick queues three or more independent mutations:

- **Assignment writes.** `upsertClassJudgeAssignment` → `replaceClassAssignment` queues a `judge_assignments` DELETE for each existing class-level row, then an INSERT (`judges/reads.ts:403-418`, `ReplicatedJudgeAssignmentsTable.ts:381-404`).
- **Class write.** `writeClassJudgeLocally` → `updateClass` queues a full-row `classes` UPDATE that carries no judge column (`reads.ts:431-460`, `ReplicatedClassesTable.ts:979-1008`).
- **No ordering.** None of these carries `dependsOn`.

`MutationUploadRunner` skips a mutation in backoff and keeps going (`MutationUploadRunner.ts:235-246`). So the class UPDATE can ack while the assignment is still waiting:

1. `markReplicatedRowSynced` marks the class row clean, because no other `classes` mutation is pending (`mutation-row-sync.ts:27-29, 47`).
2. The next pull hands it the server's old judge through `resolveConflict`.

The secretary sees the old judge come back. Five rounds of client-side reconstruction (closed PR #3268) each left a window. The owner chose Option C on 2026-10-25: one atomic server write per pick, so the client queues one mutation and stores one answer.

## Design

### 1. RPC `public.set_class_judge(p_class_id uuid, p_person_id uuid) RETURNS jsonb`

- **Removing a judge.** `p_person_id NULL` removes the judge. The show is derived on the server (class → trial → show), never taken from the client.
- **SECURITY INVOKER with `SET search_path = ''`.** The existing `judge_assignments` RLS write policies stay the real guard (`20260801160000_remove_steward_office_writes.sql:49-106`). The touch trigger is already DEFINER, so the class bump needs no classes UPDATE grant.
- **Explicit up-front check.** `is_site_admin() OR is_show_office_manager(v_show_id)` raises `42501`, which restates the policy predicate. An INVOKER DELETE would otherwise skip rows silently. The client parks a 42501 as `authorization` (`mutation-retry.ts:38-42`).
- **One transaction:**
  1. Resolve the class (not soft-deleted), or raise `P0002`.
  2. Run the authorization check.
  3. Take `pg_advisory_xact_lock(hashtextextended('set_class_judge:' || p_class_id, 0))`, so two concurrent picks cannot both insert.
  4. Validate the person (exists, not deleted), or raise `22023`. Registry qualification is not enforced, which is parity with today.
  5. **Idempotent no-op.** If the class-level rows already equal the desired state (one confirmed row for `p_person_id`, or none for `NULL`), write nothing. A replay after a lost response then neither bumps the version nor churns the assignment id.
  6. Otherwise `DELETE FROM judge_assignments WHERE class_id = p_class_id`.
  7. Then INSERT `(person_id, show_id, trial_id NULL, class_id, 'confirmed', confirmed_at now())`. The touch trigger (`20260914174500`) bumps `classes.updated_at` and `version`.
  8. Return one consistent read: `{ version, updated_at, judge: { person_id, first_name, last_name } | null }`. The judge is resolved the way `get_show_judges` and `pickConfirmedAssignment` resolve it (lowest-id confirmed row, person not deleted).
- **No OCC precondition.** A pick replaces the whole value. A class-version check would make every unrelated class edit conflict with a pending pick. Across devices the server's commit order decides, as today: after the acks, another secretary's later pick wins.
- **Grants:**
  - `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`.
  - It is not on the anon keep-list.
  - `NOTIFY pgrst, 'reload schema'`.
  - A `COMMENT ON FUNCTION` naming MYK9-1327.

### 2. Client queue and engine

- **`ReplicatedClassesTable.setClassJudge(classId, judge | null)`**, modelled on `setJudgeSignOff` (`ReplicatedClassesTable.ts:1019`):
  - Write the local judge fields and `judgeResolved`, then invalidate the class enrichment.
  - Queue `UPDATE classes/<id>` with `rpc: { name: 'set_class_judge', args: { p_class_id, p_person_id } }`.
- **`dependsOn`** has two parts, each owner-scoped:
  - Any pending INSERT of this class. The wizard creates a class and picks its judge offline in one pass.
  - The latest pending `set_class_judge` for the class.

  It does not depend on unrelated class edits, so a parked status edit never blocks a pick.

- **Superseded failed picks** for the class are discarded when a newer pick is queued, so a later Retry cannot replay an old intent over the new one. Discard-revert is guarded by row revision (`mutation-discard-revert.ts:41-60`).
- **Why A→B→C ends at C under any upload order:**
  - Chained `dependsOn` uploads the picks in order.
  - While any pick is still queued (pending or backing off), the row stays dirty, so pulls never overwrite it (`CLASS_DIRTY_ROW_COMPARE_POLICY` judge `fieldGroups`). A pick that has **parked** no longer holds the row; see Amendment (2026-10-28) below.
  - Discarding a parked A releases B and C, because a missing dependency counts as satisfied.
- ~~**Engine change (small).** Read `returned.version` from a jsonb return.~~ **Dropped (Amendment, 2026-10-28).** `set_class_judge` checks no expected version, so its returned version cannot be trusted for token bookkeeping: re-stamping queued siblings with it would let a stale class edit pass OCC over another device's write. The engine keeps reading only a numeric RPC return. After a pick acks, the row's token is unchanged, and a later queued class edit gets 40001 and rebases through the existing OCC path.
- ~~**A parked mutation keeps its row dirty (engine change, required).**~~ **Dropped (Amendment, 2026-10-28).** `markReplicatedRowSynced` (`mutation-row-sync.ts:27-29, 47`) decides "still dirty" from the PENDING queue only. A pick that has parked has already moved to `FAILED_MUTATIONS`. So when an unrelated class update later acks, the row goes clean, and a pull would restore the old judge over a recoverable pick (Codex, 2026-10-28). The fix: count the same owner's failed mutations for the same table and row as keeping it dirty. This is a general rule for every table, since a parked edit of any kind should not be overwritten while Retry or Discard is still offered.
- **Ack mapper (optional, separable).** A per-table mapper writes the RPC's returned judge onto the row when it goes clean. This stores the server's one answer, and it covers a person the server resolves differently, for example a soft-deleted one.
- **Failure states:**
  - Network errors back off, with the row dirty and showing the pick (it is still in the pending queue).
  - `42501` parks as authorization; `P0002` and `22023` park as permanent. Today `isRetryableError` (`packages/replication/src/mutation-utils.ts`, called from `mutation-retry.ts:28`) treats unknown codes as retryable, so both codes must be added to its permanent list. Otherwise they back off until max retries.
  - A parked pick sits in Sync issues with Retry and Discard. The class row may show the server's judge after a pull (Amendment, 2026-10-28), while Sync issues flags the unsaved pick. Retry re-sends the baked-args `set_class_judge` and lands it. Nothing is lost silently.

### 3. Deleted vs kept

- **Deleted:**
  - `writeClassJudgeLocally`.
  - The `replaceClassAssignment` call in `upsertClassJudgeAssignment`. Its body becomes `setClassJudge`, and the public signature is unchanged.
  - `ReplicatedJudgeAssignmentsTable.replaceClassAssignment`, once nothing calls it.
  - `touchClassForJudgeSync`, which the trigger makes redundant.
  - The stale comments citing the old write.
- **Kept:**
  - `CLASS_DIRTY_ROW_COMPARE_POLICY` and its judge `fieldGroups`.
  - `resolveConflict` and its keep-cached-name behaviour.
  - Enrichment.
  - `applyShowLevelJudgeChanges` (show-level rows are out of scope).

  No override code comes back.

- **Accepted behaviour change.** The local `judge_assignments` replica now catches up on the post-upload full sync (`ReplicationSyncProvider.tsx:629-631`), not instantly. Readers of the class judge are unaffected. To check: whether `useJudgeAssignedToClass` and the judge-day capacity UI need a class-row fallback while offline.

### 4. Entry points

| Entry point                                             | Under Option C                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Show-home class panel (`useClassJudgeAssignment.ts:80`) | Moves through `upsertClassJudgeAssignment`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Bulk Assign judge (`useBulkJudgeAssignment.ts:55`)      | One RPC mutation per class.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Setup → Classes (`useClassEditActions.ts:55`)           | Moves. Verify that its follow-up `updateClass` sends no judge columns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Wizard offline path (`createWizardClasses.ts:17`)       | Moves. Its `dependsOn` on the pending class INSERT is required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Waitlist reassign (`reassignClassJudge`)                | After an offline pick, the local `judge_assignments` replica still names the previous judge. `reassignClassAssignment` looks for `fromPersonId` there and silently returns when it finds nothing (`ReplicatedJudgeAssignmentsTable.ts:420`), so the reassignment is reported but never queued (Codex, 2026-10-28). Fix in Batch 3: when the class has a pending or failed `set_class_judge`, the reassign queues another `set_class_judge` chained after it. Otherwise it keeps the in-place assignment UPDATE, which preserves the id, fee and notes. A missing match throws a clear error and never returns silently. The redundant touch is dropped. |

## Batches (one PR each, shippable on its own)

1. **Migration, SQL test and types.**
   - Contents:
     - `supabase/migrations/20261028HHMMSS_myk9_1327_set_class_judge.sql`. HHMMSS must be odd and sort after both the live DB and `origin/main`; recheck both just before committing.
     - The behavioural test `supabase/tests/myk9_1327_set_class_judge_test.sql`, registered in `scripts/qa/run-behavioral-sql-tests.sh` and its `.test.ts`.
     - Regenerated database types.
   - Test cases:
     - replace A with B;
     - a replay is a no-op (same version and assignment id);
     - `NULL` removes the judge;
     - another club's secretary, a plain user, a judge and anon are denied;
     - a deleted class gives P0002, and a deleted person gives 22023;
     - club_admin and site_admin callers succeed, including a site admin on a draft show (to settle the INVOKER visibility question);
     - non-confirmed class-level rows are replaced;
     - show-level rows are untouched;
     - the function ACL.
   - Review: the migration-auditor plus Codex. Held for the owner's `db push`.
2. **Engine (as amended 2026-10-28): `isRetryableError` treats `P0002` and `22023` as permanent.** The jsonb version read, the parked-keeps-dirty rule and the ack mapper were dropped (see Amendment).
   - Tests:
     - `isRetryableError` treats `P0002` and `22023` as permanent;
     - `packages/replication` shuffled.
   - Review tier: independent (a replication engine path).
3. **The fix:** `setClassJudge`, the dependency and supersede helpers, rewiring `upsertClassJudgeAssignment`, and the deletions. It ships only after Batch 1 is live.
   - Tests on the real replica and queue (fake-indexeddb `MutationManager` plus `ReplicatedClassesTable`):
     - **Red before, green after:** an unrelated class UPDATE acks while the pick is backed off, then a pull returns the old judge. The local judge stays the new one.
     - Retry success: the row goes clean and shows the picked judge; a later queued class edit rebases through the OCC conflict path and lands.
     - A permanent failure is listed in Sync issues with Retry and Discard; Discard removes it and the row shows the server's judge.
     - A→B→C across backoff, parking, discard and retry orderings ends at C, with C shown throughout.
     - A superseded failed pick is discarded.
     - Last writer wins after the acks.
     - The wizard pick waits for the class INSERT.
     - A parked pick, then an unrelated class edit acks and a pull restores the old judge on the row: the pick is still in Sync issues, and Retry lands it.
     - Offline pick then a waitlist reassign of that class: the reassign is queued as a chained `set_class_judge`, and the final judge is the reassigned one. A reassign that finds no match throws.
     - Offline reload: rebuild from IndexedDB with the mutation still queued, and the judge persists.
     - `reads.test.ts` is updated.
     - `src/services/replication` runs shuffled six times.
   - Browser gate: Walk C of `docs/qa/walk-class-judge-and-bulk-edit.md`, extended:
     1. Stall `rpc/set_class_judge` while class writes still flow.
     2. Pick a judge, make an unrelated class edit, and reload.
     3. Check the new judge stays on the show home and in Setup → Classes.
     4. Unblock, and check it converges with no conflict prompt.
     5. Check a 403-parked pick shows in Sync issues and Discard restores the old judge.
     6. Run at 1440 and 375.
     7. Check the network log shows exactly one `rpc/set_class_judge` per pick, with no `judge_assignments` POST or DELETE and no class PATCH.

   This walk writes the shared database, so it needs the owner's OK, or an isolated local stack.

4. **(Optional)** Drop `touchClassForJudgeSync` from `reassignClassJudge`.

## Decisions (owner, 2026-10-28)

Codex reviewed this plan twice. Round 1's three findings are folded in above. Round 2's two were put to the owner as a convergence stop, and decided:

1. ~~**Discard after a sibling edit has uploaded: field-scoped discard.**~~ **Moot after the Amendment:** a parked pick no longer holds the row, so a sibling's ack cleans it and Discard has nothing to revert. Discarding a parked `set_class_judge` re-reads that class from the server through the existing row-refetch adapter (`getRowRefetchAdapter().fetchRowsById`) and overwrites only the judge fields with the server's values. It clears dirty only if nothing else is pending or parked for the row. Every other discard keeps the whole-row `newerLocalWrite` guard in `mutation-discard-revert.ts`. This belongs in Batch 2 (engine) or Batch 3 (the class table's discard hook). Test: a pick parks, an unrelated class edit uploads, Discard; the judge returns to the server's value and the row is clean.
2. **Old clients during the rollout: accepted, pre-launch.** Every client today is the owner's or a test device, and the PWA update prompt moves them to the new version. No unique index is added. This is a known window, and if it ever matters the remedy is a partial unique index on confirmed class-level rows.

## Amendment (owner, 2026-10-28, after Batch 2's Codex rounds)

Batch 2 (#3361) tried to make a parked mutation keep its row dirty, plus read the jsonb version. Codex found five defects in three rounds on that rule, two of them in code the earlier fixes added: a stranded dirty row on tables without a Discard reverter, an ack/Discard race, and an offline Discard with no base. The owner chose to delete the rule. A parked pick is recovered through Retry in Sync issues, the way every table behaves today. Batch 2 ships only the P0002/22023 classification.

## Risks

- **Version churn.** Each pick bumps `classes.version` once for each row it deletes and once for the row it inserts, so another device's queued unrelated class edit rebases. Today's direct writes do the same, so this is not a regression.
- **A chained pick waits behind a parked earlier pick** until that one is retried or discarded. This is intentional, and Sync issues is the remedy.
- **Mixed-version clients during the deploy** converge on the server, because Batch 3 ships only after Batch 1 is live.
- **The site-admin read on a draft show** under INVOKER is settled by Batch 1's SQL test.

## Not verified (settle while building)

- Whether `useClassEditActions`' `updateClass` sends judge columns.
- The owner-scoped API for reading and discarding a row's failed mutations (`discardFailedMutation`, `MutationQueueStore.ts:253`).
- How `isRetryableError` classifies `P0002` and `22023` (they should be permanent).
- That the post-upload full sync re-pulls `judge_assignments`.
- Whether making failed mutations keep rows dirty changes any existing expectation, for example a table that relied on an ack cleaning a row with a parked sibling. Grep the engine tests before the change.

## Non-goals

- Cross-device conflict detection for a pick (`p_expected_person_id`).
- Show-level judge edits through an RPC.
- Server-side qualification enforcement.
- The online `create_show_with_children` path.
- The waitlist reassign beyond dropping the touch.

## Testing phase

Each batch is done when its listed tests pass, run shuffled where the plan says so. The plan is Complete when Batch 3's Walk C passes and MYK9-1327's acceptance criteria are checked against it.
