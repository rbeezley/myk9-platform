# TODO Triage Summary

Generated: January 2026

**Total TODOs: 137 across 75 files**

## Categories

### 1. Database Schema Required (Blocked)
These TODOs require database table creation before implementation.

| File | TODO | Required Table |
|------|------|----------------|
| `services/rbac/RBACService.ts` (x5) | Organization permission overrides | `organization_permission_overrides` |
| `services/preferences/userPreferencesService.ts` | User preferences | `user_preferences` |
| `types/user-preferences.ts` | User preferences schema | `user_preferences` |
| `services/payment/PaymentService.ts` | Payment integration | Payment tables |
| `services/notifications/EmailService.ts` (x4) | Notification queue | `notification_queue` |
| `services/notifications/FCMService.ts` | Notification events | `notification_event` |

**Action:** Create GitHub issues for database schema additions.

### 2. Integration Work (Backlog)
These require integration with other systems or significant implementation.

| File | TODO | Integration Type |
|------|------|-----------------|
| `store/trialStore.ts` (x3) | ReplicatedClassesTable integration | Replication system |
| `services/sync/InitialSyncOrchestrator.ts` | Supabase sync logic | Supabase |
| `services/sync/SmartQueryBuilder.ts` | Supabase query replacement | Supabase |
| `pages/MyEntriesPage.tsx` | API/IndexedDB entries fetch | Data layer |

**Action:** Create feature-level issues for each integration.

### 3. Quick Fixes (Do Now)
Small improvements that can be done quickly.

| File | TODO | Fix |
|------|------|-----|
| `components/admin/users/UserTable.tsx` | Delete confirmation dialog | Add confirmation modal |
| `pages/secretary/ShowCreationWizardPage.tsx` | Show error/success messages | Use alert system |
| `components/clubs/ClubDetails.tsx` | Show error toast | Use existing toast system |
| `components/dogs/DogDetailsMain.tsx` | Error notification | Use existing toast system |
| `components/users/UserDetails/UserDetailsView.tsx` | Error notifications | Use existing toast system |

**Action:** These can be addressed as drive-by improvements.

### 4. Feature Placeholders (Backlog)
Placeholder code for features not yet implemented.

| Area | Count | Examples |
|------|-------|----------|
| Activity tracking | 2 | SecretaryDashboard hasNewActivity |
| Conflict resolution | 2 | armbandStore, ConflictManager |
| Copy/Export functionality | 2 | ClassCreationPage |
| Photo dialog | 1 | ClassDetailsPage |
| Qualifications saving | 1 | UserListPage |

**Action:** Convert to GitHub issues if features are on roadmap.

### 5. Documentation Comments (Keep)
These are implementation notes that serve as documentation.

| Pattern | Count | Action |
|---------|-------|--------|
| "TODO: Get from..." | 10+ | Keep as implementation hints |
| "TODO: Implement when..." | 8+ | Keep as blocked work notes |
| "TODO: Replace with..." | 5+ | Keep as refactoring notes |

**Action:** Keep these as inline documentation.

### 6. Obsolete/Removable (Clean Up)
TODOs that are no longer relevant.

| File | TODO | Reason |
|------|------|--------|
| `providers/QueryProvider.tsx` | ReactQueryDevtools | DevTools are installed |

**Action:** Review and remove obsolete TODOs.

## Summary by Priority

| Priority | Count | Action |
|----------|-------|--------|
| **Blocked (DB Schema)** | ~15 | Create schema issues |
| **Backlog (Features)** | ~40 | Convert to GitHub issues |
| **Quick Fixes** | ~10 | Do during related work |
| **Keep (Documentation)** | ~60 | Leave as comments |
| **Remove (Obsolete)** | ~5 | Clean up |

## Recommendations

1. **Create GitHub issues** for all blocked TODOs with required schema
2. **Don't mass-delete** TODOs - they serve as breadcrumbs for implementation
3. **Fix quick wins** when working in related files (drive-by improvements)
4. **Review before features** - check for relevant TODOs when implementing new features

## High-Value Files

Files with 5+ TODOs that need attention:

| File | TODOs | Notes |
|------|-------|-------|
| `pages/SecretaryDashboard.tsx` | 7 | Activity tracking, stats |
| `services/rbac/RBACService.ts` | 7 | Org overrides, validation |
| `services/notifications/EmailService.ts` | 4 | Notification queue |
| `pages/ClassDetailsPage.tsx` | 4 | Entry updates, photos |
| `services/sync/dataVersioningService.ts` | 4 | Conflict handling |
| `hooks/useUsers.ts` | 4 | User management |
