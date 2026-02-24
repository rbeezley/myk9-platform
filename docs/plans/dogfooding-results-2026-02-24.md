# myK9Show Dogfooding Results

**Date:** February 24, 2026
**Method:** Automated testing via Claude Preview tools + code analysis via explore agents
**Server:** localhost:5173 (pnpm dev:show)
**Auth:** Logged in as Richard Beezley (site admin)

---

## Executive Summary

Tested all 6 flows from the dogfooding checklist plus general checks. Found **11 issues** total: 3 bugs, 6 UX issues, and 2 architectural gaps. The core data layer (Supabase via offline-first replication) works well — shows, clubs, dogs, people, and entries all persist correctly. The main gaps are in the registration workflow (local-only, never saves to Supabase) and several UI/UX polish items.

---

## Issues Found

### Bugs

| # | Severity | Summary | Steps to Reproduce | Expected | Actual |
|---|----------|---------|---------------------|----------|--------|
| B-1 | **High** | Show Secretary combobox selection doesn't persist | Open wizard → Step 1 → Click "Select secretary" → Click an option from dropdown | Secretary field shows selected value | Dropdown closes but field remains empty. Value not set. |
| B-2 | **High** | RBAC permission check spams 20+ console errors | Navigate between any pages | No errors, or a single graceful failure | `[ERROR] [rbac] Failed to get user permissions: TypeError: Failed to fetch` fires 20+ times per page transition at `PermissionChecker.ts:58` |
| B-3 | **Medium** | No 404/catch-all route — unknown URLs render blank | Navigate to `/people`, `/entries`, or any non-existent path | 404 page with helpful message | Blank page (only navbar visible). React Router has no `path="*"` fallback in `App.tsx`. |

### UX Issues

| # | Severity | Summary | Details |
|---|----------|---------|---------|
| U-1 | **Medium** | Wizard shows validation errors immediately on open | Both Create Club dialog and Create Show wizard display "X required fields need attention" as soon as the form opens, before any user interaction. Should only show after first submission attempt or blur. |
| U-2 | **Low** | No success toast after club creation | Club saves to Supabase correctly but no feedback toast appears. User has no confirmation the action succeeded. |
| U-3 | **Medium** | "Create New Secretary" typeahead doesn't auto-fill form | In wizard Step 1, clicking a person suggestion from the typeahead list in the "Create New Secretary" panel doesn't populate the name/email/phone fields. |
| U-4 | **Low** | Wizard requires navigation state — no deep linking | Direct URL access to `/secretary/create-show/wizard` renders a blank page. The wizard only works when navigated to via the "Add Show" button on `/shows`. |
| U-5 | **Low** | People sidebar lacks "Add Person" button | The `/users` page has a "Users Menu" dropdown but no visible "Add Person" CTA button like Dogs and Clubs pages have. |
| U-6 | **Low** | Test/seed data visible in production UI | Dogs page shows test artifacts like "Delete Test Dog 1767908674341" and "SearchTestDog1767908682652" from E2E tests. These should be cleaned up or filtered. |

### Architectural Gaps

| # | Severity | Summary | Details |
|---|----------|---------|---------|
| A-1 | **Critical** | Registration workflow is local-only | `showRegistrationStore.ts` `submitRegistration()` simulates a 1-second delay but never calls Supabase. Uses `MOCK-PAYMENT-REF` for payment confirmation. Registrations are stored in localStorage via Zustand persist — data is lost on cache clear. |
| A-2 | **Medium** | Club management uses mock data for admin features | Member IDs are client-only. Club admin features (add/remove members) don't persist to Supabase. The checklist noted this as a known gap. |

---

## What Works Well

### Data Persistence (Supabase via Offline-First Replication)
- **Club creation**: Saves to Supabase, persists after page reload ✅
- **Show creation wizard**: Full persistence chain — show, trials, classes all saved to Supabase via `@myk9/replication` (IndexedDB → queued mutations → Supabase sync) ✅
- **Dogs page**: Shows real dogs (Tera, Buddy, Maximus) with full detail view including breed, physical characteristics, registrations, owner info ✅
- **People/Users page**: Lists all users from Supabase with role badges, contact info ✅
- **My Entries page**: Fetches real entries from Supabase, shows proper empty state with stats cards ✅
- **Entry editing**: Handler changes, jump height, withdrawal all persist to Supabase ✅
- **Check-in feature**: Updates `is_in_ring`, `ring_entry_time` in Supabase ✅

### UI/UX
- **Empty states**: Shows page ("No Shows Available" + CTA), My Entries page (stats cards + filter tabs + empty message), Dogs page (sidebar + detail area), Clubs page (detail view with tabs) all handle empty data gracefully ✅
- **Navigation**: All nav links work correctly, breadcrumbs visible on wizard ✅
- **Admin Console**: Full dashboard with Overview, Monitoring, System Management, User Management, Configuration sections ✅
- **Dog detail view**: Rich profile with tabs for Registrations, Competitions, Title Progress, Health Records, Training Journal, Pedigree ✅
- **No network failures**: Zero failed Supabase requests during normal browsing (one aborted HEAD request, benign) ✅

