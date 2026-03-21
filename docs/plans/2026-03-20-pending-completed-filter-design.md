# Pending/Completed Status Filter for Class and Entry Lists

**Date:** 2026-03-20
**Status:** Design complete, ready for implementation

## Overview

Add a segmented status filter ("All" / "Pending" / "Completed") to ClassesTab and ClassEntriesTable. During show-day operations, secretaries and judges need to quickly focus on what's left to do vs. what's done. This filter complements the existing card/table view toggle and mine/all toggle.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI pattern | Segmented control (All / Pending / Completed) | "All" preserves full list view; avoids hiding items behind tabs users might not click |
| Placement | Inline in existing toolbar row | Compact, scannable; avoids adding a second filter row |
| Toolbar order | StatusFilter → MineToggle → ViewToggle | Status (what to show) → scope (whose) → display (how) |
| Default | Always "All" | No smart defaults or persistence — avoids confusion from hidden items |
| Which lists | ClassesTab + ClassEntriesTable only | High-volume lists where filtering reduces noise. TrialsTab (1-5 items) and MyEntriesTab (2-5 items) don't benefit enough |
| Completion detection | Smart detection (ported from myK9Q) | Both apps are offline-first; classes may be fully scored before secretary formally marks them complete |
| Visibility | Hidden when all items share the same status | No value in filtering 20 "not-started" classes pre-show |

## Component: StatusFilter

**Location:** `apps/myk9show/src/components/common/StatusFilter.tsx`

**Props:**
```typescript
interface StatusFilterProps {
  filter: 'all' | 'pending' | 'completed';
  onFilterChange: (filter: 'all' | 'pending' | 'completed') => void;
  counts: { all: number; pending: number; completed: number };
  className?: string;
}
```

**Behavior:**
- Renders three segments, each showing label + count in parentheses
- Active segment gets highlight styling (same visual language as ViewToggle)
- Hidden when `counts.pending === counts.all` or `counts.completed === counts.all` (all items share same status)
- No localStorage persistence — always defaults to "All"

## Shared Helper: getClassDisplayStatus()

**Location:** `packages/core/src/helpers/class-display-status.ts`
**Exported from:** `@myk9/core` barrel

```typescript
type ClassDisplayStatus = 'not-started' | 'in-progress' | 'completed';

function getClassDisplayStatus(classData: {
  status?: string;
  is_scoring_finalized?: boolean;
  entry_count: number;
  scored_count: number;
  has_active_entries?: boolean;
}): ClassDisplayStatus;
```

**Priority logic:**
1. `is_scoring_finalized === true` → `'completed'`
2. `status === 'Completed'` (canonical) → `'completed'`
3. `scored_count === entry_count && entry_count > 0` → `'completed'`
4. `has_active_entries || scored_count > 0` → `'in-progress'`
5. Default → `'not-started'`

Ported from myK9Q's `getClassDisplayStatus()` in `apps/myk9q/src/utils/statusUtils.ts`.

## ClassesTab Integration

**File:** `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx`

**Changes:**
1. Add `statusFilter` state: `useState<'all' | 'pending' | 'completed'>('all')`
2. Compute display status per class using `getClassDisplayStatus()`
3. Compute counts in `useMemo`
4. Filter class list before group-by-trial logic and before rendering
5. Add `StatusFilter` to toolbar row, left of MineToggle
6. Both card and table views respect the same filter (applied upstream)

**Empty states:**
- Filter = "Pending", zero pending → "All classes completed" + link to switch to "All"
- Filter = "Completed", zero completed → "No classes completed yet" + link to switch to "All"

**Hide rule:** StatusFilter hidden until at least one class has a different display status from the others.

## ClassEntriesTable Integration

**File:** `apps/myk9show/src/components/classes/ClassEntriesTable/ClassEntriesTable.tsx`

**Changes:**
1. Add `statusFilter` state
2. Filter entries: pending = `is_scored !== true`, completed = `is_scored === true`
3. Compute counts from entries array
4. Add `StatusFilter` to table header/toolbar area

**Same hide rule and empty state pattern as ClassesTab.**

No card/table toggle here (always a table), so toolbar is just StatusFilter alone.

## Testing Plan

### `getClassDisplayStatus()` — packages/core
- Each priority path (finalized, canonical status, auto-detect all scored, in-progress, not-started)
- Edge cases: zero entries, mismatched status vs scored count

### StatusFilter component
- Renders three segments with correct counts
- Active state styling on selected segment
- Calls onFilterChange on click
- Hidden when all items share same status

### ClassesTab filtering
- Filter state changes update visible classes
- Counts reflect actual class statuses
- Empty state renders when filtered list is empty
- Filter hidden before any scoring
- Filter works with both card and table views
- Filter works combined with MineToggle

### ClassEntriesTable filtering
- Filter changes, counts, empty state, hidden before scoring

No E2E tests — E2E suite is not yet stable.

## Files to Create
- `packages/core/src/helpers/class-display-status.ts`
- `apps/myk9show/src/components/common/StatusFilter.tsx`

## Files to Modify
- `packages/core/src/index.ts` (export new helper)
- `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx`
- `apps/myk9show/src/components/classes/ClassEntriesTable/ClassEntriesTable.tsx`
