# Pending/Completed Status Filter for Class and Entry Lists

**Date:** 2026-03-20
**Status:** Design verified, ready for implementation

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

**[ADDED] Responsive behavior:**
- On mobile (< 640px): show abbreviated labels ("All" / "Pend" / "Done") or icons only (ListFilter / Clock / CheckCircle) to fit alongside other toolbar controls
- On desktop: full labels with counts

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

## [ADDED] Data Pipeline: Extending ClassInfo with Scoring Fields

**Problem:** The current `ClassInfo` interface in ClassesTab only has `status` and `entryCount`. The smart detection helper needs `scored_count`, `is_scoring_finalized`, and `has_active_entries` — none of which are currently available.

**Solution:** Extend the data pipeline in two places:

### 1. Extend ClassInfo interface (ClassesTab.tsx)

Add optional scoring fields to `ClassInfo`:
```typescript
interface ClassInfo {
  // ... existing fields ...
  entryCount: number;
  scoredCount?: number;          // [ADDED] count of scored entries
  isScoringFinalized?: boolean;  // [ADDED] from trial_classes.is_scoring_finalized
  hasActiveEntries?: boolean;    // [ADDED] any entry currently in-ring
}
```

### 2. Extend ShowDetailsPage class mapping (ShowDetailsPage.tsx ~lines 132-148)

The `trialClasses[trial.id]` data comes from Supabase queries. The mapping at ShowDetailsPage must populate the new fields:
- `scoredCount`: Compute from `cls.entries` — count entries where `is_scored === true` or `result_status !== 'pending'`. If entry-level scoring data isn't available in the current query, add a computed column or aggregate.
- `isScoringFinalized`: Map from `cls.is_scoring_finalized` if it exists on the `trial_classes` row, otherwise default to `false`.
- `hasActiveEntries`: Map from `cls.entries` — check if any entry has `check_in_status === 'in-ring'`, otherwise default to `false`.

**Fallback strategy:** If scoring metadata is not available in the current query shape, the helper gracefully degrades — it still checks canonical `status === 'Completed'` (priority 2) and the default path. The filter will work with reduced smart detection until the data pipeline is fully wired.

### 3. Verify Supabase query includes scoring aggregates

Check the query that populates `trialClasses` in ShowDetailsPage. If it doesn't join or aggregate entry scoring data, extend it. The query likely lives in a React Query hook or store action. Add:
- `scored_count` (count of entries where `is_scored = true`)
- `is_scoring_finalized` (column on `trial_classes` if it exists, or derive from all entries scored)

## ClassesTab Integration

**File:** `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx`

**Changes:**
1. Add `statusFilter` state: `useState<'all' | 'pending' | 'completed'>('all')`
2. Compute display status per class using `getClassDisplayStatus()` — mapping `ClassInfo` fields to the helper's input shape (`entryCount` → `entry_count`, `scoredCount` → `scored_count`, etc.)
3. Compute counts in `useMemo`
4. Filter class list before group-by-trial logic and before rendering
5. Add `StatusFilter` to toolbar row, left of MineToggle
6. Both card and table views respect the same filter (applied upstream)

**[EXPANDED] Filter interaction with MineToggle:**
- StatusFilter counts reflect the **post-mine-filter** list. If "Mine" is active, counts show only the user's classes. This way the numbers always match what's visible.
- Filter chain order: raw classes → mine filter → status filter → group-by-trial → render

**Empty states:**
- Filter = "Pending", zero pending → "All classes completed" + link to switch to "All"
- Filter = "Completed", zero completed → "No classes completed yet" + link to switch to "All"

**Hide rule:** StatusFilter hidden until at least one class has a different display status from the others (evaluated after mine filter).

## ClassEntriesTable Integration

**File:** `apps/myk9show/src/components/classes/ClassEntriesTable/ClassEntriesTable.tsx`

**[EXPANDED] Changes:**
1. Add `statusFilter` state
2. **Determine completion from available entry fields.** The `CompetitionResult` type has a `status` field (string) but no `is_scored` boolean. Filter logic:
   - Completed: `entry.status === 'completed'` OR entry has a non-null `score` or `placement` value
   - Pending: everything else
   - Verify the actual status values used in CompetitionResult by checking how entries are written after scoring (likely in scoring stores or secretary scoring page)
3. Compute counts from entries array
4. Add `StatusFilter` to table header area, above or alongside `EntriesTableHeader`

**Same hide rule and empty state pattern as ClassesTab.**

No card/table toggle here (always a table), so toolbar is just StatusFilter alone.

## Testing Plan

### `getClassDisplayStatus()` — packages/core
- Each priority path (finalized, canonical status, auto-detect all scored, in-progress, not-started)
- Edge cases: zero entries, mismatched status vs scored count
- [ADDED] Graceful degradation: when optional fields (`is_scoring_finalized`, `has_active_entries`) are undefined, falls back correctly

### StatusFilter component
- Renders three segments with correct counts
- Active state styling on selected segment
- Calls onFilterChange on click
- Hidden when all items share same status
- [ADDED] Renders nothing (returns null) when hidden — no empty wrapper

### ClassesTab filtering
- Filter state changes update visible classes
- Counts reflect actual class statuses
- Empty state renders when filtered list is empty
- Filter hidden before any scoring
- Filter works with both card and table views
- Filter works combined with MineToggle
- [ADDED] Counts update when MineToggle changes (post-mine-filter counts)

### ClassEntriesTable filtering
- Filter changes, counts, empty state, hidden before scoring
- [ADDED] Completion detection works with actual CompetitionResult status values

No E2E tests — E2E suite is not yet stable.

## Files to Create
- `packages/core/src/helpers/class-display-status.ts` (note: `helpers/` directory is new — create it)
- `apps/myk9show/src/components/common/StatusFilter.tsx`

## Files to Modify
- `packages/core/src/index.ts` (export new helper + type)
- `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx` (ClassInfo interface, filter state, toolbar, filter chain)
- `apps/myk9show/src/pages/ShowDetailsPage.tsx` (extend class mapping with scoring fields)
- `apps/myk9show/src/components/classes/ClassEntriesTable/ClassEntriesTable.tsx` (filter state, toolbar)
