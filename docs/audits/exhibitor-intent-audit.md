# Exhibitor Role Intent Audit

**Date:** 2026-03-02
**Auditor:** Claude (code analysis + visual walkthrough)
**Role Intent Word:** "This respects my time"
**Scope:** 12 exhibitor-facing pages, 1 sidebar, supporting modules + live visual audit

---

## Executive Summary

**Overall intent health: Needs Work**

The exhibitor experience has strong bones -- good information architecture, smart defaults in registration, plain-English empty states, and an excellent checkout success page. But two critical issues undermine the core promise of respecting the exhibitor's time: the dashboard shows fake data, and half the sidebar links lead nowhere. Across every screen, buttons are too small and text too tiny for the retired, tablet-using audience this platform serves.

**By the numbers:**
- **30 findings** total (2 critical, 8 high, 11 medium, 9 low)
- **47% of interactive elements** fail the 44px touch target minimum
- **13+ instances** of text below the 14px font floor
- **~8 sidebar links** route to pages that do not exist
- **10+ positive patterns** already aligned with intent

---

## Critical Findings

### 1. Dashboard shows fabricated data

**ExhibitorDashboard.tsx, lines 67-112**

The entire dashboard uses hardcoded mock data: a fake user name ("Alex"), fake win rates (78%), fake placement history ("2nd Place"), and fabricated entry counts. An exhibitor arriving at their dashboard sees someone else's numbers. This is the single largest violation of "this respects my time" -- the screen is actively misleading.

The "Edit Entry" and "View Results" buttons render but have no onClick handlers. They do nothing when tapped.

### 2. Sidebar links to ~8 non-existent routes

**ExhibitorSidebar.tsx, lines 48-157**

Navigation items for Health Records, Training Log, Entry Forms, Show Standards, Help Center, Entry History, Results, and My Account point to routes that do not exist. An exhibitor tapping these links encounters a 404 or blank page. Dead navigation is actively disrespectful of time.

---

## High-Priority Findings

| # | Finding | Where | Principle Violated |
|---|---------|-------|-------------------|
| 3 | Dead "Edit Entry" and "View Results" buttons on dashboard | ExhibitorDashboard.tsx:408-472 | 1-2 tap actions |
| 4 | No "Results" or "Completed" tab on My Entries page | MyEntriesPage:157-165 | "There it is" |
| 5 | "Enter a Show" links to `/shows/browse` (may be broken; actual route is `/shows`) | MyEntriesPage:130-133 | 1-2 tap actions |
| 6 | `size="sm"` buttons produce 32px height across 10+ locations | BrowseShowsPage, CartPage, BrowseDogsPage, RegistrationWizardPage | Min 44px touch targets |
| 7 | "Clear all" filter buttons are 24px tall with 12px text | BrowseShowsPage:497, BrowseDogsPage:239 | Min 44px; min 14px font |
| 8 | View mode toggle buttons (Grid/List/Calendar) are 32px tall | BrowseShowsPage:600, BrowseDogsPage:302 | Min 44px touch targets |
| 9 | CSS files have 30+ instances of 10-13px fonts affecting exhibitor pages | myk9-show-details.css, myk9-user-details.css, myk9-table.css | Min 14px font floor |
| 10 | Registration wizard requires 5 steps for 1 dog in 1 class | RegistrationWorkflow.constants.tsx | "That took 30 seconds" |

---

## Medium-Priority Findings

| # | Finding | Where |
|---|---------|-------|
| 11 | No "Enter a Show" quick action on dashboard | ExhibitorDashboard.tsx |
| 12 | Error messages may expose raw API errors (BrowseShows, Cart) | BrowseShowsPage:304, CartPage:84 |
| 13 | Registration "No show selected" state strands user with no navigation | RegistrationWizardPage:513-518 |
| 14 | `text-xs` (12px) used in 10+ places across exhibitor pages | Dashboard, BrowseShows, BrowseDogs, Sidebar |
| 15 | Sidebar nav items ~40px tall, below 44px minimum | ExhibitorSidebar.tsx:234 |
| 16 | Check-in button has hover-only feedback (no touch/focus state) | MyEntryCard.tsx:112 |
| 17 | DogDetailPage delete handler may lack confirmation dialog | DogDetailPage.tsx:42-46 |
| 18 | Registration-to-entry path is 4-5 taps from dashboard | Architectural |
| 19 | CartPage "Clear Cart" and back buttons undersized at 32px | CartPage.tsx:128, 157 |
| 20 | Registration back button undersized at 32px | RegistrationWizardPage.tsx:387 |
| 21 | Exhibitor name derived from email prefix ("john.doe.123") | MyEntriesPage:315 |

---

## Low-Priority Findings

