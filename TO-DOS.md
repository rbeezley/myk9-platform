# TO-DOS

Items to address in future sessions.

---

---

## Complete Incomplete Features (45+ items) - 2026-02-11 15:14

- **Complete secretary tools** - Copy/export, save logic, and column configuration missing. **Problem:** Secretary workflow tools partially implemented. **Files:** `apps/myk9show/src/pages/secretary/ClassCreationPage.tsx:162,171`, `apps/myk9show/src/pages/admin/TemplateEditorPageMinimal.tsx:68`, `apps/myk9show/src/components/secretary/ResultsGrid.tsx:75-76`.

- **Complete data lifecycle operations** - Restoration, archiving, and import logic missing. **Problem:** Data lifecycle services have shell implementations without actual business logic. **Files:** `apps/myk9show/src/services/data-lifecycle/OrphanedRecordsCleaner.ts:491`, `apps/myk9show/src/services/data-lifecycle/ArchiveScheduler.ts:159,217`, `apps/myk9show/src/services/data-lifecycle/DataExportImport.ts:662`.

- **Complete exhibitor features** - Email/share results and cart expiry handling missing. **Problem:** Exhibitor-facing features partially implemented. **Files:** `apps/myk9show/src/components/exhibitor/LiveResults.tsx:344,354`, `apps/myk9show/src/components/cart/CartPreviewPanel.tsx:51`.

- **Complete dialog/form implementations** - 5 dialog components missing form state management, multi-select, and confirmation flows. **Problem:** Form dialogs render but don't handle state changes or submissions. **Files:** `apps/myk9show/src/components/dogs/DogDetails/TitleTracking/EditTitleDialog.tsx:13,21,25`, `apps/myk9show/src/components/dogs/DogDetails/Competitions/EditCompetitionDialog.tsx:13,21,25`, `apps/myk9show/src/components/templates/DynamicClassForm.tsx:302`, `apps/myk9show/src/components/panels/edit/JudgeQualificationPanel.tsx:155`, `apps/myk9show/src/components/offline/ReportGenerationDialog.tsx:279,293`.

- **Complete miscellaneous feature gaps** - 10 files with various missing features (conflict resolution, pagination, filtering, success handling, etc.). **Problem:** Scattered incomplete implementations across stores, hooks, and components. **Files:** `apps/myk9show/src/store/armbandStore.ts:325`, `apps/myk9show/src/hooks/useEnhancedSearch.ts:235`, `apps/myk9show/src/hooks/useUserPreferences.ts:160`, `apps/myk9show/src/hooks/useBackgroundSync.ts:121`, `apps/myk9show/src/components/clubs/ClubDetails.tsx:321`, `apps/myk9show/src/components/shows/wizard/ShowCreationWizard.tsx:754`, `apps/myk9show/src/components/users/enhanced/VirtualUserList.tsx:352`, `apps/myk9show/src/components/common/UserFriendlyErrors.tsx:429`, `apps/myk9show/src/services/data-scoping/role-profiles.ts:311`, `apps/myk9show/src/pages/TrialDetailsPage.tsx:138,139`.

---

## Implement Realtime & Sync Infrastructure (6 items) - 2026-02-11 15:14

- **Set up WebSocket/SSE realtime updates** - 3 TODOs for WebSocket/SSE setup in useRealTimeUpdates hook. **Problem:** Realtime update hook has placeholder setup code; no actual WebSocket or SSE connections are established. **Files:** `apps/myk9show/src/hooks/useRealTimeUpdates.ts:82,122,148`. **Solution:** Use Supabase Realtime channels for table change subscriptions.

- **Complete sync service implementations** - Initial sync, query builder, and background sync have placeholder logic. **Problem:** Sync infrastructure has skeleton implementations that don't actually communicate with Supabase. **Files:** `apps/myk9show/src/services/sync/InitialSyncOrchestrator.ts:234`, `apps/myk9show/src/services/sync/SmartQueryBuilder.ts:53`, `apps/myk9show/src/services/sync/backgroundSyncService.ts:104`.

---

## Extract Shared Services to Packages (3 items) - 2026-02-11 15:14

