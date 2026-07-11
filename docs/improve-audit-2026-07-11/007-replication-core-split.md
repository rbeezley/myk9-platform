# 007 — Finish decomposing MutationManager and ReplicatedTable

> Written against commit `15897d862` (2026-07-11), after a full read of both files by the auditing model. This plan exists because the audit backlog flagged the split as "needs characterization tests first / too risky for a cheap executor." That verdict is **revised** here: the risk is much lower than the backlog implied, provided the executor follows the rules below exactly. The design work is done in this document; the remaining work is disciplined verbatim code movement.

## Verdict that changes the risk profile

Both files are **already partially decomposed**, and the codebase has already proven both extraction idioms this plan uses:

- `ReplicatedTable` (1099 lines, `packages/replication/src/core/ReplicatedTable.ts`) already delegates to two extracted manager objects created in its constructor — `ReplicatedTableCacheManager` and `ReplicatedTableBatchManager` — plus pure row-state builders in `ReplicatedTableRowState.ts` and conflict-snapshot helpers in `ReplicatedTableConflict.ts`. The pattern to follow is IN THE FILE.
- `MutationManager` (1480 lines, `packages/replication/src/MutationManager.ts`) already imports 8 extracted helper modules (`mutation-utils`, `mutation-occ`, `mutation-retry`, `mutation-ordering`, `mutation-backup`, `mutation-queue-capacity`, `quota-eviction`, `perf`), each with its own colocated test file. The pattern to follow is IN THE PACKAGE.

The test suite is the characterization suite. `MutationManager` has 4 dedicated test files (`MutationManager.test.ts` at 1938 lines, plus `.replay`, `.stress`, `.recovery-backup`) and the package has `replication-chaos.test.ts`; `ReplicatedTable` has `.test`, `.subscription.test`, plus per-manager suites (`ReplicatedTableCache.invariants.test.ts` etc.). **All of these test through the public/protected API**, and this plan changes neither — so the existing suites run unmodified and green at every step. Only a handful of new pinning tests are needed (Phase 0).

## Frozen contracts — the executor must not change any of these

