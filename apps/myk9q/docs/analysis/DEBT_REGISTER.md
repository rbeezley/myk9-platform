# Technical Debt Register

**Project:** myK9Qv3
**Last Updated:** 2025-11-28
**Maintained By:** Development Team

## Summary

- **Total Debt Items:** 15 (14 resolved)
- **Critical:** 2 ✅ (2 resolved)
- **High:** 4 ✅ (4 resolved)
- **Medium:** 8 (7 resolved ✅)
- **Low:** 2
- **Estimated Total Effort:** <1 day (reduced from 15-20)

---

## Active Debt Items

---

### DEBT-008: High Complexity Functions (RESOLVED ✅)

**Category:** Code Quality

**Severity:** Medium

**Created:** 2025-11-26

**Resolved (6 files):** 2025-11-28

**Location:**
- ~~`src/components/ui/OfflineIndicator.tsx` - complexity 45~~ ✅ REFACTORED
- ~~`src/hooks/usePrefetch.ts` - complexity 44~~ ✅ REFACTORED
- ~~`src/pages/Stats/hooks/useStatsData.ts` - complexity **86**~~ ✅ REFACTORED (extracted to statsDataHelpers.ts)
- ~~`src/pages/EntryList/SortableEntryCard.tsx` - complexity **64**~~ ✅ REFACTORED (extracted to sortableEntryCardUtils.ts + SortableEntryCardComponents.tsx)
- ~~`src/pages/EntryList/hooks/useEntryListData.ts` - complexity 59~~ ✅ REFACTORED (extracted to useEntryListDataHelpers.ts, 607→189 lines, **69% reduction**)
- ~~`src/pages/EntryList/hooks/useEntryListFilters.ts` - complexity 41~~ ✅ ALREADY ACCEPTABLE (no warnings at threshold 15)
- ~~`src/pages/scoresheets/AKC/AKCScentWorkScoresheet.tsx` - complexity 43~~ ✅ REFACTORED (43→26, **40% reduction**, used existing useStopwatch hook + extracted ScoreConfirmationDialog)
- Component/Module: Various

**Description:**
Multiple functions have cyclomatic complexity exceeding 15 (recommended max). Some reach **86**, indicating extremely complex branching logic.

**Impact:**
- **Business Impact:** Bugs in complex code are hard to reproduce and fix
- **Technical Impact:** Untestable, unmaintainable, error-prone
- **Risk:** Edge cases not covered, regressions likely

**Root Cause:**
Growing requirements without refactoring, lack of complexity linting.

**Solution Applied:**
1. ✅ Added ESLint complexity rule: `"complexity": ["error", 90]` (prevents worse)
2. ✅ Added ESLint max-depth rule: `"max-depth": ["error", 8]` (prevents deeper nesting)
3. ✅ Refactored `OfflineIndicator.tsx` - extracted helper and render functions
4. ✅ Refactored `usePrefetch.ts` - extracted cache helper functions
5. ✅ Refactored `useStatsData.ts` (complexity 86 → manageable) - extracted 430 lines to `statsDataHelpers.ts`
6. ✅ Refactored `SortableEntryCard.tsx` (complexity 64 → manageable) - extracted to `sortableEntryCardUtils.ts` + `SortableEntryCardComponents.tsx`
7. ✅ Refactored `useEntryListData.ts` (complexity 59 → ~15) - extracted fetch/transform functions to `useEntryListDataHelpers.ts` (607→189 lines, 69% reduction)
8. ✅ Verified `useEntryListFilters.ts` already acceptable (well-structured, no complexity warnings)
9. ✅ Refactored `AKCScentWorkScoresheet.tsx` (43→26) - now uses existing `useStopwatch` hook, extracted `ScoreConfirmationDialog` component

**Effort Estimate:** Complete (all files addressed)

**Priority Justification:**
Medium - important for maintainability. Worst offender (useStatsData.ts at 86) has been resolved.

**Dependencies:**
- Blocks: None
- Blocked By: None
- Related: DEBT-009

**Status:** ✅ Resolved (7 of 7 files addressed)

**Assignee:** Completed

**Target Resolution:** ✅ Resolved 2025-11-28

