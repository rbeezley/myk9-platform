# Admin Console Audit — 2026-03-06

Systematic audit of all interactive elements across admin pages.
Methodology: read every handler, trace to service/store, verify target exists.

## Summary

| Metric                         | Count     |
| ------------------------------ | --------- |
| Pages/components audited       | 50+ files |
| Interactive elements found     | ~80       |
| WORKING                        | 65        |
| STUB (no-op / mock only)       | 12        |
| BROKEN (missing handler/route) | 3         |

## Phase 1 Fixes Applied (2026-03-06)

| Finding                                            | Action Taken                                    |
| -------------------------------------------------- | ----------------------------------------------- |
| #1 RowActions "Manage Roles" no onClick            | Wired to `onView(user)` to open role management |
| #2 SecurityDashboardPage no route                  | Deleted — unreachable page with no route        |
| #3 OrganizationPermissionPage no route             | Deleted — unreachable page with no route        |
| #5 RoleApprovalWorkflow stub                       | Deleted — stub component, no backend exists     |
| #6 OrganizationPermissionOverrides stub            | Deleted — stub component, no backend exists     |
| #7 RoleExpirationManager stub                      | Deleted — stub component, no backend exists     |
| #8 UserDetailsDialog Edit button no-op             | Wired to `setIsEditing(true)`                   |
| #9 BulkActionsBar fake email                       | Removed Send Email button + dialog + handler    |
| #10 ArchivingTab "Configure Settings" no onClick   | Removed button                                  |
| #11 ExportImportTab 3 broken buttons               | Removed broken export buttons + import button   |
| #12 TemplateManagement Duplicate/Export no onClick | Removed dropdown items                          |

---

## Remaining — Stub Implementations (UI works, nothing persists)

### 4. AnalyticsDashboard — 100% mock data

- **File:** `src/pages/AnalyticsPage.tsx` -> AnalyticsDashboard component
- **Impact:** All charts display hardcoded fake data, not real Supabase queries
- **Also:** Refresh and Export buttons have no onClick handlers
- **Fix:** Replace mock data with real React Query hooks against Supabase

---

## WORKING — No Issues Found

These pages/sections passed audit with all elements properly wired:

| Page                        | Status       | Notes                                           |
| --------------------------- | ------------ | ----------------------------------------------- |
| Admin Dashboard             | ALL GREEN    | All navigation + queries working                |
| Permission Management       | ALL GREEN    | Full CRUD via rbacService                       |
| Role List/Edit/Create/Clone | ALL GREEN    | All rbacService calls verified                  |
| User Role Management        | ALL GREEN    | Assign/revoke working                           |
| Permission Audit            | ALL GREEN    | Search, filter, CSV export working              |
| Performance Dashboard       | ALL GREEN    | Real RUM + Budget services                      |
| Sync Monitoring             | ALL GREEN    | Real analytics service                          |
| Template Editor             | ALL GREEN    | Full CRUD via templateStore                     |
| Template Testing            | ALL GREEN    | Test runner + export working                    |
| Load Test Dashboard         | ALL GREEN    | Real loadTestService (dev only)                 |
| Alerts Page                 | ALL GREEN    | Acknowledge/snooze/resolve working              |
| Data Lifecycle (most tabs)  | MOSTLY GREEN | Overview, Cleanup, Deleted Entities all working |

---

## Remaining Action Items

### Phase 3 — Replace Mock Data (medium effort)

- Replace AnalyticsDashboard mock data with real Supabase queries
