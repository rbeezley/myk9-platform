## 1. Phase 1 — Score-loss closures

- [x] 1.1 In `apps/myk9show/src/hooks/useOptimisticScoring.ts`, remove the "Non-fatal" swallow around `replicatedEntriesTable.updateEntry`: rethrow on error and treat a `null` mutation id as a failure, so the optimistic-success/navigation path does not run.
- [x] 1.2 Surface the blocking submit error in the at-show scoresheet (`features/at-show/useAtShowScoresheet.ts` + the scoresheet UI) — keep the judge on the sheet, show a clear "score not saved" message, do not `transitionToCompleted`/navigate.
- [x] 1.3 Assertion-first test: mock `updateEntry` to throw (queue overflow) and to return `null`; assert `onSuccess`/navigation is NOT called and an error state is shown. Add a green-path test asserting success only fires on a resolved mutation id.
- [x] 1.4 In `packages/replication/src/core/DatabaseManager.ts` `recover()` (and the corrupted-store path), snapshot `pending_mutations` + `failed_mutations` to localStorage before `deleteDB`, and restore after re-open. (Snapshot in `recover()`; restore wired into the `replication:recovery` handler in `ReplicationSyncProvider.tsx`.)
- [x] 1.5 Extend `mutation-backup.ts` so the backup format includes `status: 'failed'` mutations (stop filtering them in `parseMutationBackup`); restore failed mutations into the failed store, not the active queue.
- [x] 1.6 Test: simulate breaker trip with pending + failed mutations present; assert both survive `recover()` and land in the correct stores.
- [x] 1.7 Fix the `getReplicatedRow` read-modify-write race in `packages/replication/src/core/ReplicatedTable.ts` — single readwrite transaction re-reading inside the tx, or write access-stat fields only (never rewrite `data`/`isDirty`).
- [x] 1.8 Test: interleave `getReplicatedRow` access-tracking with a concurrent `set(id, data, isDirty=true)`; assert the dirty flag and new value survive.
- [x] 1.9 Make retry classification fail-open in `mutation-utils.ts` / `mutation-retry.ts`: unknown/unclassified errors are retryable; only affirmatively-permanent errors (RLS, 4xx, constraint) dead-letter on first failure.
- [x] 1.10 Test: `AbortError`, a statement-timeout code, and an unknown 5xx body are retried; an RLS/4xx/constraint error dead-letters immediately.

## 2. Phase 2 — Durability hardening

- [x] 2.1 Request `navigator.storage.persist()` at app startup and on entering `/at-show`; log the `persisted()` result. Degrade gracefully when denied.
- [x] 2.2 On iOS Safari (non-standalone) with unsynced work present, show the Add-to-Home-Screen nudge (reuse existing PWA install affordance; confirm copy/threshold with INTENT owner).
- [x] 2.3 Add a persisted monotonic `sequenceNumber` (counter in `sync_metadata`) assigned in `MutationManager.queueMutation`; populate `types.ts` field.
- [x] 2.4 Use `sequenceNumber` as the primary sort key in `mutation-ordering.ts` (timestamp as tiebreaker), preserving the topological dependency sort.
- [x] 2.5 Test: two same-timestamp edits to one row upload oldest-first; a re-stamped stale payload cannot become the final server value. Assert dependency order still holds.
- [x] 2.6 Wrap `uploadPendingMutations` in `navigator.locks.request('replication-upload', ...)`; add an existence re-check before the OCC-backoff `db.put` so a deleted mutation cannot be resurrected.
- [x] 2.7 Test: simulate two tabs uploading; assert no duplicate upload and no zombie mutation after an OCC rejection.
- [x] 2.8 Wrap the localStorage backup write in `queueMutation` in try/catch (log, don't reject); wrap the `pending_mutations` put in `withQuotaEviction`.
- [x] 2.9 Test: backup write throws and quota-pressured put both leave the score durably queued and the submit reporting success.
- [~] 2.10 Add a startup scan for dirty rows lacking a pending mutation; regenerate a mutation so the stranded score uploads. **REMOVED after code review** (Claude + Codex): the repair guards a crash window between two adjacent awaits that Phase 1's fail-closed submit already de-risks (no false success), and a correct implementation needs `baseData`-delta reconstruction that isn't reliably available (baseData is only captured when a clean cached row first goes dirty). The repair produced 5 review findings (dead-letter resurrection, RLS-denied direct UPDATE, dropped non-ringside edits, discard non-durability). M6 is deferred as a documented, low-severity gap alongside M5.

## 3. Phase 3 — Transparency

- [x] 3.1 Delete the `Math.random()` mocks in `apps/myk9show/src/hooks/useGlobalSyncStatus.ts` (`useGlobalSyncStatus` + `useEntitySyncStatus`); re-implement from `useReplicationSync()` / `mutationManager.getPendingCount()` (status, pending count, last-sync time, per-entity error).
- [x] 3.2 Verify `AccountMenuContent.tsx` and `SyncStatusPanel.tsx` now render real state; update any prop shapes they depend on.
- [x] 3.3 Plumb real `pendingCount` + last-sync time into the ringside `SyncIndicator` slot (`features/at-show/slots/atShowLayoutSlotComponents.tsx`, `pageProps.ts`) and render it in `packages/ringside/src/pages/EntryList/components/EntryListHeader.tsx` whenever `pendingCount > 0`, not only while syncing/error.
- [x] 3.4 Add a listener + visible UI for `replication:queue-overflow` (dispatched in `MutationManager.ts`).
- [x] 3.5 Persist the full `ScoreData` (per-area times, correct/incorrect counts, points, NQ reason, finish-call errors) through `useOptimisticScoring` → the already-whitelisted `ringside_update_entry` columns, instead of only local Zustand session.
- [x] 3.6 Test: submitting a multi-area scent work score enqueues a mutation carrying all detail fields mapped to the correct columns (assertion-first `toHaveBeenCalledWith`).
- [x] 3.7 Test/verify: sync-status surfaces reflect a seeded pending queue (non-zero count, real last-sync time, no randomized values).

## 4. Verification & close-out

- [x] 4.1 `pnpm typecheck` and `pnpm lint` clean across the monorepo. (typecheck 26/26; lint clean for all changed files — one pre-existing `effectiveShowEntries` warning in `ShowDetailsPage.tsx`, identical to `main`, unrelated to this change.)
- [x] 4.2 Run the replication package test suite and the affected app tests green (`cd apps/myk9show && pnpm test` scoped to changed areas). (replication 433 passed; affected app tests green.)
- [x] 4.3 Manual/verify pass: offline score submit shows pending count; forced queue failure shows a blocking error; simulated recovery preserves mutations. (Covered by unit tests: fail-closed submit, recovery backup round-trip, header pending-count render, usePendingMutationCount. Browser-driven verification deferred — worktree Preview MCP serves `main` code, so unit coverage is the reliable signal here.)
- [x] 4.4 Update `docs/audits/2026-07-08-replication-offline-scoring.md` status to reflect remediated findings; flip this change toward archive on merge.