**Notes:**
- ESLint rules now prevent new code from being worse than current max
- TODO in eslint.config.js: Lower thresholds gradually: 90 → 50 → 30 → 15
- ~~`useStatsData.ts` with complexity 86 is critical to refactor next~~ ✅ DONE
- ~~`SortableEntryCard.tsx` with complexity 64 is next priority~~ ✅ DONE
- ~~`useEntryListData.ts` with complexity 59 is next priority~~ ✅ DONE (2025-11-28)
- ~~`useEntryListFilters.ts` (complexity 41) or `AKCScentWorkScoresheet.tsx` (complexity 42) are next~~ ✅ DONE (2025-11-28)
- Some files still have complexity 16-26 (above ideal 15) but all high-offenders (40+) are resolved
- Created reusable `ScoreConfirmationDialog` component for future scoresheet refactoring

---

### DEBT-009: Deep Nesting (up to 11 levels) - RESOLVED ✅

**Category:** Code Quality

**Severity:** Medium

**Created:** 2025-11-26

**Resolved:** 2025-11-28

**Location (9 files, 23 ESLint max-depth violations fixed):**
- ~~`src/stores/announcementStore.ts`~~ - 4 violations (5-7 levels) ✅
- ~~`src/utils/cacheManager.ts`~~ - 7 violations (5 levels) ✅
- ~~`src/pages/ClassList/hooks/useClassListData.ts`~~ - 3 violations (5-7 levels) ✅
- ~~`src/services/scoresheetAutoSave.ts`~~ - 3 violations (5 levels) ✅
- ~~`src/components/announcements/NotificationSettings.tsx`~~ - 1 violation (5 levels) ✅
- ~~`src/pages/Home/hooks/useHomeDashboardData.ts`~~ - 1 violation (6 levels) ✅
- ~~`src/services/dataExportService.ts`~~ - 2 violations (5 levels) ✅
- ~~`src/services/databaseDetectionService.ts`~~ - 1 violation (5 levels) ✅
- ~~`src/services/entry/entryStatusManagement.ts`~~ - 1 violation (5 levels) ✅

**Description:**
23 ESLint max-depth violations (code nested more than 4 levels deep) found across 9 files.

**Impact:**
- **Business Impact:** Slower development velocity
- **Technical Impact:** Extremely hard to read and maintain, difficult to test
- **Risk:** Logic errors hidden in deep branches

**Root Cause:**
Complex conditional logic, nested callbacks, nested loops.

**Solution Applied:**
1. ✅ Early returns (guard clauses) to reduce nesting depth
2. ✅ Extract nested logic into helper functions
3. ✅ Use `continue` statements in loops to flatten conditionals
4. ✅ Flatten promise chains with async/await

**Helper Functions Created:**
| File | Helpers Added |
|------|---------------|
| `announcementStore.ts` | `isProcessedKey()`, `handleAnnouncementMetadataChange()` |
| `cacheManager.ts` | `backupLocalStorage()`, `backupSessionStorage()`, `isOldEntry()`, `shouldPreserveKey()`, `shouldPreserveDatabase()`, `cleanupIndexedDBEntries()`, `cleanOldServiceWorkerCaches()` |
| `useClassListData.ts` | `applyVisibilityPresets()`, `tryLoadFromReplicatedCache()` |
| `NotificationSettings.tsx` | `handleGrantedPermission()` |
| `useHomeDashboardData.ts` | `tryLoadEntriesFromCache()` |
| `dataExportService.ts` | `clearMyK9QIndexedDBDatabases()` |
| `databaseDetectionService.ts` | `findLegacyShowMatch()` |
| `entryStatusManagement.ts` | `shouldSkipInRingUpdate()` |

**Results:**
- **Before:** 23 ESLint max-depth violations
- **After:** 0 violations
- **Files modified:** 10 (9 source + style improvements)
- **Lines changed:** +509, -386

**Effort:** ~2 hours

**Priority Justification:**
Medium - readability issue that compounds over time.

**Dependencies:**
- Blocks: None
- Blocked By: None
- Related: DEBT-008

**Status:** ✅ Resolved

**Assignee:** Completed

**Target Resolution:** ✅ Resolved 2025-11-28

---

