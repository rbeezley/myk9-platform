# Unified List/Detail System — Phase 1 (Exhibitor)

**Date:** 2026-03-15
**Status:** Draft
**Scope:** Exhibitor-facing list and detail pages for the Shows → Trials → Classes → Entries hierarchy, plus shared primitives extracted during the build.

---

## Problem

myK9Show's pages lack structural consistency. Each page rolls its own header, spacing, empty states, loading skeletons, and error handling. The result is a 6/10 consistency score — the layout infrastructure (AppLayout, SidebarLayout, UnifiedAppLayout) works well, but page-level patterns are ad-hoc.

For our primary audience — retired, non-tech-savvy dog show exhibitors — every inconsistency becomes a moment of confusion. Consistency is not a nice-to-have; it is an accessibility requirement.

Additionally, several features built for power users (4 view modes, saved views, bulk actions) add cognitive overhead that exhibitors do not need. The current BrowseShowsPage is 703 lines and exposes every feature to every user.

## Goals

1. Establish a consistent list/detail pattern that cascades from Shows down through Trials, Classes, and Entries.
2. Extract shared primitives from the Shows pages so every future page follows the same structure automatically.
3. Simplify the exhibitor experience — fewer controls, larger touch targets, plain language.
4. Port proven UX patterns from myK9Q (live class cards, pending/completed tabs, run order with status).
5. Make "How many dogs until mine?" answerable in under 2 seconds from any screen.

## Non-Goals (Phase 2)

- Secretary/admin enhancements (bulk actions, saved views, draft management, show creation)
- Applying the system to Dogs, Clubs, and People pages
- Dashboard consistency
- Additional filter types beyond what exhibitors need

---

## Design Decisions

### List/Detail Navigation

The list/detail pattern is the backbone of the app. It maps to how exhibitors think: "I want to find a show → tell me about this show → show me the classes → who's in this class?"

To keep navigation shallow, nested entities live as tabs on their parent's detail page rather than as separate routes. An exhibitor reaches their entry's run-order position in 2-3 taps: tap a show → tap a class (on the default "My Entries" tab) → see the entry list. If the show detail page defaults to "Overview" instead, add one more tap for the Classes/My Entries tab.

| Entity  | Presentation                                   | Why                                                    |
| ------- | ---------------------------------------------- | ------------------------------------------------------ |
| Shows   | Separate list page + separate detail page      | Top-level entity, needs its own URL for sharing/search |
| Trials  | Tabs or sections on the show detail page       | Only 2-4 per show — not worth a separate page          |
| Classes | Tab on the show/trial detail page              | High volume (24-48+), but lives within show context    |
| Entries | Tab on a class detail view, or expand-in-place | Always viewed within a class                           |

### View Modes: From 4 to Context-Driven Defaults

Grid and list views are nearly identical and add decision fatigue. View modes are now driven by data volume, not user preference:

| Entity  | Default View | Also Available  | Why                                                       |
| ------- | ------------ | --------------- | --------------------------------------------------------- |
| Shows   | Cards        | Table, Calendar | Few items (5-20), visual context helps decision-making    |
| Trials  | Cards        | —               | So few (2-4) that cards always work                       |
| Classes | Table        | LiveClassCards  | High volume (24-48+), columns: element, level, time, ring |
| Entries | Table        | —               | Run order, armband, dog, handler, status — always tabular |

Users can still switch views where alternatives exist. The system remembers their preference.

Note: Dogs (Cards only), Clubs, and People pages will follow the same system in Phase 2. The view mode defaults above apply system-wide; they are documented here for completeness even though only Shows/Trials/Classes/Entries are in Phase 1 scope.

**Calendar view** for Shows is existing functionality (already built as `ShowCalendar` component). Phase 1 preserves it as-is — no redesign needed. It is an alternate view on the shows list page, not a separate page.

### Role-Adaptive Complexity

The same underlying components serve every role. The page configures which features to enable:

**Exhibitor sees:** Search, 3 filter chips (discipline, date, location), cards view, "Mine" toggle. No bulk actions, no saved views, no tabs.

**Secretary/admin sees (Phase 2):** All filters, view mode toggle, tabs (All/My Shows/Drafts/Past), bulk selection, saved views, create button.

### The "Mine" Toggle

