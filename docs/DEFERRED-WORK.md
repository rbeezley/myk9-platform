# Deferred Work Items

**Generated:** 2026-02-10
**Updated:** 2026-02-15 (OfflineJudgeInterface store wiring complete — 0 incomplete features remain)
**Source:** Automated scan of TODO/FIXME/HACK comments across the monorepo

---

## Summary

| Area | Count | Priority |
|------|-------|----------|
| Type/Schema Mismatches | 15 | Low - schema-blocked files remain excluded |
| Auth Context Integration | 0 | ~~Complete~~ — all hardcoded values replaced |
| Database Integration | 15 | Medium - waiting on schema |
| Incomplete Features | 0 | ~~Complete~~ — OfflineJudgeInterface store wiring done |
| Realtime/Sync | 0 | ~~Complete~~ — all items verified implemented |
| Code Organization | 3 | Low - DRY improvements (when needed by both apps) |
| UX Polish | 0 | ~~Complete~~ — all items verified implemented or fixed |
| myk9q Items | 3 | Low - working fine as-is |

---

## 1. Type/Schema Mismatches (15 items remaining)

**Status update (2026-02-14):** Phase 8 exclusion audit completed:
- **24 dead code files deleted** (~8,981 lines removed) across sync, monitoring, virtualization, scoring, and utility modules
- **tsconfig.app.json exclude list reduced from 135 to 88 non-test entries** (35% reduction)
- Removed entries for non-existent files, redundant individual entries covered by globs, and duplicate entries
- Fixed barrel exports (scoring/index.ts, lib/lazyLoading.ts) that referenced deleted modules
- All remaining excluded files have documented reasons (schema-blocked or have active consumers with type errors)

**Previous audit (2026-02-14):** 4 files un-excluded (showRegistrationStore, LoadTestService, batchOperations, OptimisticUIService). Zero `@ts-nocheck` directives remain.

### Files still in tsconfig.app.json exclude (schema-blocked)

| File | Reason |
|------|--------|
| `services/rbac/PermissionChecker.ts` | `as any` for missing RPC types — functional |
| `services/rbac/RoleManager.ts` | `as any` for missing RPC types — functional |
| `services/rbac/AuditLogger.ts` | `as any` for missing RPC types — functional |
| `services/mappers/showManagementMappers.ts` | show_registration table schema mismatch |
| `services/mappers/judgeMappers.ts` | Judge tables schema mismatch |
| ~~`services/mappers/healthMappers.ts`~~ | ~~RESOLVED: Type-safe mappers with validation, no `as` casts~~ |
| `services/mappers/templateMappers.ts` | Template tables schema mismatch |
| `services/mappers/classMappers.ts` | Missing columns: updated_by, created_by, status |
| `services/mappers/registrationMappers.ts` | dog_registrations table schema mismatch |
| `services/exhibitorService.ts` | subscription_tier, Person fields, sex type |
| `store/enhanced/showScopedDogStore.ts` | Incomplete after type definition update |
| `hooks/useEntryManagementActions.ts` | Blocked on secretaryEntryQueries types |
| `hooks/useEntryManagementData.ts` | Blocked on secretaryEntryQueries types |
| `pages/secretary/EntryManagementPage.tsx` | Blocked on secretaryEntryQueries types |
| `lib/armbandUtils.ts` | Missing trial types import |

### Files resolved (pass typecheck, no longer excluded)

| File | Resolution |
|------|-----------|
| ~~`store/showRegistrationStore.ts`~~ | Passes typecheck — un-excluded |
| ~~`services/testing/LoadTestService.ts`~~ | Passes typecheck — un-excluded |
| ~~`services/optimistic/OptimisticUIService.ts`~~ | Fixed EventEmitter import + typed events — un-excluded |
| ~~`services/database/batchOperations.ts`~~ | Passes typecheck — un-excluded |
| ~~`components/entries/MoveUpRequestsTab.tsx`~~ | Passes typecheck, was never actually excluded |
| ~~`components/entries/ScratchManagementTab.tsx`~~ | Passes typecheck, was never actually excluded |
| ~~`WaitlistManagementPage/useWaitlistManagementData.ts`~~ | Passes typecheck, was never actually excluded |
| ~~`WaitlistManagementPage/ShowClassSelection.tsx`~~ | Passes typecheck, was never actually excluded |
| ~~`WaitlistManagementPage/ClassStatsCards.tsx`~~ | Passes typecheck, was never actually excluded |
| ~~`services/templates/templateIntegrationExample.ts`~~ | Deleted |

