# Code Quality Wave C Provider Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue Wave C by extracting pure replication provider status/classification helpers out of `ReplicationSyncProvider`.

**Architecture:** `ReplicationSyncProvider` remains responsible for React state, auth/network effects, mutation manager calls, logging, notifications, toasts, and query-client invalidation. New pure helpers in `replicationSyncStatus.ts` compute table status maps, classify table sync results, and list query keys to invalidate after a full sync.

**Tech Stack:** TypeScript, React, Vitest, TanStack Query, myK9Show provider tests.

---

### Task 1: Extract Provider Status Helpers

**Files:**
- Create: `apps/myk9show/src/providers/replicationSyncStatus.ts`
- Create: `apps/myk9show/src/providers/__tests__/replicationSyncStatus.test.ts`
- Modify: `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`

- [x] **Step 1: Write failing tests**

Add direct tests proving:
- `createTablesStatus(['shows', 'entries'], 'idle')` returns both tables with `idle`.
- `classifyTableSyncResults()` marks successful tables `success`, aborted tables `idle`, failed tables `error`, records download failures with `"Unknown error"` fallback, and returns recovered table names.
- `getPostSyncInvalidationKeys(['shows', 'entries'])` returns `['shows']`, `['entries']`, and `['judges', 'assignments']`.

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/providers/__tests__/replicationSyncStatus.test.ts
```

Expected: fail because `replicationSyncStatus.ts` does not exist.

- [x] **Step 2: Implement helper**

Create:
- `type TableSyncStatus = 'idle' | 'syncing' | 'success' | 'error'`
- `createTablesStatus(tableNames, status)`
- `classifyTableSyncResults(results, isAbortSyncError)`
- `getPostSyncInvalidationKeys(tableNames)`

- [x] **Step 3: Integrate helper**

Use the helper in:
- initial provider state.
- single `syncing` all-tables state.
- full-sync result processing.
- post-sync query invalidation.

Keep all logging and notifications in `ReplicationSyncProvider`, including the existing INTENT comments.

### Task 2: Tracking Docs And Verification

**Files:**
- Modify: `OPEN-TODOS.md`
- Modify: `docs/audits/2026-06-code-quality/01-oversized-files.md`
- Modify: `docs/audits/2026-06-code-quality/09-phase-2-verification.md`
- Modify: `docs/audits/2026-06-code-quality/SUMMARY.md`

- [x] **Step 1: Update tracking docs**

Record Wave C replication-core slice 4 as implemented for provider status/result helpers. Keep Wave C open for remaining deeper table/provider, scoring, and Show Map extractions.

- [x] **Step 2: Verify**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/providers/__tests__/replicationSyncStatus.test.ts src/providers/__tests__/ReplicationSyncProvider.test.ts src/providers/__tests__/ReplicationSyncProvider.listener.test.tsx src/providers/__tests__/ReplicationSyncProvider.conflictResurface.test.tsx
pnpm --filter @myk9/show typecheck
pnpm typecheck
pnpm lint
git diff --check
```

Expected: all pass; `pnpm lint` may show the known pre-existing Fast Refresh warning in `apps/myk9show/src/components/entries/management/RefundEntryDialog.tsx`.

- [ ] **Step 3: Commit and PR**

Commit with:

```bash
git add apps/myk9show/src/providers docs OPEN-TODOS.md
git commit -m "refactor(code-quality): extract replication provider helpers"
```

Create a ready PR, enable auto-merge from the main repo directory, monitor CI/Vercel, and clean up after merge.