A simple two-state toggle ("All" / "Mine") that works at every level of the hierarchy:

| Level   | "All" label      | "Mine" label   | "Mine" default?                     |
| ------- | ---------------- | -------------- | ----------------------------------- |
| Shows   | All Shows        | My Shows       | No — exhibitor is in discovery mode |
| Classes | All Classes (48) | My Classes (6) | Yes — inside a show, show me mine   |
| Entries | All Entries (28) | My Dogs (2)    | No — need to see run order position |

On the entries list, even when "All Entries" is selected, the exhibitor's dogs are visually highlighted (orange left border + "YOU" badge) so they can instantly find their position.

**How "Mine" is determined:** The toggle filters by the authenticated user's entries — any entry where the user is the registered handler or owner. The query joins the `entries` table against the user's `people.id`. For unauthenticated users (e.g., someone viewing a shared show URL), the "Mine" toggle is hidden and the page shows "All" by default. When an exhibitor has no entries at a given level, the "Mine" side of the toggle shows "(0)" and selecting it displays the EmptyState: "You don't have any entries in this show yet" with a "Browse Classes" CTA.

### "X Dogs Ahead" Indicator

Wherever an exhibitor's entry appears — on a class card, in the entry list, on the "My Entries" dashboard — the system shows a live countdown:

> **5 dogs ahead** → **3 dogs ahead** → **You're next!** → **In Ring**

This updates in real time using the existing Supabase real-time subscriptions and the adaptive timing system already built in `useShowDayData`. The indicator answers the exhibitor's primary question without requiring them to open the full run order.