---

## 2. Auth Context Integration — COMPLETE

**Status update (2026-02-14):** All hardcoded auth values eliminated from the codebase.

**Pass 1 — Components/hooks (10 files):**
- Scoresheets, admin components, sync components, hooks — `'current-judge'`/`'current-user'` → `user?.id` via `useAuthContext()`
- Premium gating mock → RBAC-based auth check (`!!user`)

**Pass 2 — Zustand stores (4 stores, 19 actions, ~18 callers):**
- `templateStore.ts` — 9 actions updated to accept `userId` param, 6 caller files updated
- `trialStore.ts` — 4 actions updated, 4 caller files updated
- `entryStore.ts` — 5 actions updated, 4 caller files updated
- `classCreationStore.ts` — 1 action updated, 4 caller files updated (incl. tests)

Zero instances of `'current-user'` or `'current-judge'` remain in production code.

---

## 3. Database Integration Pending (15 items)

Features waiting on database tables or schema changes.

### Missing Tables
| File | Line | Missing Table/Feature |
|------|------|----------------------|
| `apps/myk9show/src/types/user-preferences.ts` | 9 | `user_preferences` table |
| `apps/myk9show/src/components/subscription/SubscriptionManager.tsx` | 3 | `stripe_user_subscriptions` table |
| `apps/myk9show/src/services/payment/PaymentService.ts` | 3 | Payment tables |
| `apps/myk9show/src/services/preferences/userPreferencesService.ts` | 3 | `user_preferences` table |

### Missing Schema Features
| File | Line | Feature Needed |
|------|------|----------------|
| `apps/myk9show/src/services/notifications/FCMService.ts` | 344 | `notification_event` table integration |
| `apps/myk9show/src/services/notifications/EmailService.ts` | 487-575 | `notification_queue` integration (4 TODOs) |
| `apps/myk9show/src/utils/show-relationships.ts` | 50 | Club membership data for admin check |
| `apps/myk9show/src/services/database/queries/clubQueries.ts` | 335, 356 | Show relationship in club schema |
| `apps/myk9show/src/components/shows/enhanced/PaginatedShowsList.tsx` | 248, 485 | Entries count on Show type |
| `apps/myk9show/src/store/trialStore.ts` | 563, 604, 633 | ReplicatedClassesTable integration (3 TODOs) |

---

## 4. Incomplete Features (1 remaining of 45+ audited)

### Scoring & Results
| File | Line | Missing Feature |
|------|------|-----------------|
| ~~`apps/myk9show/src/components/scoring/JudgeClassInterface.tsx`~~ | ~~108, 245~~ | ~~Already complete — uses query hooks and mutation~~ |
| ~~`apps/myk9show/src/components/scoring/OfflineJudgeInterface.tsx`~~ | ~~109-126~~ | ~~Done — store wired: error/warning state, real auth, validation, sync status, entry navigation~~ |
| ~~`apps/myk9show/src/components/scoring/ResultEntryNavigation.tsx`~~ | ~~99, 116, 428~~ | ~~Already complete — all items implemented~~ |
| ~~`apps/myk9show/src/services/realtime/RealtimeScoringService.ts`~~ | ~~298, 370~~ | ~~Already complete — conflict resolution + presence sync working~~ |

### Registration & Entry Management
| File | Line | Missing Feature |
|------|------|-----------------|
| ~~`apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.tsx`~~ | ~~588~~ | ~~Already complete — waitlist join with toast + loading state~~ |
| ~~`apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerAssignmentStep.tsx`~~ | ~~73~~ | ~~Already complete — single-dog edit via handleSingleDogEdit~~ |
| ~~`apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerSelectionDialog.tsx`~~ | ~~152, 159~~ | ~~Already complete — permission + conflict checking implemented~~ |
| ~~`apps/myk9show/src/components/shows/ShowDetailsMain.tsx`~~ | ~~149, 153~~ | ~~Already complete — navigate to entries/results with showId~~ |