1. **`MutationManager` public API** (single production instantiation: `apps/myk9show/src/services/replication/sharedMutationManager.ts:34`): `queueMutation`, `requestUpload`, `getPendingCount`, `getPendingMutationsForRow`, `getFailedMutations`, `retryFailedMutation`, `discardFailedMutation`, `discardPendingMutationsForRow`, `updateMutationServerVersions`, `reconcilePendingMutationsForRow`, `uploadPendingMutations`, `backupMutationsToLocalStorage`, `restoreMutationsFromLocalStorage`, `clearAllMutations`, `destroy`. Signatures byte-identical.
2. **`ReplicatedTable` protected/public API** consumed by ~10 app subclasses (`apps/myk9show/src/services/replication/Replicated*Table.ts`): `queueMutation`, `requestUpload`, `rebuildUpdatePayload`, `getMutationPendingCount`, `getPendingMutationIdsForRow`, `init`, `runTransaction`, `notifyListeners`, `isExpired`, abstract `sync` / `resolveConflict`, and every public method. Signatures byte-identical.
3. **`packages/replication/src/index.ts` exports** — unchanged. New internal modules are NOT exported from the package barrel.
4. **Window `CustomEvent` names and detail shapes**: `replication:queue-overflow`, `replication:mutation-queued`, `replication:upload-complete`, `replication:sync-failed`. App code listens for these.
5. **Every behavioral comment travels with its code.** The two files are dense with incident-history comments (audit M1/M2, PR #351 race, #961 backoff, ringside conflict storm). Moving code without its comment block is a defect.

## Behavioral invariants the code encodes (why verbatim movement matters)

The executor does not need to re-derive these, but must not "clean up" code that implements them:

- **Sequence counter** (`nextSequenceNumber`): seeded once from persisted metadata AND max in-store sequence, then incremented *synchronously* — no `await` between read and write of `this.sequenceCounter`. Reordering those lines breaks same-millisecond ordering.
- **OCC zombie guard** (`runUploadPass` catch block): on `OccRejectionError`, the mutation is re-read (`db.get`) before `db.put` of backoff state — a blind put resurrects a mutation another tab already uploaded and deleted (audit M1).
- **`scheduleUploadNow=false` / `deferUpload` contract**: mutation persisted but upload NOT scheduled until the caller marks the cache row dirty, else an online flush deletes the mutation first and strands the row pending forever.
- **Dirty-row guard in `set()`**: a clean server write never overwrites `existingRow.isDirty` — the scoring-sync-bug root cause.
- **Single-transaction read+write** in `getReplicatedRow` access tracking, `markAsSynced`, and `reconcileDirtyRow` — splitting any of these back into two transactions reintroduces the PR #351 clobber race.
- **Forward-only token advance + churn guard** in `reconcileDirtyRow`; **queue reconcile after row reconcile** (upload reads the QUEUED snapshot, not the row).
- **23505 on INSERT treated as success** (client-generated UUIDs; retry after a committed insert).
- **Backups are synchronous, include FAILED mutations, and never fail queueMutation** (localStorage-full is swallowed; IndexedDB is the primary durability).
- **Web Locks cross-tab serialization** with graceful fallback when `navigator.locks` is absent (tests rely on the fallback).

## Target shape

### MutationManager → facade + 3 collaborator classes + 1 pure module

Mirror the `ReplicatedTable` cacheManager/batchManager idiom: collaborators are instantiated in the `MutationManager` constructor and hold only their own state. All in `packages/replication/src/` as siblings of the existing `mutation-*.ts` helpers.

| New module | Moves in (verbatim) | State it owns | ~lines |
| --- | --- | --- | --- |
| `mutation-execute.ts` (pure functions, no class) | `executeMutation` (as `executeMutation(supabase, mutation)`), `isPrimaryKeyDuplicateError`, `MutationExecutionResult` | none | ~230 |
| `MutationQueueStore.ts` (class; ctor: `logger`) | `nextSequenceNumber` + `SEQUENCE_METADATA_KEY`, `queueMutation`'s persistence half, `getPendingCount`, `getPendingMutationsForRow`, `getFailedMutations`, `retryFailedMutation`, `discardFailedMutation`, `discardPendingMutationsForRow`, `updateMutationServerVersions`, `reconcilePendingMutationsForRow`, `clearAllMutations`, `evictCleanCacheRows` | `sequenceCounter`, `sequenceSeedPromise` | ~430 |
| `MutationUploadRunner.ts` (class; ctor: `supabase`, `logger`, `maxRetries`, `retryBackoffBase`, `queueStore`, `backup` callback) | `scheduleUpload`, `scheduleBackoffRetry`, `uploadPendingMutations` (Web Locks wrapper), `runUploadPass`, `notifyUserOfSyncFailure` | `uploadDebounceTimer`, `backoffRetryTimer`, `backoffRetryAt`, `isUploading` | ~380 |
| `mutation-row-sync.ts` (pure functions taking `db`) | `markReplicatedRowSynced`, `advanceReplicatedRowServerVersion`, `remapDogIdReferences`, `remapUploadedRpcInsertRowId` | none | ~180 |

`MutationManager.ts` shrinks to a ~200-line facade: constructor wiring, public methods delegating one-to-one, `backupMutationsToLocalStorage` / `writeCurrentMutationsBackup` / `restoreMutationsFromLocalStorage` (they already lean on `mutation-backup.ts`; they may stay in the facade — they are small), `destroy`. Note the cycle to avoid: `runUploadPass` calls queue-store methods AND `writeCurrentMutationsBackup` — pass those as constructor-injected references (`queueStore` instance, `backup: () => Promise<void>`), never import the facade from a collaborator.

### ReplicatedTable → keep the class, extract 2 more seams

The class is a **template-method base class**; do not break inheritance. Extract only:

| New module | Moves in (verbatim) | ~lines |
| --- | --- | --- |
| `core/ReplicatedTableQuery.ts` (class `ReplicatedTableQueryManager<T>`; ctor mirrors CacheManager: `tableName`, `logger`, `init`, `isExpired`, `getAll` fallback) | `queryByField` (with its timeout/abort scaffolding), `queryIndex`, `getAll` (with its timeout + `databaseManager.resetFailures/recordFailure` calls), `getAllLocalIds` | ~250 |
| `core/RowLockRegistry.ts` (small class) | `acquireRowLock`, `releaseRowLock`, the `rowLocks` map — exposed as `withRowLock(id, fn)` | ~50 |

`ReplicatedTable.ts` keeps: CRUD (`get`/`getReplicatedRow`/`set`/`setOnce`/`delete`), the conflict lifecycle (`markConflict`, `clearConflict`, `replaceFromRemote`, `reconcileDirtyRow`, `resolveReplicationConflict`, `getConflictedRows`, `markAsSynced`) — these are the cross-cutting heart of the class and their builders are already extracted; moving the orchestration would add indirection without reducing risk — plus mutation-manager glue, delegation blocks, `removeStaleEntries`, and abstract methods. Expected landing size ~780 lines. That is still >500; the project's ratchet (`scripts/qa/code-quality-ratchet.baseline.json`) already carries it — the goal is risk-reduction and cohesion, not hitting 500 in one pass. Do NOT extract the conflict lifecycle in this plan.

`optimisticUpdate` stays but calls `this.rowLocks.withRowLock(id, ...)`.

## Phases

### Phase 0 — pinning tests (write FIRST, run green against current code)

New file `packages/replication/src/MutationManager.pinning.test.ts` (or extend existing suites where a hook already exists). Each test pins one invariant from the list above **through the public API only**. Required pins (skip any already covered — grep the existing suites first and note coverage in the PR description):

1. Sequence numbers strictly increase across two `queueMutation` calls racing in the same tick (`Promise.all`).
2. After simulated reload (new MutationManager instance, same fake DB), next sequence > max persisted sequence even when SYNC_METADATA record is deleted.
3. OCC rejection when the mutation was concurrently deleted from the store → no `db.put` resurrection (assert store still empty).
4. `queueMutation(..., scheduleUploadNow=false)` does not trigger an upload; a later `requestUpload()` does.
5. `set(id, data, false)` on a dirty row is a no-op (data and isDirty unchanged).
6. `reconcileDirtyRow` with a lower `remoteServerVersion` does not regress the token; with equal data + no advance returns `false` and performs no write.
7. Backup written by `queueMutation` includes previously-failed mutations; `discardFailedMutation` removes the mutation from the next backup.
8. 23505 duplicate-key on INSERT resolves as success and deletes the pending mutation.
9. `uploadPendingMutations` works when `navigator.locks` is undefined (fallback path).
10. Failed upload dispatches `replication:sync-failed` with `detail.count`; successful upload dispatches `replication:upload-complete` with `detail.tables`.

Use the existing test scaffolding (`src/test-utils/createMutationManagerTestDb.ts`, fake-idb patterns in `MutationManager.test.ts`). Assertion-first rule applies: run each pin red against a deliberately broken local copy if unsure it actually bites, then restore.

### Phase 1 — pure extractions (`mutation-execute.ts`, `mutation-row-sync.ts`)

Move code verbatim, convert `this.supabase`/`this.logger` to parameters, update MutationManager to import + delegate. No logic edits. Gate, commit.

### Phase 2 — `MutationQueueStore`

Move the queue-persistence methods. `queueMutation` in the facade keeps its orchestration order EXACTLY: capacity check → persist → synchronous backup (swallow errors) → `replication:mutation-queued` dispatch → conditional `scheduleUpload()`. Gate, commit.

### Phase 3 — `MutationUploadRunner`

Move the upload engine. `destroy()` delegates timer cleanup to the runner. Gate, commit.

### Phase 4 — `ReplicatedTableQuery` + `RowLockRegistry`

Mirror the CacheManager constructor-injection style. Gate, commit.

### Gate (every phase, no exceptions)

```bash
pnpm --filter @myk9/replication build   # app tests run against built dist
cd packages/replication && pnpm test
pnpm typecheck && pnpm lint
cd apps/myk9show && pnpm test           # subclasses + offline services consume the package
```

Commit after each green phase (worktree checkpoint rule). If any existing test needs *editing* to pass, STOP — that is a behavior change, not a move; revert the step and report.

## Out of scope

- Any behavior change, however obviously "better". No renaming public/protected members. No barrel-export additions. No conflict-lifecycle extraction from ReplicatedTable. No changes to app-side `Replicated*Table.ts` subclasses. No ratchet-baseline edits beyond what the ratchet script itself requires when files shrink.

## Done criteria

- All four gates green at HEAD; every phase committed separately.
- `wc -l` on `MutationManager.ts` ≤ ~250 and `ReplicatedTable.ts` ≤ ~800; every NEW module < 500 lines.
- `git diff` review: moved blocks match their origin (comments included) — reviewer spot-checks `runUploadPass` and `nextSequenceNumber` byte-for-byte.
- Pinning tests from Phase 0 all green and running in CI with the package suite.
- `docs/improve-audit-2026-07-11/README.md` backlog row for the split updated to point here; audit README status flipped when merged.
