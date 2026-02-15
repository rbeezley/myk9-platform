# TO-DOS

Items to address in future sessions.

---

## Sprint Items (from 2026-02-15 audit)

### Large File Refactoring

Top 3 source files over 800 lines — refactor when next modified:

- [ ] `apps/myk9show/src/services/scoring/OfflineScoringService.ts` (875 lines)
- [ ] `apps/myk9show/src/services/data-lifecycle/DataExportImport.ts` (859 lines)
- [ ] `apps/myk9show/src/store/trialStore.ts` (858 lines)

### `any` Type Hotspots

Review and type-narrow these files with highest `any` density:

- [ ] `apps/myk9show/src/utils/enhancedLazyLoading.ts` (9 occurrences)
- [ ] `apps/myk9show/src/services/performance/RealUserMonitoring.ts` (6 occurrences — browser perf APIs)
- [ ] `apps/myk9show/src/services/performance/PerformanceBudgets.ts` (4 occurrences)

### Dead Dependency Evaluation

- [ ] Evaluate `firebase` in myk9show — is FCMService.ts actively used? If push notifications aren't live, remove firebase + related code
