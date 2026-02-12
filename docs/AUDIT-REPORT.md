# Codebase Health Audit Report
Generated: 2026-02-12

## Summary

| Category | Count | Notes |
|----------|-------|-------|
| @ts-nocheck files | 29 | All in myk9show |
| @ts-ignore comments | 1 | In test file only |
| Explicit `any` types | 84 (source) / 483 (total incl. tests) | `: any` = 79, `as any` = 404 across all files |
| Console statements (app source) | 7 | Plus 87 in debug utilities |
| Files over 400 lines | 49 | 15 already tracked in TO-DOS.md |
| Unused dependencies | 13 | 11 safe to remove, 1 move to devDeps, 1 verify |
| Stale TO-DOS items | 4 | 1 deleted file, 2 missing files, 1 count mismatch |

---

## Findings by Category

### 1. TypeScript Escape Hatches

**@ts-nocheck (29 files)** -- all in `apps/myk9show/`

| Group | Files | Tracked in TO-DOS? |
|-------|-------|-------------------|
| RBAC services | PermissionChecker.ts, RoleManager.ts, AuditLogger.ts | Yes |
| Mapper services | showManagementMappers.ts, judgeMappers.ts, healthMappers.ts, templateMappers.ts, classMappers.ts, registrationMappers.ts | Yes |
| Exhibitor service | exhibitorService.ts | Yes |
| Zustand/service generics | showRegistrationStore.ts, LoadTestService.ts, OptimisticUIService.ts, batchOperations.ts | Yes |
| Entry management | useEntryManagementActions.ts, useEntryManagementData.ts, EntryManagementPage.tsx, MoveUpRequestsTab.tsx, ScratchManagementTab.tsx | Yes |
| Waitlist management | useWaitlistManagementData.ts, ShowClassSelection.tsx, ClassStatsCards.tsx | Yes |
| Waitlist (untracked) | **WaitlistActionDialog.tsx, WaitlistTable.tsx** | **NOT tracked** |
| Day-of operations | DayOfEntryDialog.tsx, ScratchDialog.tsx, MoveUpDialog.tsx, useDayOfOperationsData.ts | Yes |
| Subscription | SubscriptionManager.tsx | Yes |

**@ts-ignore (1 file)** -- `apps/myk9q/src/services/syncManager.test.ts:37` (test file, acceptable)

Severity: moderate | Effort: sprint-task per group

---

### 2. `any` Type Hotspots

Top 10 directories by `any` count (excluding test files):

| Rank | Directory | Count | Primary Files |
|------|-----------|-------|---------------|
| 1 | `myk9show/src/services/performance/` | 12 | RealUserMonitoring.ts (8), PerformanceBudgets.ts (4) |
| 2 | `myk9show/src/utils/` | 10 | enhancedLazyLoading.ts (9) |
| 3 | `myk9show/src/hooks/optimized/` | 9 | useSimplifiedHooks.ts (5), useMemoryLeakDetection.ts (3) |
| 4 | `myk9q/scripts/` | 7 | Various debug scripts |
| 5 | `myk9show/src/hooks/` | 5 | usePerformanceOptimization.ts (5) |
| 6 | `myk9q/supabase/functions/` | 5 | send-push-notification (5) |
| 7 | `myk9show/src/services/realtime/` | 4 | subscriptionManager.ts, RealtimeScoringService.ts |
| 8 | `myk9show/src/services/rbac/` | 4 | RoleManager.ts (3) |
| 9 | `myk9show/src/services/sync/` | 3 | backgroundSyncService.ts |
| 10 | `myk9show/src/services/database/` | 6 | migrations.ts (3), searchQueries.ts (2), dogQueries.ts (1) |

**Total: 84 occurrences in source, 42 files.** Most are justified for browser API access (performance.memory, navigator.connection) and dynamic imports.

Severity: low | Effort: sprint-task

---

### 3. Console Statements

| Category | Count | Action |
|----------|-------|--------|
| Scripts (`scripts/`) | 120 | OK to keep |
| Logger infrastructure (LoggingService.ts, logger.ts) | 9 | OK to keep |
| Documentation/JSDoc examples | 14 | OK to keep |
| Supabase Edge Functions | 116 | OK to keep (server-side) |
| Test files | ~1,074 | OK to keep |
| Debug utilities (entryDebug.ts, testDatabaseConnections.ts) | 87 | Review: gate behind dev-only |
| **Application source** | **7** | **Should use logger** |

