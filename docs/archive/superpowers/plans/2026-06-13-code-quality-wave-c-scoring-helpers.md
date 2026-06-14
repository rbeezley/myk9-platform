# Code Quality Wave C Scoring Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue Wave C by extracting pure service helper logic from `OfflineScoringService` without changing scoring behavior.

**Architecture:** `OfflineScoringService` remains responsible for storage, persistence, events, sync service calls, and orchestration. New pure helpers in `offline-scoring-service-helpers.ts` own score lookup/sorting, event shaping, sync queue item construction, sync queue status/cleanup selection, and statistics calculation.

**Tech Stack:** TypeScript, Vitest, myK9Show scoring services.

---

### Task 1: Extract Offline Scoring Service Helpers

**Files:**

- Create: `apps/myk9show/src/services/scoring/offline-scoring-service-helpers.ts`
- Create: `apps/myk9show/src/services/scoring/offline-scoring-service-helpers.test.ts`
- Modify: `apps/myk9show/src/services/scoring/OfflineScoringService.ts`

- [x] **Step 1: Write failing tests**

Add direct tests proving:

- `getOfflineScoreKey('entry-1', 'class-1', 'judge-1')` returns the existing composite key format.
- `findScoreForEntry()` finds an exact judge score when `judgeId` is passed and falls back to any entry/class score when it is omitted.
- `getClassScoresFromCache()` filters by class and sorts by `recordedAt`.
- `getPendingScoresFromCache()` returns only scores with `syncStatus: 'pending'`.
- `buildScoringEvent()` preserves the existing default-empty `entryId` / `classId` / `judgeId` behavior.
- sync queue builders create the same `entry` update/delete/session items the service created inline.
- `getSyncQueueStatus()` and `retainSyncQueueItems()` preserve the service's current attempt/timestamp policy.
- `getOfflineScoringStatistics()` counts cached scores, active sessions, queue length, and total submitted scores.

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/services/scoring/offline-scoring-service-helpers.test.ts
```

Expected: fail because `offline-scoring-service-helpers.ts` does not exist.

- [x] **Step 2: Implement helper**

Create pure helpers:

- `getOfflineScoreKey()`
- `findScoreForEntry()`
- `findScoreById()`
- `getClassScoresFromCache()`
- `getPendingScoresFromCache()`
- `buildScoringEvent()`
- `detectQualificationConflict()`
- `buildConflictResolution()`
- `buildScoreSyncQueueItem()`
- `buildDeletionSyncQueueItem()`
- `buildSessionSyncQueueItem()`
- `getSyncQueueStatus()`
- `retainSyncQueueItems()`
- `getOfflineScoringStatistics()`

- [x] **Step 3: Integrate helper**

Replace matching inline logic in:

- `getScore()`
- `getClassScores()`
- `queueScoreForSync()`
- `queueDeletionForSync()`
- `queueSessionForSync()`
- `getScoreKey()`
- `emitEvent()`
- `detectConflicts()`
- `resolveConflicts()`
- `getScoreById()`
- `getPendingScores()`
- `getSyncQueueStatus()`
- `getStatistics()`
- `cleanup()`

Keep persistence, logger calls, sync-service calls, and event emission inside `OfflineScoringService`.

### Task 2: Tracking Docs And Verification

**Files:**

- Modify: `OPEN-TODOS.md`
- Modify: `docs/audits/2026-06-code-quality/01-oversized-files.md`
- Modify: `docs/audits/2026-06-code-quality/09-phase-2-verification.md`
- Modify: `docs/audits/2026-06-code-quality/SUMMARY.md`

- [x] **Step 1: Update tracking docs**

Record Wave C scoring slice 1 as implemented for offline scoring service helpers. Keep Wave C open for remaining scoring component/UI extractions if needed and Show Map extraction.

- [x] **Step 2: Verify**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/services/scoring/offline-scoring-service-helpers.test.ts src/services/scoring/ScoreValidatorService.test.ts src/services/scoring/PlacementCalculatorService.helpers.test.ts
pnpm --filter @myk9/show typecheck
pnpm typecheck
pnpm lint
git diff --check
```

Expected: all pass; `pnpm lint` may show the known pre-existing Fast Refresh warning in `apps/myk9show/src/components/entries/management/RefundEntryDialog.tsx`.

- [ ] **Step 3: Commit and PR**

Commit with:

```bash
git add apps/myk9show/src/services/scoring docs OPEN-TODOS.md
git commit -m "refactor(code-quality): extract offline scoring helpers"
```

Create a ready PR, enable auto-merge from the main repo directory, monitor CI/Vercel, and clean up after merge.