**Offline behavior:** When the connection drops, the indicator freezes at its last known value and a subtle "Updated X ago" label appears beneath it (same pattern as myK9Q's stale data warning). No error modals, no "No internet" messages — per INTENT.md, offline is normal, not broken. When the connection returns, the count resumes updating silently.

### Entry List: Pending/Completed Tabs

Ported from myK9Q's proven UX, but using tabs instead of an inline separator:

**Pending tab:** Dogs that haven't run yet, in run order. The in-ring dog is pinned to the top with a prominent highlight. Each entry shows armband, dog name, handler, check-in status.

**Completed tab:** Dogs that have run, with results (Q/NQ), times, placements, and faults. This tab answers "How did we do?" without cluttering the run order view.

Each entry has a color-coded left border indicating status at a glance: checked in (green), not checked in (gray), at gate (yellow), in ring (blue), pulled (red).

### URL/Routing Strategy

Show detail tabs are URL-driven using search params (consistent with the existing BrowseShowsPage pattern): `/shows/:id?tab=classes`, `/shows/:id?tab=my-entries`. This allows deep-linking and browser back/forward to work with tabs. The default tab (determined by whether the user has entries) is used when no `?tab` param is present.

---

## Shared Primitives

These components are extracted from the Shows pages during the build. Every list and detail page uses them.

### Page Structure

| Component    | Purpose                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `PageShell`  | Consistent container: max-w-7xl, horizontal padding, vertical spacing. Replaces ad-hoc wrappers.                 |
| `PageHeader` | Breadcrumb + sr-only title + optional action buttons. Standard on every page.                                    |
| `DetailHero` | Header card for detail pages: entity name, key metadata, primary action. Reused on Show, Dog, Club detail pages. |

Note: No existing `PageShell`, `PageHeader`, or `DetailHero` components exist in the codebase. These are new. The existing `SkeletonPageHeader` in `components/base/SkeletonLoaders.tsx` is a loading skeleton, not a layout component.

### List Page Components

| Component      | Purpose                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `SearchBar`    | Prominent search input with 48px touch target. Same look on every list page. |
| `FilterChips`  | Horizontal pill-style filters. Role-configurable — exhibitor gets fewer.     |
| `MineToggle`   | "All / Mine" segmented control. Remembers user preference per entity type.   |
| `ViewToggle`   | Cards / Table (/ Calendar) switcher. Only shown when multiple views apply.   |
| `ResultsCount` | "12 shows" or "6 of 48 classes (filtered)". Always visible below filters.    |

### State Components

| Component         | Purpose                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `EmptyState`      | Friendly message + CTA. Configured per context ("No shows found" vs "No entries yet").     |
| `ErrorState`      | Plain-English error + retry button. "We couldn't load the shows. Tap to try again."        |
| `LoadingSkeleton` | Matches actual content shape. Cards skeleton or table skeleton based on current view mode. |
| `NotFoundState`   | For detail pages when the entity doesn't exist. Back button + suggestion.                  |

### Live Components (Ported from myK9Q)

| Component       | Purpose                                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LiveClassCard` | Status badge (pulsing when active), progress bar, in-ring dog, next 3 armbands, remaining count, "X dogs ahead" for exhibitor's entries. Stale data warning when offline.        |
| `EntryRow`      | Armband badge + dog name + handler + status badge. Color-coded left border. "YOU" badge for exhibitor's dogs. Reused in pending tab, completed tab, and anywhere entries appear. |

---

## Page Structures

### Shows List Page (BrowseShowsPage — refactored)

```
PageShell
  PageHeader (breadcrumb: Home / Shows)
  SearchBar ("Search shows by name, location, or club...")
  FilterChips (discipline, date range, location)
  MineToggle ("All Shows" / "My Shows")
  ResultsCount ("12 shows")

  // Content:
  CardGrid (show cards — name, dates, location, club, entry status badge)
    — or —
  DataTable (for users who switch to table)
    — or —
  Calendar (for users who switch to calendar)

  // States:
  LoadingSkeleton | EmptyState | ErrorState
```

Each show card displays: show name, dates, location, club name, entry status badge (Open / Closing Soon / Closed). One clear action: tap to view details.

### Show Detail Page (ShowDetailsPage — refactored)

```
PageShell
  PageHeader (breadcrumb: Home / Shows / [Show Name], actions: Register)
  DetailHero
    Show name, dates, location, club
    Entry status + deadline
    Register button (prominent, 48px target)

  Tabs
    Overview    — show description, venue info, judges, schedule summary
    Classes     — MineToggle + table (element, level, time, ring, status, entries)
                  LiveClassCards toggle for show-day view
    My Entries  — exhibitor's entries with "X dogs ahead" indicators
    Results     — completed classes with scores (after show)
```

**Default tab:** When an exhibitor has entries in this show, the detail page defaults to "My Entries" — they came here to check on their dogs, not read the show description. When they have no entries (browsing a show they might enter), it defaults to "Overview."

**Unauthenticated users** (e.g., someone who received a shared show URL) see Overview and Classes tabs only. My Entries and Results tabs require authentication. A gentle prompt ("Sign in to see your entries") appears if they try to access those tabs.

The Classes tab defaults to "My Classes" when the exhibitor has entries, showing their 6 classes out of 48. The "All Classes" toggle reveals the full table.

When a class row is expanded or tapped, it shows the entry list with Pending/Completed tabs.

### My Entries Tab (on Show Detail)

The "My Entries" tab groups the exhibitor's entries by class, each shown as a card:

```
My Entries (6 classes)

[LiveClassCard: Novice JWW]
  Bella #148 — 3 dogs ahead
  Status: Checked In

[LiveClassCard: Open Standard]
  Bella #148 — Not started yet
  Status: Checked In

[LiveClassCard: Novice JWW]
  Duke #203 — 8 dogs ahead
  Status: Not Checked In
  ...
```

Each card shows the class name, the dog's armband, their live position ("X dogs ahead" / "You're next!" / "In Ring" / result), and check-in status. Tapping a card opens the full entry list for that class.

### Entry List (within a class)

```
MineToggle ("All Entries (28)" / "My Dogs (2)")
"Bella is 3rd up" indicator (when viewing All Entries)

Tabs
  Pending (16)
    In-ring dog (pinned to top, blue highlight)
    Remaining dogs in run order
    Exhibitor's dog highlighted (orange border + "YOU" badge)
    Each row: armband | dog name | breed | handler | check-in status

  Completed (12)
    Each row: armband | dog name | breed | handler | result (Q/NQ) | time | placement
```

---

## Accessibility Requirements

Per INTENT.md, enforced across all primitives:

| Requirement         | Standard                                                                           |
| ------------------- | ---------------------------------------------------------------------------------- |
| Touch targets       | 48px minimum on all interactive elements (INTENT.md baseline is 44px; we use 48px) |
| Font sizes          | 16px body minimum, 14px absolute minimum, never smaller                            |
| Contrast            | WCAG AA minimum, prefer AAA for primary text content                               |
| Hover-only          | No hover-only interactions — everything works on touch                             |
| Gesture-only        | No gesture-only actions — swipe is a shortcut, never the only way                  |
| Error messages      | Plain English, dog show terminology, no software jargon                            |
| Dead ends           | Every screen has an obvious next step or way back                                  |
| Motion              | Purposeful only (state changes), never decorative                                  |
| Outdoor readability | Text large enough to read on a tablet outdoors                                     |

---

## Implementation Strategy

### Step 1: Refactor BrowseShowsPage (Golden Template)

Simplify the existing 703-line page using new shared primitives. Extract PageShell, PageHeader, SearchBar, FilterChips, MineToggle, ViewToggle, ResultsCount, EmptyState, ErrorState, LoadingSkeleton as we go. Reduce view modes from 4 to 3 (Cards, Table, Calendar). Remove grid/list distinction. Wire up role-adaptive feature visibility.

### Step 2: Refactor ShowDetailsPage

Restructure around tabs: Overview, Classes, My Entries, Results. Build the DetailHero component. Wire Classes tab to show table with MineToggle. The entry list within a class uses Pending/Completed tabs.

### Step 3: Build LiveClassCard and EntryRow

Port class card UX from myK9Q: status badge, progress bar, in-ring dog, next 3 armbands, remaining count. Build EntryRow with armband badge, color-coded border, "YOU" indicator. Wire "X dogs ahead" indicator.

### Step 4: Wire Real-Time Updates

Connect LiveClassCard and EntryRow to existing Supabase real-time subscriptions. Integrate with useShowDayData's adaptive timing for estimated wait times. Connect to useShowDayAlerts for notification triggers. Implement offline fallback: freeze at last known value + "Updated X ago" label. No error modals on disconnect.

### Step 5: UX Audit Each Page

Use the UX audit skill (Claude Code `/UX-Audit` command) against INTENT.md and the accessibility requirements table. The audit produces a structured findings document with severity ratings. Fix all critical and major issues before moving to the next page.

### Step 6: Apply to Remaining Hierarchy

Build or refactor any remaining views for Trials (if needed beyond tabs), Classes, and Entries using the extracted primitives. Each page follows the same structure automatically.

---

## Testing

**Tools:** Vitest + React Testing Library for unit/integration tests. Playwright for E2E (existing setup).

**Shared primitives** — unit tests for each (Vitest + RTL):

- PageShell, PageHeader, DetailHero render with required and optional props
- SearchBar fires onChange, meets 48px touch target
- FilterChips render configurable filters, fire selection callbacks
- MineToggle switches state, persists preference, hidden when unauthenticated
- ViewToggle switches views, remembers preference
- EmptyState, ErrorState, NotFoundState render correct message and CTA per context
- LoadingSkeleton matches card vs table shape based on view mode
- LiveClassCard displays status, progress, in-ring dog, next 3, remaining count
- EntryRow displays armband, dog, handler, status; highlights user's dogs with "YOU" badge

**Page integration tests** — each refactored page (Vitest + RTL with mocked queries):

- Loading, error, and empty states render correctly
- MineToggle filters data appropriately
- View mode switching renders the correct content view
- "X dogs ahead" indicator updates when mock data changes
- Pending/Completed tabs show correct entries in each
- Unauthenticated view hides Mine toggle and My Entries tab

**Accessibility** — tested per component:

- Touch target sizes (assert min-height/min-width >= 48px on interactive elements)
- No elements with font-size below 14px
- Keyboard navigation (tab order, enter/space activation)

**Real-time updates** — tested with mocked Supabase channel events:

- LiveClassCard progress bar updates on scoring event
- EntryRow status changes on check-in event
- "X dogs ahead" decrements when entry ahead is scored
- Offline: indicator freezes, "Updated X ago" label appears

---

## Success Criteria

1. An exhibitor can navigate from the shows list to their entry's run-order position in 2-3 taps (tap show → see "My Entries" tab with live position indicators).
2. "How many dogs until mine?" is answerable in under 2 seconds from any screen showing entries.
3. Every list page uses the same shared primitives — no ad-hoc wrappers, headers, or state components.
4. All pages pass WCAG AA contrast, 48px touch targets, 16px minimum font size.
5. The UX audit skill finds no critical or major issues on any refactored page.
