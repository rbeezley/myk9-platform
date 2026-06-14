# Check-In Report — Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Route:** `/secretary/check-in`
**Sidebar:** New entry under "Manage" section

## Overview

A dedicated secretary page providing a central view of check-in status across all entries for a show. Secretaries can see who has self-checked in, who still needs to check in, and perform check-ins directly. The page updates in real time as exhibitors self-check-in on their phones.

## Decisions

| Decision           | Choice                                | Rationale                                                                                                                                  |
| ------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope              | Show-level with trial filter          | Secretaries think about the whole show on check-in day, but need to drill into a specific trial when things get busy                       |
| Location           | Dedicated `/secretary/check-in` route | Check-in is a primary show-day workflow — often open all day on a tablet at the check-in table. Own sidebar entry for one-click access     |
| Layout             | Unified list with filters             | Single scrollable list sorted by urgency, no tab switching. Status/trial/search filters narrow the view                                    |
| Card detail        | Expand on click                       | Compact summary by default (armband, name, dog, x/y checked in). Click to expand and see per-class status with individual check-in buttons |
| Multi-dog handlers | One card per dog                      | Armbands are per-dog. Sarah Mitchell with Buddy (#142) and Daisy (#143) gets two cards. Matches the armband mental model                   |
| Undo check-in      | Via existing StatusPickerDialog       | No separate undo UI. The StatusPickerDialog already handles all 8 status transitions                                                       |
| Real-time          | Supabase subscription                 | Instant updates (~1-2s) using existing `useCheckInStatusSubscription` pattern. Cards update live as exhibitors self-check-in               |
| Colors             | Canonical `@myk9/core` status colors  | Same colors as StatusPickerDialog — teal for checked-in, gray for no status, etc. No custom color scheme                                   |

## Data Model

No new tables. Queries existing data:

- **`entries`** — `check_in_status`, `armband`, `handler` (via people join)
- **`classes`** — element, level, section, trial_id
- **`trials`** — trial_date, trial_number
- **`dogs`** — call_name, breed
- **`armbands`** — armband_number (authoritative source)

### Query Shape

```sql
-- Conceptual query (implemented as Supabase PostgREST)
SELECT
  e.id, e.check_in_status, e.class_id,
  a.armband_number,
  d.call_name, d.breed_name,
  p.first_name, p.last_name,
  c.element, c.level, c.section,
  t.trial_date, t.trial_number, t.id as trial_id
FROM entries e
JOIN armbands a ON a.dog_id = e.dog_id AND a.show_id = :showId
JOIN dogs d ON d.id = e.dog_id
JOIN people p ON p.id = e.handler_id
JOIN classes c ON c.id = e.class_id
JOIN trials t ON t.id = c.trial_id
WHERE t.show_id = :showId
ORDER BY a.armband_number
```

### Exhibitor Grouping

Entries are grouped client-side by `dog_id + handler_id` (which maps 1:1 to armband). Each group becomes one card:

```typescript
interface ExhibitorCheckInGroup {
  armbandNumber: number;
  handlerName: string;
  dogName: string;
  dogBreed: string;
  entries: {
    entryId: string;
    classId: string;
    className: string; // "Sat T1: Buried Novice"
    checkInStatus: string; // from @myk9/core CHECKIN_STATUS
    trialId: string;
  }[];
  // Derived
  totalEntries: number;
  checkedInCount: number; // status !== 'no-status' && status !== 'none'
  summaryStatus: 'none' | 'partial' | 'checked-in';
}
```

### Summary Status Derivation

- **none** — all entries have `no-status` / `none`
- **checked-in** — all entries have a non-none status (checked-in, at-gate, in-ring, completed, etc.)
- **partial** — mix of checked-in and not-checked-in entries

## Page Layout

```
┌─────────────────────────────────────────────────────┐
│  Check-In                          ● Live · 5s ago  │
│  Spring Scent Work Trial · Saturday, April 12       │
├─────────────────────────────────────────────────────┤
│  ┌─ Progress Bar ─────────────────────────────────┐ │
│  │ ████████████████████░░░░░░░░  35/47 · 74%      │ │
│  │ ● Checked In 27  ● Partial 8  ● Not Ch'd In 12│ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  [🔍 Search name/armband] [All Trials ▾] [Needs Action · Done · All] │
│                                                     │
│  ┌─ #142 Sarah Mitchell ── Buddy · 0/3 ── [Check In All] ─┐ │
│  │  (collapsed, gray left border)                          │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─ #108 Tom Rivera ── Max · 2/4 ── [Check In Rest] ──────┐ │
│  │  (expanded, orange left border)                         │ │
│  │    ● Sat T1: Containers Nov          ✓ Self check-in   │ │
│  │    ● Sat T1: Interior Nov            [Check In]        │ │
│  │    ● Sat T2: Containers Nov          ✓ Secretary       │ │
│  │    ● Sat T2: Interior Nov            [Check In]        │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─ #215 Jenny Park ── Luna · 4/4 ── ✓ ───────────────────┐ │
│  │  (collapsed, teal left border, dimmed)                  │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Components

### CheckInReportPage

Page shell. Owns the show context, renders header, progress bar, filters, and exhibitor list.

- **Route:** `/secretary/check-in`
- **Access:** `SECRETARY` or `SITE_ADMIN` role via `ProtectedRoute`
- **Show context:** Uses the active show from the secretary's show selection (same pattern as other secretary pages)

### CheckInProgressBar

Segmented horizontal bar showing check-in progress.

- Three segments: checked-in (teal `--checkin-checked-in`), partial (orange `--checkin-conflict`), not checked in (gray `--checkin-none`)
- Legend below with counts for each group
- Percentage label on right
- Animates segment widths on data changes (`transition: width 0.5s`)

### CheckInExhibitorCard

Expandable card for one dog/handler/armband combination.

**Collapsed state:**

- Left border color based on `summaryStatus`: none → gray, partial → orange, checked-in → teal
- Armband badge, handler name, dog name, "x/y checked in" subtitle
- Action button: "Check In All" (if none checked in), "Check In Rest" (if partial), checkmark (if all done)
- Chevron indicating expandability
- Checked-in cards dimmed (opacity 0.7)

**Expanded state:**

- Same header as collapsed (with chevron flipped)
- Below header: list of `CheckInClassRow` components, indented under the armband badge

**Click behavior:** Click anywhere on the card header to toggle expand/collapse. Action buttons stop propagation (clicking "Check In All" doesn't toggle the card).

### CheckInClassRow

Single class entry within an expanded card.

- Status dot using the class's actual `check_in_status` color from `@myk9/core` config (`getCheckinStatusConfig(status).colorVar`)
- Class display name: `"{day} T{trialNumber}: {element} {level}"` (section shown only for Novice per existing `shouldShowSection` helper)
- Right side: either a "Check In" outline button (if not checked in) or attribution text ("Self check-in" / "Secretary") with checkmark

### Filters

**Search:** Shared `SearchBar` component, filters by handler name, dog name, or armband number. Client-side filtering on the grouped data.

**Trial dropdown:** Standard `<Select>` with "All Trials" default + one option per trial ("Sat T1", "Sat T2", etc.). Filters entries within each group — groups with no matching entries are hidden.

**Status toggle:** Segmented button group with three options:

- "Needs Action" (count) — shows only `none` and `partial` groups. Default active state.
- "Done" (count) — shows only `checked-in` groups
- "All" (count) — shows everything

## Actions

### Check In All / Check In Rest

Batch-checks-in all unchecked entries for a dog. Updates `check_in_status` to `'checked-in'` for each entry via the replication layer (`replicatedEntriesTable.updateEntry()`).

- Optimistic: immediately update React Query cache, move card to checked-in state
- On error: rollback via query invalidation
- Button text adapts: "Check In All" when 0 checked in, "Check In Rest" when partially checked in

### Per-Class Check In

Individual check-in button in expanded class rows. Same mutation as above but for a single entry.

### Attribution

The expanded view shows who performed the check-in. This requires tracking the check-in source:

- **Option A (simple):** Infer from context — if the entry was checked in while the secretary page was not the active session, assume "Self". This is imprecise.
- **Option B (accurate):** Add a `checked_in_by` column to entries (or a `check_in_source` enum: 'self' | 'secretary' | 'gate_steward'). This requires a migration.

**Recommendation:** Start with Option A for v1 — show "Self check-in" for entries that were already checked in when the page loaded or updated via real-time subscription, "Secretary" for entries checked in from this page. Track with local state (a `Set<entryId>` of entries checked in by the secretary this session). Add proper `checked_in_by` tracking as a follow-up if the distinction matters enough.

## Real-Time

Uses Supabase real-time subscription on the `entries` table filtered by `show_id` (via class→trial→show join). On any `UPDATE` event where `check_in_status` changed:

1. Invalidate the check-in report query key
2. React Query refetches, UI updates
3. Progress bar animates to new percentages
4. Cards re-sort if their summary status changed

Pattern matches existing `useCheckInStatusSubscription` but scoped to show-level instead of class-level.

## Reused Infrastructure

| Existing                                 | Used For                     |
| ---------------------------------------- | ---------------------------- |
| `check_in_status` column (migration 092) | Status data                  |
| `@myk9/core` CHECKIN_STATUS config       | Colors, icons, labels        |
| `getCheckinStatusConfig()`               | Per-status color/icon lookup |
| `shouldShowSection()`                    | Class name formatting        |
| `SearchBar`                              | Search filter                |
| `PageShell`, `PageHeader`                | Page structure               |
| `replicatedEntriesTable.updateEntry()`   | Check-in mutations           |
| Supabase real-time subscriptions         | Live updates                 |
| React Query + `queryKeys` factory        | Data fetching and caching    |

## New Files

| File                                                             | Responsibility                           |
| ---------------------------------------------------------------- | ---------------------------------------- |
| `src/pages/CheckInReportPage.tsx`                                | Page component                           |
| `src/components/checkin/CheckInProgressBar.tsx`                  | Progress bar                             |
| `src/components/checkin/CheckInExhibitorCard.tsx`                | Expandable exhibitor card                |
| `src/components/checkin/CheckInClassRow.tsx`                     | Per-class row in expanded card           |
| `src/hooks/queries/useCheckInReport.ts`                          | React Query hook — fetch + group entries |
| `src/hooks/useCheckInSubscription.ts`                            | Show-level real-time subscription        |
| `src/components/checkin/__tests__/CheckInProgressBar.test.tsx`   | Progress bar tests                       |
| `src/components/checkin/__tests__/CheckInExhibitorCard.test.tsx` | Card tests                               |
| `src/components/checkin/__tests__/CheckInClassRow.test.tsx`      | Class row tests                          |
| `src/pages/__tests__/CheckInReportPage.test.tsx`                 | Page integration tests                   |
| `src/hooks/queries/__tests__/useCheckInReport.test.ts`           | Hook tests                               |

## Modified Files

| File                                 | Change                                    |
| ------------------------------------ | ----------------------------------------- |
| `src/routes/secretaryRoutes.tsx`     | Add `/secretary/check-in` route           |
| `src/config/unifiedSidebarConfig.ts` | Add "Check-In" entry under Manage section |
| `src/lib/queryClient.ts`             | Add `checkInReport` query key factory     |

## Testing

- **Unit tests** for each component: rendering states (collapsed/expanded, all status combinations), click handlers, filter logic
- **Hook tests** for `useCheckInReport`: grouping logic, summary status derivation, filter application
- **Integration test** for `CheckInReportPage`: full page render with mock data, search/filter interaction, expand/collapse

## Future Enhancements (Out of Scope)

- `checked_in_by` column for accurate attribution tracking
- Print-friendly check-in roster
- Bulk check-in by trial ("Check in all for Trial 1")
- QR code / barcode scanning for armband-based check-in
- Polling fallback for unreliable WiFi at venues