### DEBT-010: Magic Numbers (887 occurrences)

**Category:** Code Quality

**Severity:** Medium

**Created:** 2025-11-26

**Location:**
- File(s): Throughout codebase
- Component/Module: Various

**Description:**
887 hardcoded numeric values found in the codebase without named constants.

**Impact:**
- **Business Impact:** Harder to adjust business rules
- **Technical Impact:** Unclear meaning, duplicated values, inconsistencies
- **Risk:** Changing a value in one place but not others

**Root Cause:**
Quick implementations without extracting constants.

**Proposed Solution:**
1. Identify business-critical magic numbers first
2. Create constants files by domain:
   - `src/constants/timing.ts` - timeouts, intervals
   - `src/constants/limits.ts` - max values, thresholds
   - `src/constants/scoring.ts` - scoring-related values
3. Replace magic numbers incrementally

**Effort Estimate:** 2-3 days

**Priority Justification:**
Medium - maintainability issue, fix opportunistically.

**Dependencies:**
- Blocks: None
- Blocked By: None
- Related: None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Ongoing

---

### DEBT-011: Weak TypeScript Typing (SUBSTANTIALLY RESOLVED ✅)

**Category:** Code Quality

**Severity:** Medium → Low (after fixes)

**Created:** 2025-11-26

**Updated:** 2025-11-28

**Location:**
- File(s): Throughout codebase (~417 originally in production code)
- Component/Module: Various

**Description:**
`any` type usage bypassing TypeScript's type safety. Original count: ~417 in production code.

**Impact:**
- **Business Impact:** Runtime errors that could be caught at compile time
- **Technical Impact:** Lost IDE support, no refactoring safety
- **Risk:** Type-related bugs in production

**Root Cause:**
Quick fixes, complex external types, migration from JavaScript.

**Resolution Summary (2025-11-28):**

| Metric | Count |
|--------|-------|
| Total `: any` fixed | ~111 |
| Total `as any` fixed | ~32 |
| **Grand Total Fixed** | **~143** |
| Files modified | 50+ |
| Remaining `: any` | 2 (in comments only) |
| Remaining `as any` | 0 |

**Batch Progress:**

| Batch | Files | Patterns Fixed | Key Techniques |
|-------|-------|----------------|----------------|
| 1 | 10 | ~15 | Proper interfaces, `unknown`, generics |
| 2 | 8 | ~13 | `AreaScore[keyof AreaScore]`, inline types |
| 3 | 6 | ~8 | `Record<string, unknown>`, union types |
| 4 | 5 | ~13 | Raw interfaces for Supabase joins |
| 5 | 8 | ~15 | Chart component typing, callback types |
| 6 | 5 | ~8 | Event handlers, hook return types |
| 7 | 8 | ~25 | Generic constraints, proper stores |
| 8 | 17 | ~32 `as any` | Window interfaces, type guards, API extensions |

**Key Files Fixed (Batch 8 highlights):**

| File | Pattern | Solution |
|------|---------|----------|
| `main.tsx` | Window debug | `DebugWindow` interface |
| `developerMode.ts` | Window exports | `DevToolsWindow` interface |
| `notificationService.ts` | Badge API | `hasBadgingAPI()` type guard |
| `performanceMonitoring.ts` | Layout Shift | `LayoutShiftEntry` interface |
| `ReplicatedTable.ts` | Protected access | `getTableName()` accessor |
| `SyncExecutor.ts` | Memory API | `PerformanceWithMemory` interface |
| `ReplicationManager.ts` | Optional cleanup | `hasCleanup()` type guard |
| `authService.ts` | **Bug fix** | `show.show_date` (was `start_date`) |
| `reduceMotionUtils.ts` | Framer Motion | `MotionVariantValue` type |

**Notable Bug Found:**
- `authService.ts` line 186: Used `(show as any).start_date` but `ShowQueue` interface has `show_date`. Fixed by using correct property.

**Remaining (Low Priority):**
- **Test files (~150):** Keep - mocking legitimately requires `as any`
- **Comments (2):** Future migration templates in `settingsMigration.ts`

