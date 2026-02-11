# TO-DOS

Items to address in future sessions.

---

## Configure Production Logging Endpoint - 2026-01-12 07:53

- **Configure RemoteTransport for production logging** - Set up external logging endpoint for production environment. **Problem:** LoggingService has RemoteTransport built in but it's not configured - logs only go to localStorage currently, meaning no centralized visibility into production errors/issues. **Files:** `apps/myk9show/src/services/LoggingService.ts:72-129` (RemoteTransport class), `.env.production` (needs `VITE_LOG_ENDPOINT`). **Solution:** Options include: (1) Supabase Edge Function to receive logs, (2) Third-party service like Sentry/LogRocket/DataDog, or (3) Custom endpoint. Need to decide on approach and configure `VITE_LOG_ENDPOINT` environment variable.

---

## Fix Type/Schema Mismatches (28 files with @ts-nocheck) - 2026-02-11 15:14

- **Fix RBAC system type errors** - 3 RBAC service files have @ts-nocheck due to database migration mismatch. **Problem:** After RBAC database migration, TypeScript types no longer match the actual DB schema, blocking type safety for permission checking, role management, and audit logging. **Files:** `apps/myk9show/src/services/rbac/PermissionChecker.ts:3,167`, `apps/myk9show/src/services/rbac/RoleManager.ts:3`, `apps/myk9show/src/services/rbac/AuditLogger.ts:3`. **Solution:** Update Supabase generated types or adjust mapper logic to match current DB schema.

- **Fix mapper type mismatches** - 7 mapper files have @ts-nocheck due to DB schema drift. **Problem:** Mapper files expect columns/tables that don't exist or have different shapes than what's in the database (show_registration, judge tables, health tables, templates, class columns, dog_registrations, exhibitor fields). **Files:** `apps/myk9show/src/services/mappers/showManagementMappers.ts:3,14`, `apps/myk9show/src/services/mappers/judgeMappers.ts:3`, `apps/myk9show/src/services/mappers/healthMappers.ts:3`, `apps/myk9show/src/services/mappers/templateMappers.ts:3`, `apps/myk9show/src/services/mappers/classMappers.ts:3`, `apps/myk9show/src/services/mappers/registrationMappers.ts:3`, `apps/myk9show/src/services/exhibitorService.ts:3`. **Solution:** Regenerate Supabase types, then fix each mapper to match actual schema. Health tables may need migration first.

- **Fix Zustand/service generic type inference** - 5 files broken after Zustand upgrade. **Problem:** Generic type inference changed after Zustand version upgrade, causing type errors in stores and services that use generics. **Files:** `apps/myk9show/src/store/showRegistrationStore.ts:3`, `apps/myk9show/src/store/enhanced/showScopedDogStore.ts:16`, `apps/myk9show/src/services/testing/LoadTestService.ts:3`, `apps/myk9show/src/services/optimistic/OptimisticUIService.ts:3`, `apps/myk9show/src/services/database/batchOperations.ts:3`. **Solution:** Update generic type parameters to match new Zustand API signatures.

- **Fix entry management query types** - 5 entry/scratch/moveup files need secretaryEntryQueries and dayOfOperationsQueries types fixed. **Problem:** Query return types don't match what components expect, blocking type checking for core secretary workflows. **Files:** `apps/myk9show/src/hooks/useEntryManagementActions.ts:3`, `apps/myk9show/src/hooks/useEntryManagementData.ts:3`, `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx:3`, `apps/myk9show/src/components/entries/MoveUpRequestsTab.tsx:3`, `apps/myk9show/src/components/entries/ScratchManagementTab.tsx:3`. **Solution:** Fix secretaryEntryQueries and dayOfOperationsQueries return types to match actual DB responses.

- **Fix waitlist management query types** - 3 waitlist files need waitlistQueries types fixed. **Problem:** Waitlist query types don't match component expectations. **Files:** `apps/myk9show/src/pages/secretary/WaitlistManagementPage/useWaitlistManagementData.ts:3`, `apps/myk9show/src/pages/secretary/WaitlistManagementPage/ShowClassSelection.tsx:3`, `apps/myk9show/src/pages/secretary/WaitlistManagementPage/ClassStatsCards.tsx:3`.

- **Fix remaining type issues** - armbandUtils missing import, templateIntegrationExample types. **Problem:** Minor type issues in utility files. **Files:** `apps/myk9show/src/lib/armbandUtils.ts:5`, `apps/myk9show/src/services/templates/templateIntegrationExample.ts:3`.

---

## Replace Hardcoded Auth Values (8 locations) - 2026-02-11 15:14

- **Replace hardcoded judge/user identifiers with auth context** - 8 files use placeholder strings like 'current-judge', 'current-user', 'admin@example.com' instead of actual authenticated user. **Problem:** Security placeholders block proper auth integration; hardcoded values mean scoring, sync, and admin features don't track the actual user. **Files:** `apps/myk9show/src/hooks/useRealtimeScoring.ts:265`, `apps/myk9show/src/components/scoring/MultiAreaScoresheet.tsx:178`, `apps/myk9show/src/components/scoring/ScentWorkScoresheet.tsx:101`, `apps/myk9show/src/components/sync/ConflictResolutionDialog.tsx:352`, `apps/myk9show/src/components/dogs/DogDetails/DogDetailsView.tsx:359`, `apps/myk9show/src/hooks/useFieldLevelSync.ts:75-76`, `apps/myk9show/src/components/secretary/BulkResultEntry.tsx:481,487`, `apps/myk9show/src/components/shows/ShowDetails/ShowStatistics/index.tsx:28`. **Solution:** Import and use `useAuthContext()` hook to get current user/judge identity. ShowStatistics also needs RBAC check implementation.

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

## Address myk9q Deferred Items (3 items) - 2026-02-11 15:14

- **Implement full AKC FastCAT height-based formula** - Simplified formula works but isn't fully accurate. **Problem:** Current handicap calculation uses simplified formula instead of official AKC height-based formula. Low priority - works for now. **Files:** `apps/myk9q/src/constants/fastcatConstants.ts:33`.

- **Remove event_statistics table guard** - Guard blocks nationals feature. **Problem:** Temporary guard prevents event_statistics operations until migration runs; blocks nationals scoring feature. Medium priority. **Files:** `apps/myk9q/src/services/replication/tables/ReplicatedEventStatisticsTable.ts:217`. **Solution:** Run event_statistics migration, then remove the guard.

- **Implement analytics integration** - Performance monitoring has no external analytics. **Problem:** Performance data is collected but not sent anywhere useful. Low priority - nice-to-have. **Files:** `apps/myk9q/src/utils/performanceMonitoring.ts:323`. **Solution:** Integrate with Google Analytics, Sentry, or similar.
