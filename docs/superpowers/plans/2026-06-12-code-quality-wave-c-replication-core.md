# Code Quality Wave C Replication Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the oversized `MutationManager` replication core by extracting pure queue-ordering, queue-capacity, and mutation-backup helpers with direct tests.

**Architecture:** Keep `MutationManager` responsible for orchestration and IndexedDB/Supabase side effects. Move deterministic queue ordering into `mutation-ordering.ts`, local queue threshold classification into `mutation-queue-capacity.ts`, and localStorage backup serialization/parsing into `mutation-backup.ts`. Existing public behavior remains unchanged.

**Tech Stack:** TypeScript, Vitest, `@myk9/replication`, IndexedDB via `idb`.

---

### Task 1: Extract Mutation Queue Ordering

**Files:**
- Create: `packages/replication/src/mutation-ordering.ts`
- Create: `packages/replication/src/mutation-ordering.test.ts`
- Modify: `packages/replication/src/MutationManager.ts`

- [x] **Step 1: Write failing tests**

Add tests proving roots are ordered by timestamp, dependencies are uploaded before dependents, missing dependencies are ignored, and cycles are appended by `sequenceNumber` then timestamp.

Run:

```bash
pnpm --filter @myk9/replication test -- --run src/mutation-ordering.test.ts
```

Expected: fail because `mutation-ordering.ts` does not exist.

- [x] **Step 2: Implement helper**

Create `sortMutationsByDependencies(mutations: PendingMutation[]): { sorted: PendingMutation[]; circularCount: number }` using the existing Kahn algorithm from `MutationManager`.

- [x] **Step 3: Integrate helper**

Replace `MutationManager.topologicalSortMutations()` with the helper call. Keep warning messages in `MutationManager` so logging behavior stays owned by orchestration.

- [x] **Step 4: Verify**

Run:

```bash
pnpm --filter @myk9/replication test -- --run src/mutation-ordering.test.ts src/MutationManager.test.ts
```

Expected: all tests pass.

### Task 2: Extract Queue Capacity Classification

**Files:**
- Create: `packages/replication/src/mutation-queue-capacity.ts`
- Create: `packages/replication/src/mutation-queue-capacity.test.ts`
- Modify: `packages/replication/src/MutationManager.ts`

- [x] **Step 1: Write failing tests**

Add tests proving counts below warning are `ok`, counts at/above warning are `warning`, and counts at/above max are `overflow`.

Run:

```bash
pnpm --filter @myk9/replication test -- --run src/mutation-queue-capacity.test.ts
```

Expected: fail because `mutation-queue-capacity.ts` does not exist.

- [x] **Step 2: Implement helper**

Create `QUEUE_WARNING_THRESHOLD`, `QUEUE_MAX_SIZE`, and `getMutationQueueCapacity(count)`.

- [x] **Step 3: Integrate helper**

Use the helper in `queueMutation()` and `uploadPendingMutations()` while preserving the existing log/event messages.

### Task 3: Extract Mutation Backup Helpers

**Files:**
- Create: `packages/replication/src/mutation-backup.ts`
- Create: `packages/replication/src/mutation-backup.test.ts`
- Modify: `packages/replication/src/MutationManager.ts`

- [x] **Step 1: Write failing tests**

Add tests proving valid backup JSON parses, malformed JSON reports an error without throwing, non-array/empty payloads return no mutations, malformed mutation rows are discarded and counted, failed mutations are filtered before restore, and storage writes remove the backup when the queue is empty.

Run:

```bash
pnpm --filter @myk9/replication test -- --run src/mutation-backup.test.ts
```

Expected: fail because `mutation-backup.ts` does not exist.

- [x] **Step 2: Implement helper**

Create `MUTATION_BACKUP_STORAGE_KEY`, `parseMutationBackup(raw)`, and `writeMutationBackup(storage, mutations)`. The parser validates against `MUTATION_OPERATIONS`, requires `id`, `tableName`, `operation`, and `rowId`, discards `status: 'failed'`, and never throws for corrupt input.

- [x] **Step 3: Integrate helper**

Use the helpers in `writeCurrentMutationsBackup()`, `restoreMutationsFromLocalStorage()`, and `clearAllMutations()`. Preserve existing logger messages and warning/error levels.

### Task 4: Tracking Docs And Final Verification

**Files:**
- Modify: `OPEN-TODOS.md`
- Modify: `docs/audits/2026-06-code-quality/SUMMARY.md`
- Modify: `docs/audits/2026-06-code-quality/09-phase-2-verification.md`

- [x] **Step 1: Update tracking docs**

Record Wave C replication-core extraction as implemented/in progress, including the helper names and test coverage.

- [x] **Step 2: Full focused verification**

Run:

```bash
pnpm --filter @myk9/replication test
pnpm --filter @myk9/replication typecheck
pnpm typecheck
pnpm lint
git diff --check
```

Expected: replication package tests/typecheck pass; monorepo typecheck/lint pass or only known pre-existing lint warnings remain.

- [ ] **Step 3: Commit and PR**

Commit with:

```bash
git add packages/replication/src docs OPEN-TODOS.md
git commit -m "refactor(code-quality): extract replication mutation helpers"
```

Create a ready PR and enable auto-merge after checks pass.