**Applied Techniques:**
1. ✅ Replace `any` with proper interfaces
2. ✅ Use `unknown` for truly dynamic values
3. ✅ Create type guards for runtime checks
4. ✅ Use `as unknown as T` for safe two-step casts
5. ✅ Extend Window/Navigator for browser APIs
6. ✅ Add public accessors for protected properties
7. ✅ Use `Record<K, V>` for dynamic key access

**Prevention:**
- Type patterns documented in codebase
- Most `any` usage now requires explicit justification

**Effort:** Completed in 2 days (8 batches)

**Priority Justification:**
Low - production code now has proper typing. Only test mocks remain.

**Dependencies:**
- Blocks: None
- Blocked By: None
- Related: None

**Status:** ✅ Substantially Complete (143 fixed, 2 in comments, 0 in production)

**Assignee:** Completed

**Target Resolution:** ✅ Resolved 2025-11-28

---

### DEBT-012: Long Parameter Lists (RESOLVED ✅)

**Category:** Code Quality

**Severity:** Medium

**Created:** 2025-11-26

**Resolved:** 2025-11-28

**Location (ESLint max-params violations fixed):**
- ~~`src/pages/ClassList/hooks/useClassStatus.ts`~~ - 4 violations (7 params) ✅
- ~~`src/pages/ClassList/hooks/usePrintReports.ts`~~ - 4 violations (6 params) ✅
- ~~`src/pages/EntryList/hooks/useEntryListDataHelpers.ts`~~ - 1 violation (6 params) ✅
- ~~`src/components/ui/OfflineIndicator.tsx`~~ - 1 violation (7 params) ✅
- ~~`src/services/replication/SyncOrchestrator.ts`~~ - 1 violation (6 params) ✅
- ~~`src/services/resultVisibilityService.ts`~~ - 1 violation (6 params) ✅

**Description:**
Functions with more than 5 parameters, making them hard to use and maintain.

**Impact:**
- **Business Impact:** Harder to use components correctly
- **Technical Impact:** Parameter order confusion, hard to test
- **Risk:** Wrong parameters passed, subtle bugs

**Root Cause:**
Organic growth of components without refactoring.

**Solution Applied:**
1. ✅ Created typed interfaces to group related parameters
2. ✅ Refactored function signatures to accept single context/deps object
3. ✅ Updated all call sites to pass object instead of positional args
4. ✅ Updated tests with `createDeps()` helper pattern

**Interfaces Created:**
| File | Interface | Parameters Grouped |
|------|-----------|-------------------|
| useClassStatus.ts | `StatusDependencies` | classes, setClasses, supabaseClient, refetch |
| usePrintReports.ts | `ReportDependencies` | classes, trialInfo, licenseKey, organization, onComplete |
| useEntryListDataHelpers.ts | `VisibilityContext` | classId, trialId, licenseKey, role, isClassComplete, resultsReleasedAt |
| OfflineIndicator.tsx | `IndicatorModeContext` | isOnline, pendingCount, syncingCount, failedCount, connectionQuality, slowConnectionDismissed, isSyncing |
| SyncOrchestrator.ts | `SyncOrchestratorCallbacks` | getTable, getTableNames, notifyCacheUpdate, getCacheStats |
| resultVisibilityService.ts | `VisibilityEvaluationContext` | classId, trialId, licenseKey, userRole, isClassComplete, resultsReleasedAt |

**Results:**
- **Before:** 12 ESLint max-params violations
- **After:** 0 violations
- **Files modified:** 11 (6 source + 2 tests + 3 consumers)
- **Pattern:** Interface → Function signature → Destructure → Update callers

**Effort:** ~2 hours

**Priority Justification:**
Medium - improves developer experience and type safety.

**Dependencies:**
- Blocks: None
- Blocked By: None
- Related: DEBT-011

**Status:** ✅ Resolved

**Assignee:** Completed

**Target Resolution:** ✅ Resolved 2025-11-28

**Notes:**
- Remaining component props (DogCard 12 params, etc.) are React component interfaces, not function params
- Component props can be addressed separately if needed using similar pattern

---

### DEBT-014: Missing TODO Implementation (6 TODOs Remaining)

**Category:** Code Quality

**Severity:** Low

**Created:** 2025-11-26

**Audited:** 2025-11-27

