# Class Results Card View — Design Spec

**Date:** 2026-03-26
**Status:** Draft
**Scope:** Add card/table view toggle to ClassResultsTable on the Class Details page

## Overview

Add a myK9Q-style card view alongside the existing table view in ClassResultsTable. Cards display entry summaries (armband, dog, breed, handler, status badge). Clicking a card navigates to the scoresheet page for that entry. The view toggle persists preference to localStorage.

## Design Decisions

- **Approach A selected:** Cards live inside ClassResultsTable, not as a sibling component. One component owns both views, shares the same data/props.
- **Cards are read-only:** No inline scoring. Click navigates to the scoresheet page (`/scoring/classes/:classId/entries/:entryId` for judges, `/scoring/secretary/classes/:classId/entries/:entryId` for secretaries).
- **Status badges are display-only for now:** The full check-in status system (interactive status toggle, role-aware options, database field) is a separate future todo. Until that lands, all entries show "No Status".
- **Pending/Completed tabs are a separate todo:** Todo #16 adds tab filtering. Cards will work with whichever tab is active once that lands.

## Card Layout

Each card matches the myK9Q `SortableEntryCard` design:

```
┌─────────────────────────────────────────────┐
│  ┌──────┐  Dog Name          [Status Badge] │
│  │ 107  │  Breed                            │
│  └──────┘  Handler: Name                    │
└─────────────────────────────────────────────┘
```

- **Armband badge:** Accent-colored (`--accent` / primary) rounded square (`border-radius: 10px`), 48x48px, white bold text, left-aligned.
- **Dog name:** Semi-bold, primary text color, 15px.
- **Breed:** Muted text, 13px.
- **Handler:** Secondary muted text, 12px, prefixed with "Handler:".
- **Status badge:** Top-right, pill-shaped (`border-radius: 6px`), 11px bold text. Color-coded by status.
- **Card:** `bg-card` background, `border border-border` with `rounded-xl` (12px), 16px padding. Hover: border transitions to accent color.
- **Click:** Entire card is clickable, navigates to scoresheet page.

### Status Badge Colors

| Status       | Background            | Text             | Icon |
| ------------ | --------------------- | ---------------- | ---- |
| No Status    | zinc-700 (`bg-muted`) | muted-foreground | —    |
| Checked-in   | green-600             | white            | ✓    |
| Conflict     | orange-500            | white            | ⚠    |
| Pulled       | red-500               | white            | ✕    |
| Come to Gate | accent/primary        | white            | ✦    |
| At Gate      | sky-500               | white            | ★    |
| In Ring      | amber-500             | white            | ●    |

### Responsive Grid

| Breakpoint              | Columns   |
| ----------------------- | --------- |
| Mobile (`< 640px`)      | 1 column  |
| Tablet (`640px–1023px`) | 2 columns |
| Desktop (`≥ 1024px`)    | 3 columns |

Gap: 12px (`gap-3`).

## View Toggle

Uses the existing `useViewPreference` hook and `ViewToggle` component:

```typescript
const [viewMode, setViewMode] = useViewPreference('class-results', 'table');
```

The toggle renders in the ClassResultsTable header bar, next to the existing action buttons (Requirements, Enter Scores, Add Entry). Uses the icon-only pattern (grid icon for cards, table icon for table).

Default view: **table** (preserves current behavior).

## Navigation on Card Click

Card click navigates to the scoresheet page. The route depends on the user's role:

- **Judge:** `/scoring/classes/:classId/entries/:entryId` (live scoresheet with stopwatch)
- **Secretary:** `/scoring/secretary/classes/:classId/entries/:entryId` (entry scoresheet, keyboard-optimized)

Role is determined from `userPermissions` prop already available in ClassResultsTable. If the user has `canEditEntries` (secretary/admin), use the secretary route. Otherwise, use the judge route.

## New Files

All files in `apps/myk9show/src/components/classes/ClassResultsTable/`:

| File                   | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `EntryCard.tsx`        | Single entry card component             |
| `EntryCardGrid.tsx`    | Responsive grid of EntryCard components |
| `entryStatusConfig.ts` | Status badge color/icon/label mapping   |

## Data Flow

No new data fetching. Cards use the original `ScentWorkEntry[]` passed as `entries` prop to ClassResultsTable (not the derived `BulkEntryData` used by the table's edit mode). Each card reads:

- `entry.displayInfo.armband` — armband number
- `entry.displayInfo.dogName` — dog's call name
- `entry.displayInfo.dogBreed` — breed
- `entry.displayInfo.handlerName` — handler name
- Status: not yet available — defaults to "No Status" until check-in system todo

The `EntryCardGrid` receives the raw `ScentWorkEntry[]` and `classId`, not `BulkEntryData[]`. This avoids coupling the read-only card view to the bulk-edit data model.

## Changes to Existing Files

| File                          | Change                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ClassResultsTable/index.tsx` | Add `useViewPreference` + `ViewToggle` in header. Conditional render: table view → existing `DataTable`, card view → `EntryCardGrid`. |
| `ClassResultsTable/types.ts`  | Add `EntryStatus` type enum if needed for badge config.                                                                               |

## Testing

- `EntryCard.test.tsx` — renders armband, dog name, breed, handler, status badge; click triggers navigation; hover shows accent border.
- `EntryCardGrid.test.tsx` — renders correct number of cards; passes entry data to each card.
- `ClassResultsTable` integration — view toggle switches between table and card; preference persists via localStorage.

## Future Integration Points

- **Pending/Completed tabs (todo #16):** Tabs will filter the `entries` array before passing to either view. Cards and table both render whatever filtered list they receive.
- **Check-in status system (future todo):** Status badges become interactive. `EntryCard` gains an `onStatusChange` prop. `entryStatusConfig.ts` already defines all statuses and colors, so no visual rework needed.
- **Drag-and-drop run order (future):** Cards can be wrapped with `@dnd-kit` sortable, same pattern as myK9Q's `SortableEntryCard`.