### User & Dog Management
| File | Line | Missing Feature |
|------|------|-----------------|
| ~~`apps/myk9show/src/store/userStore.ts`~~ | ~~229~~ | ~~Already complete — deleteUser with DB call implemented~~ |
| ~~`apps/myk9show/src/components/admin/users/UserTable`~~ | ~~128~~ | ~~Fixed 2026-02-15 — delete confirmation dialog added~~ |
| ~~`apps/myk9show/src/components/dogs/common/DogCard.tsx`~~ | ~~84~~ | ~~Already complete — delegates via onSavePhoto callback~~ |
| ~~`apps/myk9show/src/components/dogs/AddDogDialog.tsx`~~ | ~~226~~ | ~~Already complete — registrations saved via syncDogRegistrations~~ |
| ~~`apps/myk9show/src/components/users/UserListPage.tsx`~~ | ~~179~~ | ~~Already complete — save qualifications implemented~~ |
| ~~`apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx`~~ | ~~152~~ | ~~Already complete — save to backend with error handling~~ |
| ~~`apps/myk9show/src/components/users/PersonDetailsDialog.tsx`~~ | ~~28, 29~~ | ~~Already complete — edit/delete callbacks wired~~ |
| ~~`apps/myk9show/src/hooks/useUsers.ts`~~ | ~~5, 14, 19, 24~~ | ~~Already complete — real Supabase queries via userQueries~~ |

### Secretary Tools
| File | Line | Missing Feature |
|------|------|-----------------|
| ~~`apps/myk9show/src/pages/secretary/ClassCreationPage.tsx`~~ | ~~162, 171~~ | ~~Already complete — copy/export implemented~~ |
| ~~`apps/myk9show/src/pages/admin/TemplateEditorPageMinimal.tsx`~~ | ~~68~~ | ~~Fixed 2026-02-15 — editable fields + change tracking added~~ |
| ~~`apps/myk9show/src/components/secretary/ResultsGrid.tsx`~~ | ~~75-76~~ | ~~Already complete — dynamic columns from classConfig.areaLimits~~ |

### Data Lifecycle
| File | Line | Missing Feature |
|------|------|-----------------|
| ~~`apps/myk9show/src/services/data-lifecycle/OrphanedRecordsCleaner.ts`~~ | ~~491~~ | ~~Already complete — restoreFromBackup + restoreRecord implemented~~ |
| ~~`apps/myk9show/src/services/data-lifecycle/ArchiveScheduler.ts`~~ | ~~159, 217~~ | ~~Already complete — ArchivableResult building + notifications~~ |
| ~~`apps/myk9show/src/services/data-lifecycle/DataExportImport.ts`~~ | ~~662~~ | ~~Already complete — import for all 5 data types + merge strategies~~ |

### Exhibitor Features
| File | Line | Missing Feature |
|------|------|-----------------|
| ~~`apps/myk9show/src/components/exhibitor/LiveResults.tsx`~~ | ~~344, 354~~ | ~~Already complete — results rendering implemented~~ |
| ~~`apps/myk9show/src/components/cart/CartPreviewPanel.tsx`~~ | ~~51~~ | ~~Already complete — expiry timer with progress bar~~ |

### Dialog/Form Completions
| File | Line | Missing Feature |
|------|------|-----------------|
| ~~`apps/myk9show/src/components/dogs/DogDetails/TitleTracking/EditTitleDialog.tsx`~~ | ~~13, 21, 25~~ | ~~Already complete — form state management implemented~~ |
| ~~`apps/myk9show/src/components/dogs/DogDetails/Competitions/EditCompetitionDialog.tsx`~~ | ~~13, 21, 25~~ | ~~Already complete — form state management implemented~~ |
| ~~`apps/myk9show/src/components/templates/DynamicClassForm.tsx`~~ | ~~302~~ | ~~Already complete — multi-select with toggle logic~~ |
| ~~`apps/myk9show/src/components/panels/edit/JudgeQualificationPanel.tsx`~~ | ~~155~~ | ~~Already complete — unsaved changes dialog + error notification~~ |
| ~~`apps/myk9show/src/components/offline/ReportGenerationDialog.tsx`~~ | ~~279, 293~~ | ~~Already complete — judges from show.assignedJudges~~ |