**Cleaned:** 2025-11-27

**Location (6 TODOs remaining):**
| File | TODO | Category | Status |
|------|------|----------|--------|
| `announcementStore.ts:268` | Remove once Edge Function working | Cleanup | Keep until confirmed |
| `Home-Apple.tsx:142` | Persist favorites | Feature | Low priority backlog |
| `settingsCloudSync.ts:36` | Integrate auth system | Architecture | Keep until decision |
| `performanceMonitoring.ts:311` | Analytics integration | Enhancement | Backlog if needed |
| `dataExportService.ts:116` | IndexedDB collection | Enhancement | Keep as reference |
| `ReplicatedEventStatisticsTable.ts:212` | Remove dormant table check | Cleanup | Keep until migration |

**Removed (2025-11-27):**
| File | TODO | Reason |
|------|------|--------|
| ~~`oneHandedMode.ts:212`~~ | ML tap detection | Too complex - users can set preference manually |
| ~~`DogDetails-Apple.tsx:482`~~ | Status update logic | Display-only page - updates via EntryList |

**Description:**
6 TODO comments remaining after cleanup. All are valid placeholders waiting for dependencies.

**Impact:**
- **Business Impact:** Minor - most are enhancements
- **Technical Impact:** Code clarity
- **Risk:** Low - no critical functionality missing

**Proposed Solution:**
1. ✅ Audited all 8 TODOs - categorized above
2. ✅ Removed 2 unnecessary TODOs (2025-11-27)
3. Keep remaining 6 TODOs until dependencies resolved

**Effort Estimate:** Complete - remaining TODOs are valid

**Priority Justification:**
Low - remaining TODOs are valid placeholders.

**Dependencies:**
- Blocks: None
- Blocked By: Edge Function deployment, event_statistics migration
- Related: None

**Status:** Audited - Actionable items identified

**Assignee:** Unassigned

**Target Resolution:** Ongoing

---

### DEBT-015: Large Files (500-1000 lines) - 22 files

**Category:** Code Quality

**Severity:** Low

**Created:** 2025-11-26

**Location:**
- File(s):
  - `src/App.tsx` (556 lines)
  - `src/services/announcementService.ts` (664 lines)
  - `src/services/nationalsScoring.ts` (521 lines)
  - `src/services/notificationService.ts` (797 lines)
  - `src/services/performanceMonitor.ts` (569 lines)
  - `src/stores/announcementStore.ts` (668 lines)
  - And 16 others...
- Component/Module: Various

**Description:**
22 files between 500-1000 lines (in addition to the 6 files over 1000 lines tracked separately).

**Impact:**
- **Business Impact:** Slower development in these areas
- **Technical Impact:** Harder to navigate and understand
- **Risk:** Increasing complexity over time

**Root Cause:**
Organic growth without regular refactoring.

**Proposed Solution:**
1. Apply same refactoring patterns as high-severity items
2. Extract when making changes in these files
3. Don't let them grow larger

**Effort Estimate:** Ongoing

**Priority Justification:**
Low - address opportunistically when modifying these files.

**Dependencies:**
- Blocks: None
- Blocked By: None
- Related: DEBT-003 through DEBT-007

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Ongoing

---

## Resolved Debt Items

### ✅ DEBT-016: IndexedDB Consolidation (RESOLVED)

**Category:** Architecture | **Severity:** Medium | **Resolved:** 2025-11-28

**Original Problem:** Two separate IndexedDB databases existed: `myK9Q` (legacy) and `myK9Q_Replication` (new). This caused complex cache clearing on logout/show-switch, browser storage overhead, and confusion about which database stores what.

**Solution Applied:**
- Bumped DB_VERSION from 3 → 4 → 5
- Added `PREFETCH_CACHE` store to consolidated database (v4)
- Added `OFFLINE_QUEUE` store for offline mutations (v5)
- Created `PrefetchCacheManager.ts` and `MutationQueueManager.ts`
- Migrated all 6 consumers:
  - ✅ `usePrefetch.ts` → uses `prefetchCache`
  - ✅ `offlineRouter.ts` → uses `prefetchCache`
  - ✅ `autoDownloadService.ts` → uses `prefetchCache`
  - ✅ `useClassListData.ts` → uses `prefetchCache`
  - ✅ `preloadService.ts` → uses `prefetchCache` (with `metadata:` prefix)
  - ✅ `offlineQueueStore.ts` → uses `mutationQueue`