**Application source console statements requiring action:**

| File | Line | Type | Assessment |
|------|------|------|------------|
| `myk9show/src/hooks/animations/usePageTransition.ts` | 255 | console.log | Leftover debugging -- logs every route prefetch |
| `myk9show/src/services/sync/syncService.ts` | 28 | console.debug | Deprecated service warning |
| `myk9show/src/services/sync/syncService.ts` | 43 | console.debug | Deprecated service warning |
| `myk9show/src/services/sync/syncService.ts` | 48 | console.debug | Deprecated service warning |
| `myk9show/src/services/notifications/FCMService.ts` | 352 | console.debug | Error boundary (already imports logger) |
| `myk9show/src/services/monitoring/errorTracking.ts` | 77 | console.info | Logger infra bootstrap |
| `myk9show/src/services/monitoring/errorTracking.ts` | 245 | console.info | Logger infra queue processing |

Severity: low | Effort: quick-win (5 min fix)

---

### 4. Large Files (>400 lines)

**NEW files not tracked in TO-DOS.md** (over 400 lines, not in refactoring backlog):

| File | Lines | Category |
|------|-------|----------|
| `myk9q/supabase/functions/ask-myk9q/index.ts` | 1,210 | Edge function (different refactoring approach) |
| `myk9q/src/pages/EntryList/EntryList.tsx` | 1,070 | Production page component |
| `myk9show/src/services/database/queries/healthQueries.ts` | 1,046 | Database queries |
| `myk9show/src/services/database/queries/dayOfOperationsQueries.ts` | 1,026 | Database queries |
| `myk9show/src/services/deployment/ProductionMonitoringService.ts` | 1,006 | Service |
| `myk9show/src/hooks/useLiveCompetition.ts` | 975 | Hook |
| `myk9show/src/services/sync/DifferentialSyncService.ts` | 962 | Service |
| `myk9show/src/services/scoring/OfflineScoringService.ts` | 948 | Service |
| `myk9q/src/pages/Stats/hooks/statsDataHelpers.ts` | 947 | Data helpers |
| `myk9show/src/hooks/usePerformanceOptimization.ts` | 938 | Hook |
| `myk9show/src/services/competition/collaborativeJudging.ts` | 931 | Service |
| `myk9show/src/services/sync/offlineManager.ts` | 920 | Service |
| `myk9show/src/services/competition/presenceService.ts` | 914 | Service |
| `myk9show/src/services/competition/resultsBroadcaster.ts` | 911 | Service |
| `myk9show/src/store/entryStore.ts` | 873 | Store |
| `myk9show/src/services/database/queries/searchQueries.ts` | 861 | Database queries |
| `myk9show/src/services/database/queries/entryQueries.ts` | 861 | Database queries |
| `myk9show/src/services/alerts/AlertingService.ts` | 857 | Service |
| `myk9show/src/store/searchHistoryStore.ts` | 855 | Store |
| `myk9show/src/services/deployment/DeploymentManager.ts` | 850 | Service |
| `myk9show/src/services/analytics/SyncAnalyticsService.ts` | 832 | Service |
| `myk9show/src/store/searchAnalyticsStore.ts` | 809 | Store |
| `myk9show/src/components/admin/PerformanceDashboard.tsx` | 808 | Component |
| `myk9show/src/components/users/UserDetails/UserDetailsView.tsx` | 806 | Component |
| `myk9q/src/components/dialogs/MaxTimeDialog.tsx` | 806 | Production dialog |
| `myk9show/src/components/sync/ConflictResolutionDialog.tsx` | 802 | Component |
| `myk9show/src/store/classStore.ts` | 801 | Store |
| `myk9show/src/components/secretary/BulkResultEntry.tsx` | 793 | Component |
| `myk9show/src/components/analytics/UserActivityMonitor.tsx` | 793 | Component |
| `myk9show/src/hooks/queries/useJudgeDatabase.ts` | 792 | Query hook |
| `myk9show/src/services/realtime/connectionManager.ts` | 790 | Service |
| `myk9q/src/pages/ClassList/hooks/useClassListData.ts` | 790 | Production hook |

