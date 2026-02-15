# Codebase Health Audit Report
Generated: 2026-02-15

## Summary

| Category | Count | Trend (vs 2026-02-12) |
|----------|-------|-----------------------|
| @ts-nocheck files | 0 | DOWN from 29 (all removed) |
| @ts-ignore comments | 1 | same |
| Explicit `any` types | 486 (total) | ~same (was 483) |
| Console statements (app source) | 2 files, 99 occurrences | DOWN from 7 files, 371 occurrences |
| Files over 400 lines (source) | 33 | DOWN from 49 |
| Unused dependencies | 7 | DOWN from 13 |
| Stale TO-DOS items | All complete | improved (myk9q TO-DOS is all checkmarks) |

---

## Findings by Category

### 1. TypeScript Escape Hatches

**@ts-nocheck: 0 files** -- All 29 previously flagged files have been resolved (deleted dead files, fixed types).

**@ts-ignore: 1 file** -- `apps/myk9q/src/services/syncManager.test.ts:37` (test mock, acceptable)

Severity: resolved | No action needed

---

### 2. `any` Type Hotspots

Total: 486 occurrences across 86 files (apps + packages).

**By area:**

| Area | Source `any` | Test `any` | Notes |
|------|-------------|------------|-------|
| myk9show src | ~50 | ~230 | Performance APIs, browser compat |
| myk9q src | ~30 | ~170 | Test mocks, replication layer |
| packages | 1 (typeGuards.ts) | 24 | Mostly test mocks |

**Top source hotspots (non-test):**

| Directory | Count | Primary Files |
|-----------|-------|---------------|
| `myk9show/src/utils/` | 10 | enhancedLazyLoading.ts (9) |
| `myk9show/src/services/performance/` | 10 | RealUserMonitoring.ts (6), PerformanceBudgets.ts (4) |
| `myk9show/src/hooks/optimized/` | 8 | useSimplifiedHooks.ts (4), useMemoryLeakDetection.ts (3) |
| `myk9show/src/hooks/` | 4 | performance-optimization-utils.ts (3) |
| `myk9show/src/services/sync/` | 3 | backgroundSyncService.ts |
| `myk9show/src/services/realtime/` | 4 | subscriptionManager.ts (2), RealtimeScoringService.ts (2) |

Most `any` usage is justified for browser performance APIs (`performance.memory`, `navigator.connection`) which lack standard TypeScript definitions.

Severity: low | Effort: sprint-task

---

### 3. Console Statements

**Application source (non-test, non-script, non-edge-function):**

| File | Count | Assessment |
|------|-------|------------|
| `myk9q/src/services/entryDebug.ts` | 85 | Debug utility -- dev-gated (`initializeDebugFunctions` has DEV check) |
| `myk9q/src/utils/testDatabaseConnections.ts` | 14 | Test utility |

**Edge Functions (server-side, OK to keep):** ~116 across 11 function files
**Scripts (OK to keep):** ~120 across debug/seed scripts
**Test files (OK to keep):** ~1,074

**Improvement:** Previous audit found 7 app source files with console statements. Now only 2 remain (both are intentional debug utilities with dev gates).

Severity: resolved | No action needed

---

### 4. Large Files (>400 lines, source only)

**33 files over 400 lines** (excluding generated types, dist/, tests):

| Range | Count | Examples |
|-------|-------|---------|
| 800+ lines | 8 | trialStore.ts (858), OfflineScoringService.ts (875), DataExportImport.ts (859) |
| 700-799 | 10 | ConfirmationStep.tsx (781), useScheduleBoard.ts (781), conflictResolver.ts (779) |
| 600-699 | 4 | showStore.ts, scoring pages |
| 400-599 | 11 | Various services and components |

**Top 10 largest source files:**

| File | Lines |
|------|-------|
| `myk9show/src/services/scoring/OfflineScoringService.ts` | 875 |
| `myk9show/src/services/data-lifecycle/DataExportImport.ts` | 859 |
| `myk9show/src/store/trialStore.ts` | 858 |
| `myk9show/src/services/deployment/ProductionMonitoringService.ts` | 797 |
| `myk9show/src/services/sync/DifferentialSyncService.ts` | 791 |
| `myk9show/src/services/analytics/UserBehaviorLearning.ts` | 784 |
| `myk9show/src/components/shows/RegistrationWorkflow/ConfirmationStep.tsx` | 781 |
| `myk9q/src/pages/TrialSecretary/hooks/useScheduleBoard.ts` | 781 |
| `myk9show/src/services/sync/conflictResolver.ts` | 779 |
| `myk9show/src/services/offline-checkin/OfflineCheckInService.ts` | 775 |

**Improvement:** Down from 49 to 33 (16 files resolved since last audit via refactoring and dead code deletion).

Severity: moderate | Effort: sprint-task per file

---

### 5. Unused Dependencies

**myk9show (5 unused):**

| Dependency | Reason |
|-----------|--------|
| `dexie-react-hooks` | Never imported; only `dexie` is used |
| `react-dnd` | Superseded by `@dnd-kit`; zero imports |
| `react-dnd-html5-backend` | Superseded by `@dnd-kit`; zero imports |
| `swiper` | Zero imports anywhere |
| `uuid` | Code uses `crypto.randomUUID()`; also listed in vite optimizeDeps but uninstalled |

**myk9q (2 unused devDependencies):**

| Dependency | Reason |
|-----------|--------|
| `pdfjs-dist` | Not imported in src/ |
| `puppeteer` | Not imported in src/ |

**Note:** `firebase` in myk9show is technically imported (FCMService.ts) but may be dead code since push notifications aren't active. `sharp` in myk9q is a build-time image tool. `react-router-dom` in myk9q is a devDependency that should be a regular dependency.

**All shared packages have no unused dependencies.**

Severity: low | Effort: quick-win (5 min)

---

### 6. TO-DOS.md Staleness

**Root TO-DOS.md:** Says "No outstanding items. All 32 oversized files have been refactored." -- Accurate for tracked items.

**myk9q TO-DOS.md:** All items marked COMPLETE. No stale references. Contains useful historical record of:
- React CVE patches
- Scoresheet refactoring (43% reduction)
- Production readiness audit (all critical/high items fixed)
- UKC Nosework module conversion
- 20+ feature implementations

**Previous stale items (from 2026-02-12 audit) have been resolved:**
- Deleted file references: fixed (files were deleted in schema-blocked type mismatch work)
- Missing @ts-nocheck tracking: resolved (all @ts-nocheck files removed)
- Count mismatches: resolved

Severity: resolved | No action needed

---

## Recommended Actions

### Quick Wins (5-10 minutes)

1. **Remove 5 unused dependencies from myk9show**: `dexie-react-hooks`, `react-dnd`, `react-dnd-html5-backend`, `swiper`, `uuid`
2. **Remove `uuid` from vite.config.ts optimizeDeps.include** (already not installed)
3. **Move `react-router-dom` to dependencies** in myk9q (currently misclassified as devDependency)

### Sprint Items

1. **Refactor top 3 largest files** if they need modification: trialStore.ts (858), OfflineScoringService.ts (875), DataExportImport.ts (859)
2. **Review `any` hotspots** in enhancedLazyLoading.ts (9 occurrences) and RealUserMonitoring.ts (6)
3. **Evaluate firebase dependency** in myk9show: is FCMService actively used? If not, remove firebase + related code

### No Action Needed

- @ts-nocheck: all resolved
- @ts-ignore: 1 occurrence in test mock (acceptable)
- Console statements: only in dev-gated debug utilities
- TO-DOS staleness: all current
- Package dependencies: all shared packages clean