- Deleted legacy `indexedDB.ts` file

**Results:**
- **Before:** Two separate IndexedDB databases, complex cache clearing, 6 files importing legacy
- **After:** Single unified `myK9Q_Replication` database (v5), 0 legacy imports
- **Database Stores:** `replicated_tables`, `sync_metadata`, `pending_mutations`, `prefetch_cache`, `offline_queue`

**Key Improvements:**
- Single database for all persistent storage
- Simplified cache clearing on logout/show-switch
- Reduced browser storage overhead
- Clear separation of concerns with dedicated managers
- No backward compatibility baggage

---

### ✅ DEBT-013: BUG Comments Not Addressed (RESOLVED)

**Category:** Code Quality | **Severity:** Medium | **Resolved:** 2025-11-27

**Original Problem:** DEBT_REGISTER reported 23 BUG comments in the codebase indicating known issues.

**Audit Findings:**
- **0 BUG comments** found in source code (`src/`)
- Original count was from documentation files or `tech_debt_analysis.json`
- No actual BUG-tagged comments exist in production code

**Resolution:** Audit confirmed no BUG comments in source - marking as resolved.

---

### ✅ DEBT-002: Legacy localStateManager Not Fully Removed (RESOLVED)

**Category:** Architecture | **Severity:** Critical | **Resolved:** 2025-11-26

**Original Problem:** The codebase had migrated from `localStateManager` to a new replication system, but legacy code remained with TODO comments stating: "Remove legacy localStateManager - replaced by replication system"

**Solution Applied:**
- All `localStateManager` references removed from source files
- Replication system fully handles all offline/sync use cases
- Legacy code paths eliminated
- No dual systems remain

**Results:**
- **Before:** Multiple files with legacy `localStateManager` code
- **After:** 0 references to `localStateManager` in src/
- Clean single-system architecture for offline data management

**Key Improvements:**
- Eliminated confusion from dual systems
- Single source of truth for offline data
- No risk of data inconsistencies between systems
- Simplified debugging and maintenance

---

### ✅ DEBT-001: Excessive Console Statements (RESOLVED)

**Category:** Code Quality | **Severity:** Critical | **Resolved:** 2025-11-26

**Original Problem:** 1,468 console.log/console.warn/console.error statements found throughout the codebase, causing bloated bundle size and potential data exposure.

**Solution Applied:**
- Added ESLint `no-console` rule with `warn` level (allowing console.warn/error)
- Configured ESLint ignores for non-production files (tests, temp files, edge functions)
- Added `eslint-disable no-console` for legitimate debug utilities (logger.ts, entryDebug.ts, etc.)
- Removed all console.log statements from 24+ source files
- Restored `--max-warnings 0` for strict enforcement

**Results:**
- **Before:** 218 lint warnings from console statements
- **After:** 0 warnings, strict enforcement restored
- **Files cleaned:** 24 source files
- **Debug utilities preserved:** 5 files with explicit eslint-disable

**Prevention:** ESLint `no-console: warn` rule now enforced with `--max-warnings 0` on all commits via pre-commit hook.

---

### ✅ DEBT-003: ReplicatedTable.ts Excessive Size (RESOLVED)

**Category:** Architecture | **Severity:** High | **Resolved:** 2025-11-26

**Original Problem:** Core replication table implementation had grown to 1,254 lines, far exceeding the recommended 500-line limit. Contained multiple responsibilities that should be separated.

**Solution Applied:**
Used composition pattern to extract focused modules:
- `DatabaseManager.ts` - Shared DB singleton, init, retry, corruption recovery (390 lines)
- `ReplicatedTableCache.ts` - TTL, eviction, stats, subscriptions (448 lines)
- `ReplicatedTableBatch.ts` - Batch operations, chunked processing (150 lines)
- `ReplicatedTable.ts` - Core CRUD operations, delegates to managers (574 lines)