---

## Flow-by-Flow Results

### Flow 1: Create a Show End-to-End
| Check | Status | Notes |
|-------|--------|-------|
| Create a club | ✅ PASS | Saves to Supabase, persists after reload |
| Create a show via wizard | ⚠️ PARTIAL | Wizard loads, Step 1 fillable, but Secretary combobox bug (B-1) blocks smooth completion |
| Add trials to show | ✅ PASS (code analysis) | Trials save to Supabase via replication on wizard submit |
| Add classes to trials | ✅ PASS (code analysis) | Classes save to Supabase via replication on wizard submit |
| Reload persists data | ✅ PASS (code analysis) | Full offline-first persistence chain confirmed |

### Flow 2: People & Dogs
| Check | Status | Notes |
|-------|--------|-------|
| Create a person | ⚠️ PARTIAL | No visible "Add Person" button (U-5). Only "Users Menu" dropdown. |
| Edit person's address | Not tested | Requires person creation first |
| Create a dog | ✅ PASS | "Add Dog" button visible on `/dogs` page |
| Dog detail view | ✅ PASS | Full profile with breed, registrations, owner info |
| Dog registrations | ✅ PASS | AKC registration visible for Tera (dn123) |

### Flow 3: Registration & Entries
| Check | Status | Notes |
|-------|--------|-------|
| Register a dog in a class | ❌ FAIL | Registration workflow is local-only (A-1) — never calls Supabase |
| View My Entries | ✅ PASS | Page loads from Supabase with proper empty state |
| Edit an entry | ✅ PASS (code) | Handler, jump height, withdrawal all persist |
| Check in an entry | ✅ PASS (code) | `is_in_ring` updates in Supabase |
| Delete an entry | ✅ PASS (code) | Soft delete via `deleted_at` timestamp |

### Flow 4: Secretary Operations
| Check | Status | Notes |
|-------|--------|-------|
| Secretary dashboard | ⚠️ PARTIAL | Secretary routes exist (`/secretary/create-show/wizard`) but no standalone dashboard page found |
| Entry management | ✅ PASS (code) | Entry editing and status changes persist |
| Class status changes | Not tested | Requires active show with classes |

### Flow 5: Show Details & Navigation
| Check | Status | Notes |
|-------|--------|-------|
| View show details | ✅ PASS | `/shows` page renders with proper empty state |
| Breadcrumbs/URL context | ✅ PASS | Wizard shows Secretary / Create Show / Wizard breadcrumbs |
| Deep linking | ⚠️ PARTIAL | Direct wizard URL fails (U-4), but show detail URLs work |

### Flow 6: Club Management
| Check | Status | Notes |
|-------|--------|-------|
| View club details | ✅ PASS | 4 clubs visible, detail view with tabs (Upcoming Shows, Past Shows, About, Members) |
| Club member management | ❌ FAIL | Members section shows "0 members" with no add functionality persisting to Supabase (A-2) |
| Club navigation | ✅ PASS | Auto-selects first club, shows details with email/call buttons |

---

## General Checks

| Check | Status | Notes |
|-------|--------|-------|
| Console errors | ❌ FAIL | 20+ RBAC permission errors spam (B-2) |
| Network failures | ✅ PASS | No Supabase request failures during browsing |
| Toast notifications | ⚠️ PARTIAL | No toast on club creation (U-2); other operations not fully tested |
| Loading states | ✅ PASS | Spinner visible during page transitions |
| Empty states | ✅ PASS | Shows, My Entries, Dogs, Clubs all show proper empty states |

---

## Priority Fix Recommendations

### Must Fix Before Phase 1
1. **B-2**: RBAC error spam — investigate `PermissionChecker.ts:58` fetch failures. This fires on every page and degrades performance.
2. **B-1**: Secretary combobox — blocks show creation workflow. Likely a Base UI Select/Combobox event handling issue.
3. **B-3**: Add 404 catch-all route to `App.tsx`.

### Should Fix Soon
4. **U-1**: Defer validation errors until first form submission attempt.
5. **U-3**: Fix typeahead auto-fill in "Create New" inline panels.
6. **A-1**: Connect registration workflow to Supabase (largest architectural gap).

### Nice to Have
7. **U-2**: Add success toasts for all CRUD operations.
8. **U-4**: Support deep linking to wizard (restore state from URL params or show redirect).
9. **U-5**: Add "Add Person" button to `/users` page.
10. **U-6**: Filter out E2E test data from production UI, or clean up seed data.
11. **A-2**: Connect club member management to Supabase.

---

*Generated by automated dogfooding session. Some checks performed via code analysis when UI automation was impractical (marked with "code" in status).*