- **Move notification/voice/scoring services to shared packages** - 3 services in myk9show should be shared. **Problem:** Services used by both apps are only in myk9show, violating DRY. **Files:** `apps/myk9show/src/services/notificationSoundService.ts:5`, `apps/myk9show/src/services/voiceAnnouncementService.ts:5`, `apps/myk9show/src/services/nationalsScoring.ts:5`. **Solution:** Extract to @myk9/core or dedicated packages; nationalsScoring only when nationals needed in both apps.

---

## Refactor Oversized Components (3 files, 800+ lines) - 2026-02-12

Use `/refactor <file-path>` for each file. Work through sequentially via `/sprint-next`.

- **Refactor OfflineCheckInInterface.tsx (826 lines)** - Offline check-in UI for shows. **Problem:** Check-in list, search, scanning, and conflict resolution in one component. **Files:** `apps/myk9show/src/components/offline-checkin/OfflineCheckInInterface.tsx`. **Solution:** Extract search bar, check-in list, scan handler, and conflict dialog.

- **Refactor ClassList.tsx (1,033 lines)** - myK9Q class list page. **Problem:** Class cards, filtering, sorting, and batch operations in one file. NOTE: myK9Q is production — extra care needed with testing. **Files:** `apps/myk9q/src/pages/ClassList/ClassList.tsx`. **Solution:** Extract filter bar, class card list, and batch operation UI.

- **Refactor AskMyK9Q.tsx (1,036 lines)** - myK9Q chatbot component. **Problem:** Chat UI, message handling, rule lookups, and response formatting all coupled. NOTE: myK9Q is production — extra care needed with testing. **Files:** `apps/myk9q/src/components/chatbot/AskMyK9Q.tsx`. **Solution:** Extract message list, input area, rule lookup panel, and response renderer.

---

## Address myk9q Deferred Items (3 items) - 2026-02-11 15:14

- **Remove event_statistics table guard** - Guard blocks nationals feature. **Problem:** Temporary guard prevents event_statistics operations until migration runs; blocks nationals scoring feature. Medium priority. **Files:** `apps/myk9q/src/services/replication/tables/ReplicatedEventStatisticsTable.ts:217`. **Solution:** Run event_statistics migration, then remove the guard.

- **Implement analytics integration** - Performance monitoring has no external analytics. **Problem:** Performance data is collected but not sent anywhere useful. Low priority - nice-to-have. **Files:** `apps/myk9q/src/utils/performanceMonitoring.ts:323`. **Solution:** Integrate with Google Analytics, Sentry, or similar.

---

## Refactor Additional Large Files (32 files, 790-1210 lines) - 2026-02-12

Priority files not yet tracked in the refactoring backlog. See `docs/AUDIT-REPORT.md` section 4 for the full list.

- **Refactor EntryList.tsx (1,070 lines)** - myK9Q production page component. **Problem:** Entry list rendering, filtering, sorting, and actions all in one file. NOTE: myK9Q is production — extra care needed. **Files:** `apps/myk9q/src/pages/EntryList/EntryList.tsx`. **Solution:** Extract filter bar, entry cards, and action handlers.

- **Refactor MaxTimeDialog.tsx (806 lines)** - myK9Q production dialog. **Problem:** Timer UI, configuration, and submission logic coupled in one file. NOTE: myK9Q is production. **Files:** `apps/myk9q/src/components/dialogs/MaxTimeDialog.tsx`. **Solution:** Extract timer display, configuration panel, and submission logic.

- **Refactor ask-myk9q Edge Function (1,210 lines)** - Supabase Edge Function. **Problem:** Prompt construction, rule lookups, and response formatting all in one file. **Files:** `apps/myk9q/supabase/functions/ask-myk9q/index.ts`. **Solution:** Extract prompt builder, rule lookup, and response formatter modules.

- **Refactor statsDataHelpers.ts (947 lines)** - myK9Q data helpers. **Problem:** Multiple unrelated stat calculations in one file. **Files:** `apps/myk9q/src/pages/Stats/hooks/statsDataHelpers.ts`. **Solution:** Split by stat category (event stats, dog stats, title tracking).

- **Refactor useClassListData.ts (790 lines)** - myK9Q production hook. **Problem:** Data fetching, caching, and derived state in one hook. **Files:** `apps/myk9q/src/pages/ClassList/hooks/useClassListData.ts`. **Solution:** Split into data fetching hook and derived state hook.
