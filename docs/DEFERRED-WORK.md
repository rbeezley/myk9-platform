# Deferred Work Items

**Generated:** 2026-02-10
**Updated:** 2026-02-15 (myk9q items audit — all 3 already implemented)
**Source:** Automated scan of TODO/FIXME/HACK comments across the monorepo

---

## Summary

| Area | Count | Priority |
|------|-------|----------|
| Type/Schema Mismatches | 0 | ~~Complete~~ — all 15 resolved (eb49834) |
| Auth Context Integration | 0 | ~~Complete~~ — all hardcoded values replaced |
| Database Integration | 4 | Medium - 4 unique items remain (11 were already done) |
| Incomplete Features | 0 | ~~Complete~~ — OfflineJudgeInterface store wiring done |
| Realtime/Sync | 0 | ~~Complete~~ — all items verified implemented |
| Code Organization | 0 | ~~Complete~~ — architecture reviewed, nationalsConstants extracted to @myk9/core |
| UX Polish | 0 | ~~Complete~~ — all items verified implemented or fixed |
| myk9q Items | 0 | ~~Complete~~ — all 3 already implemented (stale entries) |

---

## 1. Type/Schema Mismatches — COMPLETE

**Resolved (2026-02-15, eb49834):** All 15 schema-blocked type mismatches resolved:
- **5 dead code files deleted** (~1,915 lines): judgeMappers, registrationMappers, showManagementMappers, showScopedDogStore, armbandUtils
- **10 active files fixed:** RBAC services (`as any` → proper types), exhibitorService (manual interfaces → DB-derived), templateMappers/classMappers (`Record<string,unknown>` → `DbClassTemplate`/`DbShowTemplate`), healthMappers (type guards + `exactOptionalPropertyTypes`), entry management (removed excluded NotificationService deps)
- Exported `Json` type from `@myk9/supabase`

**Previous audit (2026-02-14):** Phase 8 exclusion audit deleted 24 dead code files (~8,981 lines), reduced tsconfig exclude from 135 → 88 entries. 4 files un-excluded (showRegistrationStore, LoadTestService, batchOperations, OptimisticUIService). Zero `@ts-nocheck` directives remain.

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

## 3. Database Integration (4 remaining of 15 audited)

**Audit (2026-02-15):** 11 of 15 items were already complete or had working workarounds:
- ~~`user_preferences` table~~ — table exists (migration 005), service fully implemented
- ~~`userPreferencesService.ts`~~ — duplicate of above, fully working
- ~~`notification_queue` / EmailService~~ — table exists, all 4 TODOs are working code
- ~~`clubQueries.ts` show relationship~~ — FK `shows.club_id` exists and works (2 items)
- ~~`show-relationships.ts` club membership~~ — works via RBAC `role_scopes` table

### Remaining Items

| File | Issue | Priority |
|------|-------|----------|
| `apps/myk9show/src/store/trialStore.ts` (lines 563, 604, 633) | Wire `addTrialClass`/`updateTrialClass`/`deleteTrialClass` to `ReplicatedClassesTable` for offline sync | Medium — 13 importers, store works but no persistence |
| `apps/myk9show/src/components/subscription/SubscriptionManager.tsx` | Stripe write operations (create/upgrade/portal) need Edge Functions; reads work | Medium — needs Stripe API setup |
| `apps/myk9show/src/services/payment/PaymentService.ts` | Payment write operations (create/confirm/refund) need Edge Functions; reads work | Medium — needs Stripe API setup |
| `apps/myk9show/src/services/notifications/FCMService.ts` (line 344) | `notification_event` table for analytics (currently logs only) | Low — logging workaround sufficient |
| `apps/myk9show/src/components/shows/enhanced/PaginatedShowsList.tsx` (lines 248, 485) | `entriesCount` field on Show type (component has no active importers) | Low — dead component |

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

## 6. Code Organization — COMPLETE

Architecture reviewed 2026-02-15. All three services already follow the correct pattern:
`@myk9/core` exports type contracts + no-op stubs; each app provides its own full implementation
with app-specific dependencies (settings stores, Supabase client). Full extraction would require
dependency injection with no concrete benefit.

| File | Status |
|------|--------|
| ~~`notificationSoundService`~~ | ~~Architecture correct — stub in @myk9/core, impl in apps (hard dep on useSettingsStore)~~ |
| ~~`voiceAnnouncementService`~~ | ~~Architecture correct — stub in @myk9/core, impl in apps (dep on settingsStore + localStorage)~~ |
| ~~`nationalsScoring`~~ | ~~Architecture correct — stub in @myk9/core, impl in myK9Q (dep on supabase client + store)~~ |
| `nationalsConstants.ts` | Extracted to `@myk9/core` — was duplicated identically in both apps |

---

## 7. myk9q Items — COMPLETE

Audited 2026-02-15. All 3 items were already fully implemented (document was stale).

| File | Status |
|------|--------|
| ~~`fastcatConstants.ts`~~ | ~~Full AKC height-based formula implemented — 3 categories, getHandicapMultiplier(), calculateFastCatPoints(), tests passing~~ |
| ~~`ReplicatedEventStatisticsTable.ts`~~ | ~~No guard exists — full sync, realtime, query methods implemented~~ |
| ~~`performanceMonitoring.ts`~~ | ~~Pluggable AnalyticsReporter with console/beacon/noop reporters, auto-resolves via VITE_ANALYTICS_ENDPOINT~~ |

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
