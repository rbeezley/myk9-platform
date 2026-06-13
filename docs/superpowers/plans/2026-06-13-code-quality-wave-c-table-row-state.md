# Code Quality Wave C Table Row-State Helper Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue Wave C by extracting pure row-state decisions out of `packages/replication/src/core/ReplicatedTable.ts` without changing offline-first behavior.

**Architecture:** `ReplicatedTable` keeps IndexedDB transactions, listener notification, locking, logging, and table orchestration. New pure helpers in `ReplicatedTableRowState.ts` compute replicated row snapshots for `set()`, mark dirty rows synced after side-channel persistence, and select stale/fresh local rows.

**Tech Stack:** TypeScript, Vitest, `@myk9/replication`.

---

### Task 1: Extract Replicated Table Row-State Helpers

**Files:**

- Create: `packages/replication/src/core/ReplicatedTableRowState.ts`
- Create: `packages/replication/src/core/ReplicatedTableRowState.test.ts`
- Modify: `packages/replication/src/core/ReplicatedTable.ts`

- [x] **Step 1: Write failing tests**

Add direct tests proving:

- first dirty write captures clean `baseData` / `baseVersion`.
- repeated dirty writes preserve the original clean base.
- dirty writes preserve unresolved conflict snapshots.
- clean server writes use the incoming server version.
- marking a dirty row synced clears dirty/conflict/base metadata while preserving row data/version.
- stale selectors collect only fresh local IDs and delete only clean rows missing from the server.

Run:

```bash
pnpm --filter @myk9/replication exec vitest run src/core/ReplicatedTableRowState.test.ts
```

Expected: fail because `ReplicatedTableRowState.ts` does not exist.

- [x] **Step 2: Implement helper**

Create:

- `buildReplicatedRowForSet()`
- `buildSyncedReplicatedRow()`
- `collectFreshLocalIds()`
- `selectStaleCleanRows()`

- [x] **Step 3: Integrate helper**

Use the helpers from:

- `ReplicatedTable.set()`
- `ReplicatedTable.markAsSynced()`
- `ReplicatedTable.getAllLocalIds()`
- `ReplicatedTable.removeStaleEntries()`

Keep IndexedDB transaction boundaries, listener notification, dirty-row preservation, and logging behavior in `ReplicatedTable`.

### Task 2: Tracking Docs And Verification

**Files:**

- Modify: `OPEN-TODOS.md`
- Modify: `docs/audits/2026-06-code-quality/01-oversized-files.md`
- Modify: `docs/audits/2026-06-code-quality/09-phase-2-verification.md`
- Modify: `docs/audits/2026-06-code-quality/SUMMARY.md`

- [x] **Step 1: Update tracking docs**

Record Wave C replication-core slice 5 as implemented for table row-state helpers. Keep Wave C open for scoring and Show Map extractions.

- [x] **Step 2: Verify**

Run:

```bash
pnpm --filter @myk9/replication exec vitest run src/core/ReplicatedTableRowState.test.ts src/core/ReplicatedTable.test.ts src/core/ReplicatedTableConflict.test.ts
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
git commit -m "refactor(code-quality): extract replication row-state helpers"
```

Create a ready PR, enable auto-merge from the main repo directory, monitor CI/Vercel, and clean up after merge.