**Already tracked in TO-DOS.md refactoring backlog: 15 files** (DataLifecycleManagement.tsx, DogDetailsMain.tsx, ShowCreationWizard.tsx, UserTable.tsx, JudgeCreationPanel.tsx, ShowDetailsEnhanced.tsx, ClassResultsTable.tsx, SyncMonitoringDashboard.tsx, OfflineDataManager.tsx, ClubDetails.tsx, AddDogPanel.tsx, PaymentStep.tsx, OfflineCheckInInterface.tsx, ClassList.tsx, AskMyK9Q.tsx). All line counts still match exactly.

Severity: moderate | Effort: sprint-task per file

---

### 5. Unused Dependencies

**Safe to remove (11):**

| App | Dependency | Reason |
|-----|-----------|--------|
| myk9show | `@playwright/mcp` | Not a runtime dependency |
| myk9show | `dexie-react-hooks` | Never imported; only `dexie` is used |
| myk9show | `dotenv` | Vite handles env vars natively |
| myk9show | `react-dnd` | Superseded by `@dnd-kit`; zero imports |
| myk9show | `react-dnd-html5-backend` | Superseded by `@dnd-kit`; zero imports |
| myk9show | `swiper` | Zero imports anywhere |
| myk9show | `uuid` | Code uses `crypto.randomUUID()` |
| myk9show | `workbox-webpack-plugin` | Project uses Vite, not Webpack |
| myk9show | `workbox-window` | Only in vite config exclusion list |
| myk9q | `ai-labs-claude-skills` | Zero imports; not a runtime dependency |
| myk9q | `comlink` | Zero imports anywhere |

**Should move to devDependencies (1):**

| App | Dependency | Reason |
|-----|-----------|--------|
| myk9q | `pdfjs-dist` | Only used in `scripts/` for rulebook parsing |

**Needs verification (1):**

| App | Dependency | Reason |
|-----|-----------|--------|
| myk9show | `tailwindcss-animate` | Used as Tailwind plugin in config, not directly imported |

**All shared packages (`@myk9/core`, `@myk9/replication`, `@myk9/supabase`, `@myk9/ui`, `@myk9/scoring`, `@myk9/scoring-ui`) have no unused dependencies.**

Severity: low | Effort: quick-win (5 min)

---

### 6. Stale TO-DOS Items

| Issue | Details | Action |
|-------|---------|--------|
| **Deleted file reference** | `apps/myk9show/src/services/templates/templateIntegrationExample.ts` no longer exists | Remove from "Fix remaining type issues" bullet |
| **Missing from tracking** | `WaitlistActionDialog.tsx` and `WaitlistTable.tsx` have @ts-nocheck but aren't in TO-DOS | Add to "Fix waitlist management query types" |
| **Inaccurate count** | Header says "28 files with @ts-nocheck" but actual count is 29 | Update to 29 |
| **Mislabeled items** | `armbandUtils.ts` and `showScopedDogStore.ts` don't have @ts-nocheck -- they have TODO comments | Clarify these are TODO items, not @ts-nocheck |

Severity: low | Effort: quick-win (5 min)

---

## Recommended Actions

### Quick Wins (can fix in ~15 minutes)

1. **Remove 11 unused dependencies** from myk9show and myk9q package.json files
2. **Move `pdfjs-dist` to devDependencies** in myk9q
3. **Replace 7 console statements** in app source with logger utility
4. **Fix 4 stale TO-DOS.md items** (deleted file ref, missing files, count)

### Sprint Items (add to TO-DOS.md)

1. **Track 2 untracked @ts-nocheck files** (WaitlistActionDialog.tsx, WaitlistTable.tsx)
2. **Consider tracking 32 new large files** over 400 lines not in refactoring backlog (prioritize production myk9q files: EntryList.tsx at 1,070 lines, MaxTimeDialog.tsx at 806 lines)
3. **Review debug utilities** (entryDebug.ts, testDatabaseConnections.ts) -- gate behind dev-only or move to scripts/

### No Action Needed

- `@ts-ignore` (1 occurrence in test file -- acceptable)
- `any` types in performance/browser API code (justified for non-standard APIs)
- Console statements in scripts, edge functions, tests, and logger infrastructure
- All 15 files in refactoring backlog still accurate -- line counts match exactly