### Other
| File | Line | Missing Feature |
|------|------|-----------------|
| ~~`apps/myk9show/src/store/armbandStore.ts`~~ | ~~325~~ | ~~Already complete — 3 strategies: reassign, swap, override~~ |
| ~~`apps/myk9show/src/hooks/useEnhancedSearch.ts`~~ | ~~235~~ | ~~Already complete — loadMore, hasMore, page state~~ |
| ~~`apps/myk9show/src/hooks/useUserPreferences.ts`~~ | ~~160~~ | ~~Already complete — 3 strategies: remote, local, merge~~ |
| ~~`apps/myk9show/src/hooks/useBackgroundSync.ts`~~ | ~~121~~ | ~~Already complete — getEntitySyncStatus returns per-entity state~~ |
| ~~`apps/myk9show/src/components/clubs/ClubDetails.tsx`~~ | ~~321~~ | ~~Fixed 2026-02-15 — success notification added~~ |
| ~~`apps/myk9show/src/components/shows/wizard/ShowCreationWizard.tsx`~~ | ~~754~~ | ~~Fixed 2026-02-15 — success notifications for draft/create/publish~~ |
| ~~`apps/myk9show/src/components/common/UserFriendlyErrors.tsx`~~ | ~~429~~ | ~~Already complete — hooks already extracted to separate file~~ |
| ~~`apps/myk9show/src/services/data-scoping/role-profiles.ts`~~ | ~~311~~ | ~~Already complete — full RBAC matrix with hasDataAccess~~ |
| ~~`apps/myk9show/src/pages/TrialDetailsPage.tsx`~~ | ~~138, 139~~ | ~~Already complete — uses data with sensible fallbacks~~ |

---

## 5. Realtime & Sync — COMPLETE

| File | Line | Feature Needed |
|------|------|----------------|
| ~~`apps/myk9show/src/hooks/useRealTimeUpdates.ts`~~ | ~~82, 122, 148~~ | ~~Already complete — Supabase Realtime channels for shows + entries~~ |
| ~~`apps/myk9show/src/services/sync/InitialSyncOrchestrator.ts`~~ | ~~234~~ | ~~Already complete — full sync with SmartQueryBuilder + Dexie storage~~ |
| ~~`apps/myk9show/src/services/sync/SmartQueryBuilder.ts`~~ | ~~53~~ | ~~Already complete — full PostgREST query with filter operators~~ |
| ~~`apps/myk9show/src/services/sync/backgroundSyncService.ts`~~ | ~~104~~ | ~~Fixed 2026-02-15 — uses __APP_VERSION__ from Vite define~~ |

---

## 6. Code Organization (3 items)

Services that should be extracted to shared packages for DRY compliance.

| File | Line | Action |
|------|------|--------|
| `apps/myk9show/src/services/notificationSoundService.ts` | 5 | Move to shared package |
| `apps/myk9show/src/services/voiceAnnouncementService.ts` | 5 | Move to shared package |
| `apps/myk9show/src/services/nationalsScoring.ts` | 5 | Move to shared package when nationals needed in both apps |

---

## 7. myk9q Items (3 items)

| File | Line | Issue | Priority |
|------|------|-------|----------|
| `apps/myk9q/src/constants/fastcatConstants.ts` | 33 | Implement full AKC height-based formula | Low - simplified formula works |
| `apps/myk9q/src/services/replication/tables/ReplicatedEventStatisticsTable.ts` | 217 | Remove guard when event_statistics migration runs | Medium - blocks nationals |
| `apps/myk9q/src/utils/performanceMonitoring.ts` | 323 | Implement analytics integration (GA, etc.) | Low - nice-to-have |

---

## 8. Deprecated Files

**Cleaned up 2026-02-10:** Deleted 5 files and updated 8 imports.

| File | Status |
|------|--------|
| ~~`apps/myk9show/src/data/mockAncestors.ts`~~ | Deleted |
| ~~`apps/myk9show/src/components/shows/ShowDetails/ShowSidebar.tsx`~~ | Deleted (+ ShowSidebar/index.tsx) |
| ~~`apps/myk9show/src/hooks/useEnhancedAuth.ts`~~ | Deleted, 7 consumers migrated to useAuthContext |
| ~~`apps/myk9show/src/services/templates/templateIntegrationExample.ts`~~ | Deleted |
| ~~`apps/myk9q/src/hooks/useOneHandedMode.ts`~~ | Deleted, removed from App.tsx |
| `apps/myk9show/src/services/sync/syncService.ts` | Kept - 6 active consumers, needs careful refactoring |

**Phase 8 exclusion audit (2026-02-14):** Deleted 24 dead code files:
- Components: BulkPermissionOperations, UserImpersonationDialog, PaginatedDogsList, VirtualDogsList, VirtualizedUserTable, PaginatedUserList, VirtualUserList, VirtualizedEntryList, VirtualizedClassEntriesTable, OfflineScoringModeIndicator, RealtimeScoringInterface, ConformationScoresheet
- Hooks: useFieldLevelSync, useSearchWorker, usePushNotifications, useBatchMutations, useTrialsDatabase, useEncryptedStorage
- Services: ErrorTracker, PerformanceBudgetService, mockDataService, migration.ts, judgeAssignmentQueries
- Utils: optimisticHelpers