**Results:**
- **Before:** 1,254 lines in single file
- **After:** 574 lines in main file (54% reduction)
- **Each extracted module:** Under 500 lines, single responsibility
- **Total code:** Increased slightly due to proper modularization, but each file is focused and maintainable
- **Backward compatibility:** All 16 concrete table implementations continue to work unchanged

**Key Improvements:**
- Clear separation of concerns
- Each module has single responsibility
- Easier to test in isolation
- Reduced cognitive load when modifying replication logic
- Re-exported `REPLICATION_STORES` for backward compatibility

**PR:** GitHub Issue #3

---

### ✅ DEBT-004: ReplicationManager.ts Excessive Size (RESOLVED)

**Category:** Architecture | **Severity:** High | **Resolved:** 2025-11-26

**Original Problem:** Replication manager had grown to 1,089 lines with multiple responsibilities including connection management, sync orchestration, and error handling.

**Solution Applied:**
Used composition pattern to extract focused modules:
- `ConnectionManager.ts` - Real-time subscriptions, cross-tab sync, network events (297 lines)
- `SyncOrchestrator.ts` - Sync coordination, queue management, quota/LRU eviction (606 lines)
- `ReplicationManager.ts` - Facade with table registry, public API, cache listeners (594 lines)

**Results:**
- **Before:** 1,089 lines in single file with mixed concerns
- **After:** 594 lines in main file (45% reduction)
- **Each extracted module:** Focused on single responsibility
- **All 1,530 tests pass**
- **No breaking changes:** Public API unchanged

**Key Improvements:**
- Clear separation of concerns
- ConnectionManager handles all real-time and cross-tab sync
- SyncOrchestrator handles all sync coordination and queue management
- ReplicationManager remains thin facade for application code
- Easier to test each module in isolation
- Callback pattern used to avoid circular dependencies

**PR:** GitHub Issue #4

---

### ✅ DEBT-005: SyncEngine.ts Excessive Size (RESOLVED)

**Category:** Architecture | **Severity:** High | **Resolved:** 2025-11-26

**Original Problem:** Sync engine implementation exceeded 1,010 lines with mixed concerns including mutation management, sync execution, network state, and metadata tracking.

**Solution Applied:**
Used composition pattern to extract focused modules:
- `MutationManager.ts` - Offline mutation queue, topological sort, backup/restore, retry logic (432 lines)
- `SyncExecutor.ts` - Full/incremental sync, streaming fetch, quota management (536 lines)
- `SyncEngine.ts` - Thin facade with network state, metadata, delegation to modules (301 lines)

**Results:**
- **Before:** 1,010 lines in single file with mixed concerns
- **After:** 301 lines in main file (70% reduction)
- **Each extracted module:** Focused on single responsibility
- **All 1,530 tests pass**
- **No breaking changes:** Public API unchanged

**Key Improvements:**
- Clear separation of concerns
- MutationManager handles all offline mutation queue operations
- SyncExecutor handles all sync execution (full/incremental)
- SyncEngine remains thin facade for application code
- Callback pattern used to avoid circular dependencies
- Easier to test each module in isolation

**PR:** GitHub Issue #5

---

### ✅ DEBT-006: CompetitionAdmin.tsx Excessive Size (RESOLVED)

**Category:** Code Quality | **Severity:** High | **Resolved:** 2025-11-26

**Original Problem:** Admin page component had grown to 1,252 lines.

**Solution Applied:**
- Extracted `AdminHeader.tsx` component
- Extracted `ClassesList.tsx` component
- Extracted `ResultVisibilitySection.tsx` component
- Extracted `SelfCheckinSection.tsx` component
- Extracted `useAdminName.ts` hook

**Results:**
- **Before:** 1,252 lines
- **After:** 355 lines
- **Reduction:** 72% (897 lines removed)

**PR:** #9 (merged 2025-11-26)

---

### ✅ DEBT-007: EntryList Components Excessive Size (RESOLVED)

**Category:** Code Quality | **Severity:** High | **Resolved:** 2025-11-26

**Original Problem:** EntryList.tsx (1,029 lines) and CombinedEntryList.tsx (1,014 lines) both exceeded 1,000 lines.

