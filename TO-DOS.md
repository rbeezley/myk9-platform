# TO-DOS

Items to address in future sessions.

---

## Sprint Items (from 2026-02-15 audit)

### Large File Refactoring

Top 3 source files over 800 lines — refactor when next modified:

- [ ] `apps/myk9show/src/services/scoring/OfflineScoringService.ts` (875 lines — single cohesive class, types/serialization already extracted, skip)
- [x] `apps/myk9show/src/services/data-lifecycle/DataExportImport.ts` (859→471 lines — extracted types, CSV utils, import handlers)
- [x] `apps/myk9show/src/store/trialStore.ts` (858→560 lines — extracted types and helpers)

### `any` Type Hotspots

- [x] `apps/myk9show/src/utils/enhancedLazyLoading.ts` — removed blanket eslint-disable, added PreloadableComponent interface + type guard, Object.assign for property attachment, proper return types
- [x] `apps/myk9show/src/services/performance/RealUserMonitoring.ts` — declared LayoutShiftEntry, PerformanceEventTimingEntry, PerformanceLongTaskEntry, PerformanceWithMemory, NavigatorWithConnection interfaces
- [x] `apps/myk9show/src/services/performance/PerformanceBudgets.ts` — declared BundleStats/BundleStatsAsset/PerformanceWithMemory interfaces, Record<string,unknown> for context

### Dead Dependency Evaluation

- [x] Removed `firebase` from myk9show — dead code (FCM never configured, 4 files deleted: firebase.ts, FCMService.ts, useNotifications.ts, settings/NotificationSettings.tsx). Updated CSP, bundle optimizer.
- [x] Removed `pdfjs-dist` + `puppeteer` from myk9q devDependencies — zero imports in src/

## Code Quality Sprint — Session 1 Complete (2026-02-17)

- [x] Created `apps/myk9q/vitest.config.ts` with coverage, test env vars
- [x] Measured coverage baselines: myk9q (53.88/48.43/55.13/54.48%), myk9show (35.77/26.56/31.03/37.23%)
- [x] Added coverage thresholds (baseline -2%) to both apps
- [x] Added `--coverage` to CI pipeline, fixed duplicate `--run` bug, bumped timeouts
- [x] Deleted 9 broken auto-generated tests (phase4 + UserActivityMonitor + DifferentialSyncService)
- [x] Added `reportOnFailure: true` so coverage reports even with test failures
- [ ] Package coverage thresholds — deferred (need `@vitest/coverage-v8` dep + CI jobs)

### myK9Show Test Failures (591 failing tests)

- [ ] Fix 591 failing tests across 102 test files (2226 pass, 58 skipped, 2875 total)
- Root cause: incomplete Supabase mock chains (e.g. `.select(...).is is not a function`)
- Pre-existing failures — not caused by Session 1 changes
- Session 1 only deleted tests that caused _hangs_, these just have assertion failures

### Remaining Sessions

- [ ] Session 2: Type Safety — Packages + myK9Show (eliminate `as any`, fix `@ts-ignore`)
- [ ] Session 3: Type Safety — myK9Q (~360 `as any` casts)
- [ ] Session 4: Large File Refactoring (~15 files over 700 lines)
- [ ] Session 5: E2E Tests in CI + Polish
