# Deferred Work Items

**Generated:** 2026-02-10
**Updated:** 2026-02-14 (auth context complete; type/schema mismatches audited)
**Source:** Automated scan of TODO/FIXME/HACK comments across the monorepo

---

## Summary

| Area | Count | Priority |
|------|-------|----------|
| Type/Schema Mismatches | 25 | Low - all pass typecheck, 4 un-excluded, remaining are schema-blocked |
| Auth Context Integration | 0 | ~~Complete~~ — all hardcoded values replaced |
| Database Integration | 15 | Medium - waiting on schema |
| Incomplete Features | 45+ | Medium - partial implementations |
| Realtime/Sync | 6 | Medium - infrastructure |
| Code Organization | 3 | Low - DRY improvements |
| UX Polish | 6 | Low - confirmation dialogs, messages |
| myk9q Items | 3 | Low - working fine as-is |

---

## 1. Type/Schema Mismatches (25 items)

**Status update (2026-02-14):** Comprehensive audit completed. All 25 files pass `pnpm typecheck`. Zero `@ts-nocheck` directives remain. Key fixes:
- OptimisticUIService: Replaced Node.js `EventEmitter` with browser-compatible version + typed events map
- Un-excluded 4 files from `tsconfig.app.json`: showRegistrationStore, LoadTestService, batchOperations, OptimisticUIService (+ 2 glob patterns removed)
- RBAC files: Pass typecheck with `as any` casts (functional, awaiting generated types for `user_has_permission` RPC)
- Mapper/entry/waitlist files: Still excluded but pass typecheck; blocked on DB schema alignment

### Files still in tsconfig.app.json exclude (schema-blocked)

| File | Reason |
|------|--------|
| `services/rbac/PermissionChecker.ts` | `as any` for missing RPC types — functional |
| `services/rbac/RoleManager.ts` | `as any` for missing RPC types — functional |
| `services/rbac/AuditLogger.ts` | `as any` for missing RPC types — functional |
| `services/mappers/showManagementMappers.ts` | show_registration table schema mismatch |
| `services/mappers/judgeMappers.ts` | Judge tables schema mismatch |
| `services/mappers/healthMappers.ts` | Health tables not yet in database |
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

## 4. Incomplete Features (45+ items)

### Scoring & Results
| File | Line | Missing Feature |
|------|------|-----------------|
| `apps/myk9show/src/components/scoring/JudgeClassInterface.tsx` | 108, 245 | Actual API calls (placeholder data) |
| `apps/myk9show/src/components/scoring/OfflineJudgeInterface.tsx` | 166 | Actual data loading |
| `apps/myk9show/src/components/scoring/ResultEntryNavigation.tsx` | 99, 116, 428 | API call for check-in status updates |
| `apps/myk9show/src/services/realtime/RealtimeScoringService.ts` | 298, 370 | Conflict resolution, channel filter |

### Registration & Entry Management
| File | Line | Missing Feature |
|------|------|-----------------|
| `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.tsx` | 588 | Waitlist join functionality |
| `apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerAssignmentStep.tsx` | 73 | Specific dog editing |
| `apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerSelectionDialog.tsx` | 152, 159 | Permission checking, conflict checking |
| `apps/myk9show/src/components/shows/ShowDetailsMain.tsx` | 149, 153 | Manage entries functionality |

### User & Dog Management
| File | Line | Missing Feature |
|------|------|-----------------|
| `apps/myk9show/src/store/userStore.ts` | 229 | Database delete (deleteUser query) |
| `apps/myk9show/src/components/admin/users/UserTable.tsx` | 286 | Delete confirmation dialog |
| `apps/myk9show/src/components/dogs/common/DogCard.tsx` | 84 | Save logic |
| `apps/myk9show/src/components/dogs/AddDogDialog.tsx` | 226 | Registrations in separate table |
| `apps/myk9show/src/components/users/UserListPage.tsx` | 179 | Save qualifications to backend |
| `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx` | 152 | Save to backend |
| `apps/myk9show/src/components/users/PersonDetailsDialog.tsx` | 28, 29 | Edit dialog trigger |
| `apps/myk9show/src/hooks/useUsers.ts` | 5, 14, 19, 24 | Real API endpoint (placeholder) |

