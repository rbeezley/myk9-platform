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