| # | Finding | Where |
|---|---------|-------|
| 22 | Dashboard `h-3 w-3` (12px) icons hard to read | ExhibitorDashboard.tsx:173-372 |
| 23 | Dashboard card hover animations inaccessible on touch | ExhibitorDashboard.tsx:204-567 |
| 24 | DogDetailPage loading state has no skeleton | DogDetailPage.tsx:49 |
| 25 | DogDetailPage silent redirect on access denial | DogDetailPage.tsx:34-40 |
| 26 | ShowDetailsPage uses inconsistent button component | ShowDetailsPage.tsx:155 |
| 27 | Loading states use generic spinners, not page-shaped skeletons | ShowDetailsPage.tsx:137, MyEntriesPage:94 |
| 28 | Sidebar footer description text at 12px | ExhibitorSidebar.tsx:285 |
| 29 | BrowseShowsPage tab count badges at 12px | BrowseShowsPage.tsx:675 |
| 30 | ShowDetailsPage "Back to Shows" button may have inconsistent touch target | ShowDetailsPage.tsx:155-156 |

---

## Positive Findings (Already Aligned)

These patterns are doing the right thing. Protect them.

| What | Where | Why It Matters |
|------|-------|---------------|
| Registration smart defaults (auto-assign handler, auto-calculate fees) | RegistrationWorkflow.constants.tsx | Pre-fills what the system knows |
| Draft auto-save every 30 seconds | RegistrationWizardPage.tsx:114-117 | Never lose work |
| MyEntryCard buttons use `min-h-[44px]` | MyEntryCard.tsx:137-160 | Correct touch targets |
| CheckoutSuccessPage with "What happens next?" guidance | CheckoutSuccessPage.tsx:260-290 | Reduces post-purchase anxiety |
| CheckoutCancelPage preserves cart + reassuring message | CheckoutCancelPage.tsx:30-81 | Respects effort already spent |
| BrowseDogsPage slide-out panel for adding dogs | BrowseDogsPage.tsx:326-332 | Keeps user in context |
| ShowDetailsPage 1-tap registration path | ShowDetailsPage.tsx:128-132 | Fast path to entry |
| Cart "Continue Shopping" returns to specific show | CartPage.tsx:91-97 | Smart context preservation |
| Empty states use plain English with clear CTAs | Multiple pages | No dead ends |
| No confirmation dialogs for routine actions | All exhibitor pages | Doesn't slow routine work |

---

## Visual Audit Results (Live Preview)

### Touch Target Measurements

| Page | Total Interactive Elements | Below 44px | Failure Rate |
|------|---------------------------|-----------|-------------|
| Browse Shows | 18+ | 18 | ~100% |
| Exhibitor Dashboard | 30 | 14 | 47% |
| Dogs Page | ~12 | ~6 | ~50% |

The header icons (hamburger, search, notifications, theme, avatar) are 32x32px on every page -- below minimum on every screen the exhibitor visits.

### Font Size Violations

On the Browse Shows page alone, 13 text elements render at 12px (Tailwind `text-xs`), including button labels, status badges, and filter text that exhibitors need to read.

---

## Recommendations (Priority Order)

### Quick Wins (high impact, low effort)

1. **Replace `size="sm"` with `size="default"`** on all exhibitor-page buttons. One global search-and-replace in 5 files fixes 10+ touch target violations.
2. **Replace `text-xs` with `text-sm`** across exhibitor pages. Same approach, fixes 10+ font-size violations.
3. **Increase "Clear all" filter buttons** from `h-6` to `h-10` and `text-xs` to `text-sm`.
4. **Fix `/shows/browse` link** to `/shows` in MyEntriesPage (likely broken route).

### Structural Fixes

5. **Replace mock data in ExhibitorDashboard** with real entries from React Query hooks.
6. **Remove or mark dead sidebar routes** as "Coming Soon" with a subtle badge.
7. **Wire up or remove dead buttons** (Edit Entry, View Results on dashboard).
8. **Add a "Results" / "Completed" tab** to MyEntriesPage.

### Bigger Improvements

9. **Add "Enter a Show" quick action** on the exhibitor dashboard.
10. **Audit all CSS files** (`myk9-show-details.css`, `myk9-user-details.css`, `myk9-table.css`) to bring font sizes to 14px minimum.
11. **Consider a "quick entry" flow** for the common case (1 dog, 1 class) that collapses the 5-step wizard.
12. **Sanitize error messages** -- wrap `getErrorMessage()` and Stripe errors in user-friendly fallbacks.

---

## How to Use This Audit

- **Before fixing:** Check if the finding has an `// INTENT:` comment explaining why it's that way.
- **After fixing:** Re-run the touch-target and font-size checks to verify the fix landed.
- **For new screens:** Use the intent litmus test (docs/INTENT.md, Section 4) before shipping.
- **Next audit:** Run the same checks on the secretary role (highest stress, most to lose).