### Secretary Tools
| File | Line | Missing Feature |
|------|------|-----------------|
| `apps/myk9show/src/pages/secretary/ClassCreationPage.tsx` | 162, 171 | Copy and export functionality |
| `apps/myk9show/src/pages/admin/TemplateEditorPageMinimal.tsx` | 68 | Save logic |
| `apps/myk9show/src/components/secretary/ResultsGrid.tsx` | 75-76 | Column configuration from classConfig |

### Data Lifecycle
| File | Line | Missing Feature |
|------|------|-----------------|
| `apps/myk9show/src/services/data-lifecycle/OrphanedRecordsCleaner.ts` | 491 | Actual restoration logic |
| `apps/myk9show/src/services/data-lifecycle/ArchiveScheduler.ts` | 159, 217 | Actual results, notification integration |
| `apps/myk9show/src/services/data-lifecycle/DataExportImport.ts` | 662 | Import logic based on data types |

### Exhibitor Features
| File | Line | Missing Feature |
|------|------|-----------------|
| `apps/myk9show/src/components/exhibitor/LiveResults.tsx` | 344, 354 | Email results, share functionality |
| `apps/myk9show/src/components/cart/CartPreviewPanel.tsx` | 51 | Modal/redirect on cart expiry |

### Dialog/Form Completions
| File | Line | Missing Feature |
|------|------|-----------------|
| `apps/myk9show/src/components/dogs/DogDetails/TitleTracking/EditTitleDialog.tsx` | 13, 21, 25 | Form state management |
| `apps/myk9show/src/components/dogs/DogDetails/Competitions/EditCompetitionDialog.tsx` | 13, 21, 25 | Form state management |
| `apps/myk9show/src/components/templates/DynamicClassForm.tsx` | 302 | Multi-select component |
| `apps/myk9show/src/components/panels/edit/JudgeQualificationPanel.tsx` | 155 | Confirmation dialog |
| `apps/myk9show/src/components/offline/ReportGenerationDialog.tsx` | 279, 293 | Actual judges from show |

### Other
| File | Line | Missing Feature |
|------|------|-----------------|
| `apps/myk9show/src/store/armbandStore.ts` | 325 | Conflict resolution strategies |
| `apps/myk9show/src/hooks/useEnhancedSearch.ts` | 235 | Pagination |
| `apps/myk9show/src/hooks/useUserPreferences.ts` | 160 | Conflict resolution |
| `apps/myk9show/src/hooks/useBackgroundSync.ts` | 121 | Entity-specific sync status |
| `apps/myk9show/src/components/clubs/ClubDetails.tsx` | 321 | Registration success handling |
| `apps/myk9show/src/components/shows/wizard/ShowCreationWizard.tsx` | 754 | Success message |
| `apps/myk9show/src/components/users/enhanced/VirtualUserList.tsx` | 352 | Proper filtering |
| `apps/myk9show/src/components/common/UserFriendlyErrors.tsx` | 429 | Move hooks to separate file |
| `apps/myk9show/src/services/data-scoping/role-profiles.ts` | 311 | Use scope for access control |
| `apps/myk9show/src/pages/TrialDetailsPage.tsx` | 138, 139 | Start time and entries from data |

---

## 5. Realtime & Sync (6 items)

| File | Line | Feature Needed |
|------|------|----------------|
| `apps/myk9show/src/hooks/useRealTimeUpdates.ts` | 82, 122, 148 | WebSocket/SSE setup (3 TODOs) |
| `apps/myk9show/src/services/sync/InitialSyncOrchestrator.ts` | 234 | Actual sync logic with Supabase |
| `apps/myk9show/src/services/sync/SmartQueryBuilder.ts` | 53 | Replace with actual Supabase query |
| `apps/myk9show/src/services/sync/backgroundSyncService.ts` | 104 | Version from package.json |

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
