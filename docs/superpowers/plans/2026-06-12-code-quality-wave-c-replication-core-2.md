# Code Quality Wave C Replication Core Slice 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue Wave C replication-core extraction by moving pure retry-state and OCC empty-update classification logic out of `MutationManager`.

**Architecture:** `MutationManager` remains responsible for Supabase calls, IndexedDB writes, timers, logging, and browser events. New pure helpers in `mutation-retry.ts` and `mutation-occ.ts` decide how failed mutations transition and how empty UPDATE results should be classified. Existing behavior, errors, and queue persistence semantics stay unchanged.

**Tech Stack:** TypeScript, Vitest, `@myk9/replication`, Supabase query builders still isolated inside `MutationManager`.

---

### Task 1: Extract Retry-State Classification

**Files:**
- Create: `packages/replication/src/mutation-retry.ts`
- Create: `packages/replication/src/mutation-retry.test.ts`
- Modify: `packages/replication/src/MutationManager.ts`

- [x] **Step 1: Write failing tests**

Add tests proving retryable errors increment retries and set `nextRetryAt`, max-retry errors move to `failed` with `Max retries exceeded`, non-retryable errors move to `failed` immediately with `Non-retryable error`, and non-Error values stringify safely.

Run:

```bash
pnpm --filter @myk9/replication test -- --run src/mutation-retry.test.ts
```

Expected: fail because `mutation-retry.ts` does not exist.

- [x] **Step 2: Implement helper**

Create `classifyMutationFailure({ mutation, error, maxRetries, retryBackoffBase, now })`, returning `{ mutation, message, canRetry, permanentlyFailed }`. Use `isRetryableError()` and `calculateBackoffDelay()` from `mutation-utils`.

- [x] **Step 3: Integrate helper**

Replace the inline retry/non-retry mutation-state block in `uploadPendingMutations()` with `classifyMutationFailure()`. Keep persistence/logging in `MutationManager`.

### Task 2: Extract OCC Empty-Update Classification

**Files:**
- Create: `packages/replication/src/mutation-occ.ts`
- Create: `packages/replication/src/mutation-occ.test.ts`
- Modify: `packages/replication/src/MutationManager.ts`

- [x] **Step 1: Write failing tests**

Add tests proving:
- `OccRejectionError` message/name/table/row/version are preserved.
- missing server row returns the current row-missing error.
- changed server version returns `OccRejectionError`.
- unchanged server version returns the current RLS UPDATE error.
- no serverVersion returns the current RLS UPDATE error.
- `getReturnedServerVersion()` extracts `version` from returned rows.

Run:

```bash
pnpm --filter @myk9/replication test -- --run src/mutation-occ.test.ts
```

Expected: fail because `mutation-occ.ts` does not exist.

- [x] **Step 2: Implement helper**

Move `OccRejectionError` to `mutation-occ.ts` and create:
- `classifyEmptyUpdateResult({ tableName, rowId, serverVersion, serverCheck })`
- `getReturnedServerVersion(rows)`

- [x] **Step 3: Integrate helper**

Use the helper after the bounded server version re-check in `executeMutation()`. `MutationManager` still performs the Supabase re-check.

### Task 3: Tracking Docs And Verification

**Files:**
- Modify: `OPEN-TODOS.md`
- Modify: `docs/audits/2026-06-code-quality/01-oversized-files.md`
- Modify: `docs/audits/2026-06-code-quality/09-phase-2-verification.md`
- Modify: `docs/audits/2026-06-code-quality/SUMMARY.md`

- [x] **Step 1: Update tracking docs**

Record Wave C replication-core slice 2 as implemented, noting retry-state and OCC empty-update classification extraction. Keep Wave C open for remaining conflict/table/provider, scoring, and Show Map extractions.

- [x] **Step 2: Verify**

Run:

```bash
pnpm --filter @myk9/replication test -- --run src/mutation-retry.test.ts src/mutation-occ.test.ts src/MutationManager.test.ts src/mutation-utils.test.ts
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
git add packages/replication/src docs OPEN-TODOS.md
git commit -m "refactor(code-quality): extract replication retry and occ helpers"
```

Create a ready PR, enable auto-merge, monitor CI/Vercel, and clean up after merge.
