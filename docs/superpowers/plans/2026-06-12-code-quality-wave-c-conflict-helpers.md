# Code Quality Wave C Conflict Helpers Implementation Plan

> **For agentic workers:** Use superpowers:test-driven-development and superpowers:verification-before-completion. Keep this slice scoped to pure conflict row-state helpers; do not change IndexedDB transaction boundaries or UI/provider behavior.

**Goal:** Continue Wave C replication-core extraction by moving conflict row-state transitions out of `ReplicatedTable`.

**Architecture:** `ReplicatedTable` remains responsible for IndexedDB reads/writes, transactions, listener notification, mutation manager integration, query/cache behavior, and public API shape. New pure helpers build or filter `ReplicatedRow` conflict states.

---

## Task 1: Extract Pure Conflict Row-State Helpers

**Files:**
- Create: `packages/replication/src/core/ReplicatedTableConflict.ts`
- Create: `packages/replication/src/core/ReplicatedTableConflict.test.ts`
- Modify: `packages/replication/src/core/ReplicatedTable.ts`

- [x] **Step 1: Write failing tests**

Add direct tests for:
- stale/missing conflict snapshots return no row update.
- valid conflict snapshots produce a dirty `syncStatus: 'conflict'` row.
- clearing conflict only applies to conflicted rows and preserves local data.
- replacing from remote normalizes IDs, marks the row clean/synced, clears base/conflict metadata, increments version, and preserves access count.
- conflict snapshot filtering returns only persisted conflict snapshots.

Run:

```bash
pnpm --filter @myk9/replication test -- --run src/core/ReplicatedTableConflict.test.ts
```

Expected: fail because `ReplicatedTableConflict.ts` does not exist.

- [x] **Step 2: Implement helper**

Create pure functions:
- `applyConflictSnapshot(existingRow, conflict)`
- `clearConflictSnapshot(existingRow, newServerVersion)`
- `buildRemoteReplacementRow({ tableName, id, remoteData, existingRow, remoteServerVersion, now })`
- `getConflictSnapshots(rows)`

- [x] **Step 3: Integrate helper**

Use the helpers in `markConflict`, `clearConflict`, `replaceFromRemote`, and `getConflictedRows`. Keep all DB transactions and `notifyListeners()` calls in `ReplicatedTable`.

## Task 2: Tracking Docs And Verification

**Files:**
- Modify: `OPEN-TODOS.md`
- Modify: `docs/audits/2026-06-code-quality/01-oversized-files.md`
- Modify: `docs/audits/2026-06-code-quality/09-phase-2-verification.md`
- Modify: `docs/audits/2026-06-code-quality/SUMMARY.md`

- [x] **Step 1: Update tracking docs**

Record Wave C replication-core slice 3 as implemented for conflict row-state helpers. Keep Wave C open for remaining table/provider helpers, scoring, and Show Map extractions.

- [x] **Step 2: Verify**

Run:

```bash
pnpm --filter @myk9/replication test -- --run src/core/ReplicatedTableConflict.test.ts src/core/ReplicatedTable.test.ts src/syncReplicatedTable.test.ts
pnpm --filter @myk9/replication test
pnpm --filter @myk9/replication typecheck
pnpm typecheck
pnpm lint
git diff --check
```

Expected: all pass; `pnpm lint` may show the known pre-existing Fast Refresh warning in `apps/myk9show/src/components/entries/management/RefundEntryDialog.tsx`.

- [ ] **Step 3: Commit and PR**

Commit with:

```bash
git add packages/replication/src/core docs OPEN-TODOS.md
git commit -m "refactor(code-quality): extract replication conflict helpers"
```

Create a ready PR, enable auto-merge, monitor CI/Vercel, and clean up after merge.
