# Card/Table View Toggle for Child List Tabs

**Date:** 2026-03-19
**Status:** Approved

## Overview

Add a card/table view toggle to all child list tabs on ShowDetailsPage: ClassesTab, TrialsTab, and MyEntriesTab. Each tab offers both views with a persisted preference per tab. The existing `ViewToggle` component handles the UI; a new `useViewPreference` hook handles localStorage persistence.

## Design Decisions

- **Persistence:** Per-tab with tab-specific defaults. Each tab stores its own preference in localStorage under a unique key. No responsive auto-switching — user's explicit choice always wins.
- **Defaults:** ClassesTab → table, TrialsTab → cards, MyEntriesTab → cards.
- **Class card richness:** Contextual. Scheduled/Upcoming classes show basic info (element, level, judge, time, ring, status, entry count). In Progress/Paused classes add live fields (progress bar, in-ring dog, next-up armbands, remaining count).
- **Scope:** All three existing tabs in this round.

## Shared Infrastructure

### `useViewPreference(tabKey, defaultMode)` hook

Wraps localStorage with React state. Returns `[viewMode, setViewMode]`. On mount, reads `view-pref-${tabKey}` from localStorage; on toggle, writes back. No responsive logic.

### ViewToggle component

Already exists at `components/common/ViewToggle.tsx`. Each tab renders it with two modes:
```ts
const VIEW_MODES = [
  { key: 'cards', label: 'Cards', icon: 'grid' as const },
  { key: 'table', label: 'Table', icon: 'table' as const },
];
```

### Toolbar layout

Each tab renders a toolbar row above content. Filters (e.g., MineToggle) sit left-aligned, ViewToggle sits right-aligned.

## ClassesTab

**Default:** table.

### Card view — ClassCard component (~120 lines)

**Scheduled/Upcoming classes:**
- Element + Level as title
- Judge name
- Time and Ring (if not hidden)
- Status badge (color-coded)
- Entry count
- Trial group label when multiple trials

**In Progress/Paused classes add:**
- Progress bar (scored / total)
- In-ring dog (armband + name, visual highlight)
- Next-up armbands (2-3 dogs)
- "Remaining" or "All complete" indicator

**Layout:** `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` matching TrialsTab's grid.

**Trial grouping:** Section headers between groups in card view (same `groupedByTrial` memo). No collapsible behavior in card view.

**MineToggle:** Stays in toolbar, works identically in both views — filters data before rendering.

## TrialsTab

**Default:** cards.

### Table view (inline, ~80 lines)

| Date | Trial Name | Type | Time | Classes | Entries | Scored | Status |
|------|-----------|------|------|---------|---------|--------|--------|

- Date: short format (e.g., "Mar 22")
- Trial Name: clickable, navigates to trial detail
- Chevron at row end
- Responsive: hide Type and Time below `md`, hide Scored below `sm`

ViewToggle right-aligned in toolbar. "Add Trial" button stays separate.

## MyEntriesTab

**Default:** cards (using existing LiveClassCard).

### Table view (inline, ~70 lines)

| Class | Status | Progress | My Dog | Position | |
|-------|--------|----------|--------|----------|-|

- Class: element + level, clickable
- Progress: "12/18 scored" fraction
- My Dog: name + armband
- Position: dogs ahead count, "In Ring", or "Completed"
- Chevron for navigation
- Responsive: hide Progress below `md`

Data from existing `useLiveClasses` hook — just rendered differently.

## File Plan

### New files
- `src/hooks/useViewPreference.ts` (~20 lines)
- `src/components/shows/tabs/ClassCard.tsx` (~120 lines)

### Modified files
- `ClassesTab.tsx` — add ViewToggle, wire card/table rendering, import ClassCard
- `TrialsTab.tsx` — add ViewToggle, add inline table view
- `MyEntriesTab.tsx` — add ViewToggle, add inline table view

### No changes
- `ViewToggle.tsx` — used as-is
- `LiveClassCard.tsx` — still used for card mode in MyEntriesTab
- `ShowDetailsPage.tsx` — tabs don't need new props

## Testing

- `useViewPreference.test.ts` — localStorage read/write, default fallback, key isolation
- `ClassCard.test.tsx` — renders scheduled card, renders live card with in-ring data, click navigation
- `ClassesTab.test.tsx` — update existing tests, add toggle switches view, MineToggle works in both views
- `TrialsTab.test.tsx` — update existing tests, add toggle switches view, table rows navigate
- `MyEntriesTab.test.tsx` — add toggle switches view, table renders entry data

## Implementation Order

1. `useViewPreference` hook + tests
2. ClassesTab: ClassCard component + toggle wiring + tests
3. TrialsTab: table view + toggle wiring + tests
4. MyEntriesTab: table view + toggle wiring + tests
