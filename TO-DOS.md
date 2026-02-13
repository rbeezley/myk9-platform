# TO-DOS

Items to address in future sessions.

---

## Complete Database Integration (15 items) - 2026-02-11 15:14

- **Create missing database tables** - 4 features blocked on missing Supabase tables. **Problem:** user_preferences, stripe_user_subscriptions, and payment tables don't exist yet, blocking preferences, subscription management, and payment features. **Files:** `apps/myk9show/src/types/user-preferences.ts:9`, `apps/myk9show/src/components/subscription/SubscriptionManager.tsx:3`, `apps/myk9show/src/services/payment/PaymentService.ts:3`, `apps/myk9show/src/services/preferences/userPreferencesService.ts:3`. **Solution:** Create Supabase migrations for user_preferences, stripe_user_subscriptions, and payment tables.

- **Wire up missing schema features** - 6 features need schema additions or table relationships. **Problem:** Features reference columns/relationships that don't exist: notification tables, club membership data, show relationship in club schema, entries count on Show type, ReplicatedClassesTable integration. **Files:** `apps/myk9show/src/services/notifications/FCMService.ts:344`, `apps/myk9show/src/services/notifications/EmailService.ts:487-575`, `apps/myk9show/src/utils/show-relationships.ts:50`, `apps/myk9show/src/services/database/queries/clubQueries.ts:335,356`, `apps/myk9show/src/components/shows/enhanced/PaginatedShowsList.tsx:248,485`, `apps/myk9show/src/store/trialStore.ts:563,604,633`.

---

## Complete Incomplete Features (45+ items) - 2026-02-11 15:14

- **Complete scoring & results API integration** - 4 scoring components use placeholder data instead of real API calls. **Problem:** Judge scoring interfaces and result entry navigation have placeholder data/missing API calls, blocking production scoring workflows. **Files:** `apps/myk9show/src/components/scoring/JudgeClassInterface.tsx:108,245`, `apps/myk9show/src/components/scoring/OfflineJudgeInterface.tsx:166`, `apps/myk9show/src/components/scoring/ResultEntryNavigation.tsx:99,116,428`, `apps/myk9show/src/services/realtime/RealtimeScoringService.ts:298,370`.

- **Complete registration & entry management** - Waitlist join, handler editing, permission/conflict checking, manage entries features incomplete. **Problem:** Registration workflow steps have placeholder implementations. **Files:** `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.tsx:588`, `apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerAssignmentStep.tsx:73`, `apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerSelectionDialog.tsx:152,159`, `apps/myk9show/src/components/shows/ShowDetailsMain.tsx:149,153`.

- **Complete user & dog management CRUD** - Delete, save, and edit operations missing across 8 files. **Problem:** User/dog management UIs exist but backend operations (delete user, save dog, save qualifications, etc.) aren't wired up. **Files:** `apps/myk9show/src/store/userStore.ts:229`, `apps/myk9show/src/components/admin/users/UserTable.tsx:286`, `apps/myk9show/src/components/dogs/common/DogCard.tsx:84`, `apps/myk9show/src/components/dogs/AddDogDialog.tsx:226`, `apps/myk9show/src/components/users/UserListPage.tsx:179`, `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx:152`, `apps/myk9show/src/components/users/PersonDetailsDialog.tsx:28,29`, `apps/myk9show/src/hooks/useUsers.ts:5,14,19,24`.

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

## Refactor Oversized Components (15 files, 800+ lines) - 2026-02-12

Use `/refactor <file-path>` for each file. Work through sequentially via `/sprint-next`.

- **Refactor DataLifecycleManagement.tsx (1,052 lines)** - Admin component managing archive, cleanup, and export. **Problem:** Multiple distinct concerns (orphan records, archive scheduling, data export/import) crammed into one file. **Files:** `apps/myk9show/src/components/admin/DataLifecycleManagement.tsx`. **Solution:** Extract each lifecycle operation into its own component + shared types.

- **Refactor DogDetailsMain.tsx (1,047 lines)** - Multi-tab dog profile with health, titles, competitions. **Problem:** Single file handles all dog detail tabs, making it hard to maintain individual features. **Files:** `apps/myk9show/src/components/dogs/DogDetailsMain.tsx`. **Solution:** Extract tab contents into separate components, keep DogDetailsMain as tab shell.

- **Refactor ShowCreationWizard.tsx (990 lines)** - Multi-step show creation form. **Problem:** All wizard steps, validation, and state management in one file. **Files:** `apps/myk9show/src/components/shows/wizard/ShowCreationWizard.tsx`. **Solution:** Extract each step into its own component, extract validation logic into hooks.

- **Refactor UserTable.tsx (953 lines)** - Admin user management table with bulk actions. **Problem:** Table rendering, filtering, sorting, bulk operations, and row actions all in one file. **Files:** `apps/myk9show/src/components/admin/users/UserTable.tsx`. **Solution:** Extract column definitions, filter bar, bulk actions bar, and row actions menu.

- **Refactor JudgeCreationPanel.tsx (950 lines)** - Judge creation form with qualifications. **Problem:** Complex form with multiple sections crammed into one component. **Files:** `apps/myk9show/src/components/panels/entities/JudgeCreationPanel.tsx`. **Solution:** Extract form sections (personal info, qualifications, availability) into sub-components.

- **Refactor ShowDetailsEnhanced.tsx (940 lines)** - Show details page with multiple sections. **Problem:** All show detail sections (info, classes, entries, statistics) in one monolithic component. **Files:** `apps/myk9show/src/components/shows/ShowDetails/ShowDetailsEnhanced.tsx`. **Solution:** Extract each section into its own component under ShowDetails/.

- **Refactor ClassResultsTable.tsx (934 lines)** - Results display table with scoring. **Problem:** Table rendering, result calculations, export, and formatting all coupled. **Files:** `apps/myk9show/src/components/classes/ClassResultsTable.tsx`. **Solution:** Extract column definitions, result formatters, and export logic.

- **Refactor SyncMonitoringDashboard.tsx (878 lines)** - Sync status monitoring dashboard. **Problem:** Multiple monitoring panels (connection, queue, conflicts, history) in one file. **Files:** `apps/myk9show/src/components/sync/SyncMonitoringDashboard.tsx`. **Solution:** Extract each monitoring panel into its own component.

- **Refactor OfflineDataManager.tsx (872 lines)** - Offline data management interface. **Problem:** Data caching, sync controls, and storage management all in one component. **Files:** `apps/myk9show/src/components/offline/OfflineDataManager.tsx`. **Solution:** Extract cache manager, sync controls, and storage display panels.

- **Refactor ClubDetails.tsx (863 lines)** - Club details page with member management. **Problem:** Club info, member list, show history, and settings all in one file. **Files:** `apps/myk9show/src/components/clubs/ClubDetails.tsx`. **Solution:** Extract each section into sub-components.

- **Refactor AddDogPanel.tsx (839 lines)** - Dog registration form panel. **Problem:** Large form with breed search, registration validation, and multi-step flow in one file. **Files:** `apps/myk9show/src/components/panels/edit/AddDogPanel.tsx`. **Solution:** Extract form sections and breed search into sub-components.

- **Refactor PaymentStep.tsx (827 lines)** - Registration payment workflow step. **Problem:** Payment method selection, validation, confirmation, and error handling all coupled. **Files:** `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep.tsx`. **Solution:** Extract payment method selector, summary display, and confirmation UI.

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