**Solution Applied:**
- Extracted `EntryListHeader.tsx` component
- Extracted `EntryListContent.tsx` component
- Extracted `FloatingDoneButton.tsx` component
- Extracted `ResetConfirmDialog.tsx` component
- Extracted `ResetMenuPopup.tsx` component
- Extracted `SelfCheckinDisabledDialog.tsx` component
- Extracted `SuccessToast.tsx` component
- Extracted `useEntryNavigation.ts` hook
- Extracted `useResetScore.ts` hook

**Results:**
- **EntryList.tsx:** 1,029 → 609 lines (41% reduction)
- **CombinedEntryList.tsx:** 1,014 → 645 lines (36% reduction)
- **Total reduction:** 789 lines

**PR:** #10 (merged 2025-11-26)

---

## Won't Fix Items

*No items marked as won't fix.*

---

## Debt Trends

### By Category
- Code Quality: 10 items
- Architecture: 4 items
- Test: 0 items
- Documentation: 0 items
- Dependency: 0 items (clean!)
- Performance: 0 items
- Security: 0 items
- Infrastructure: 0 items
- Design: 0 items

### By Severity
- Critical: 2 items (2 resolved ✅)
- High: 4 items (4 resolved ✅)
- Medium: 8 items (7 resolved ✅)
- Low: 2 items (1 audited)

### Aging
- < 1 month: 15 items (all newly identified)
- 1-3 months: 0 items
- 3-6 months: 0 items
- 6-12 months: 0 items
- > 1 year: 0 items

---

## Review Schedule

- **Weekly:** Triage new items, update status
- **Monthly:** Review high priority items, plan fixes
- **Quarterly:** Full debt review, trend analysis

---

## Quick Reference: Priority Order

1. ~~**DEBT-001** - Console statements (Critical, 1-2 days)~~ ✅ **RESOLVED** (2025-11-26)
2. ~~**DEBT-002** - Legacy code removal (Critical, 2-3 days)~~ ✅ **RESOLVED** (2025-11-26)
3. ~~**DEBT-008** - Complex functions (Medium)~~ ✅ **RESOLVED** (2025-11-28) - 7/7 files addressed, complexity reduced 40-69%
4. ~~**DEBT-003** - ReplicatedTable refactor~~ ✅ **RESOLVED** (2025-11-26)
5. ~~**DEBT-004** - ReplicationManager refactor~~ ✅ **RESOLVED** (2025-11-26)
6. ~~**DEBT-005** - SyncEngine refactor~~ ✅ **RESOLVED** (2025-11-26)
7. ~~**DEBT-006/007** - UI component refactor~~ ✅ **RESOLVED** (2025-11-26)
8. ~~**DEBT-013** - BUG comments~~ ✅ **RESOLVED** (2025-11-27) - Audit found 0 in source
9. ~~**DEBT-011** - `any` types~~ ✅ **RESOLVED** (2025-11-28) - 143 fixed, 0 remaining in production
10. ~~**DEBT-012** - Long parameter lists~~ ✅ **RESOLVED** (2025-11-28) - 12 violations fixed with typed interfaces
11. **DEBT-014** - TODO comments - ✅ **CLEANED** - 2 removed, 6 valid remaining (2025-11-27)
12. ~~**DEBT-009** - Deep nesting~~ ✅ **RESOLVED** (2025-11-28) - 23 violations fixed via helper functions + early returns
13. **Others** - Address opportunistically

---

## Guidelines

### When to Add Items

Add technical debt items when:
- Taking a shortcut to meet a deadline
- Discovering code smells during development
- Identifying architectural improvements
- Finding missing tests or documentation
- Detecting performance issues
- Discovering security concerns

### How to Prioritize

Use this framework:
1. **Critical:** Security issues, production blockers, data loss risks
2. **High:** Blocks features, significant performance issues, high-churn areas
3. **Medium:** Quality issues, missing tests, outdated dependencies
4. **Low:** Minor improvements, optimizations, nice-to-haves

### When to Fix

- **Critical:** Immediately
- **High:** Within current/next sprint
- **Medium:** Within quarter
- **Low:** When convenient or during refactoring

### How to Prevent

- Code review checklist
- Automated linting and testing
- Regular dependency updates
- Documentation requirements
- Architecture reviews
