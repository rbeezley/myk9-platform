# TO-DOS

Items to address in future sessions.

---

---

## Implement Realtime & Sync Infrastructure (6 items) - 2026-02-11 15:14

- **Set up WebSocket/SSE realtime updates** - 3 TODOs for WebSocket/SSE setup in useRealTimeUpdates hook. **Problem:** Realtime update hook has placeholder setup code; no actual WebSocket or SSE connections are established. **Files:** `apps/myk9show/src/hooks/useRealTimeUpdates.ts:82,122,148`. **Solution:** Use Supabase Realtime channels for table change subscriptions.

- **Complete sync service implementations** - Initial sync, query builder, and background sync have placeholder logic. **Problem:** Sync infrastructure has skeleton implementations that don't actually communicate with Supabase. **Files:** `apps/myk9show/src/services/sync/InitialSyncOrchestrator.ts:234`, `apps/myk9show/src/services/sync/SmartQueryBuilder.ts:53`, `apps/myk9show/src/services/sync/backgroundSyncService.ts:104`.

---

## Extract Shared Services to Packages (3 items) - 2026-02-11 15:14

- **Move notification/voice/scoring services to shared packages** - 3 services in myk9show should be shared. **Problem:** Services used by both apps are only in myk9show, violating DRY. **Files:** `apps/myk9show/src/services/notificationSoundService.ts:5`, `apps/myk9show/src/services/voiceAnnouncementService.ts:5`, `apps/myk9show/src/services/nationalsScoring.ts:5`. **Solution:** Extract to @myk9/core or dedicated packages; nationalsScoring only when nationals needed in both apps.

---

## Address myk9q Deferred Items (3 items) - 2026-02-11 15:14

- **Remove event_statistics table guard** - Guard blocks nationals feature. **Problem:** Temporary guard prevents event_statistics operations until migration runs; blocks nationals scoring feature. Medium priority. **Files:** `apps/myk9q/src/services/replication/tables/ReplicatedEventStatisticsTable.ts:217`. **Solution:** Run event_statistics migration, then remove the guard.

- **Implement analytics integration** - Performance monitoring has no external analytics. **Problem:** Performance data is collected but not sent anywhere useful. Low priority - nice-to-have. **Files:** `apps/myk9q/src/utils/performanceMonitoring.ts:323`. **Solution:** Integrate with Google Analytics, Sentry, or similar.

---

## Refactor Additional Large Files (32 files, 790-1210 lines) - 2026-02-12

Priority files not yet tracked in the refactoring backlog. See `docs/AUDIT-REPORT.md` section 4 for the full list.
