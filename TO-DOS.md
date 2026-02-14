# TO-DOS

Items to address in future sessions.

---

## Refactor Large myK9Show Files (26 files, 790-1046 lines) - 2026-02-13

6 of 32 files resolved (all myK9Q). 26 remain in myK9Show. See `docs/AUDIT-REPORT.md` section 4 for context.

**Services (12 files):**
- `services/database/queries/healthQueries.ts` (1,046)
- `services/database/queries/dayOfOperationsQueries.ts` (1,032)
- `services/deployment/ProductionMonitoringService.ts` (1,006)
- `services/sync/DifferentialSyncService.ts` (962)
- `services/scoring/OfflineScoringService.ts` (948)
- `services/competition/collaborativeJudging.ts` (931)
- `services/sync/offlineManager.ts` (920)
- `services/competition/presenceService.ts` (914)
- `services/competition/resultsBroadcaster.ts` (911)
- `services/database/queries/searchQueries.ts` (861)
- `services/database/queries/entryQueries.ts` (861)
- `services/alerts/AlertingService.ts` (857)
- `services/deployment/DeploymentManager.ts` (850)
- `services/analytics/SyncAnalyticsService.ts` (832)
- `services/realtime/connectionManager.ts` (790)

**Hooks (3 files):**
- `hooks/useLiveCompetition.ts` (975)
- `hooks/usePerformanceOptimization.ts` (938)

**Stores (4 files):**
- `store/entryStore.ts` (873)
- `store/searchHistoryStore.ts` (855)
- `store/searchAnalyticsStore.ts` (809)
- `store/classStore.ts` (801)

**Components (5 files):**
- `components/users/UserDetails/UserDetailsView.tsx` (830)
- `components/admin/PerformanceDashboard.tsx` (808)
- `components/sync/ConflictResolutionDialog.tsx` (805)
- `components/secretary/BulkResultEntry.tsx` (796)
- `components/analytics/UserActivityMonitor.tsx` (793)
