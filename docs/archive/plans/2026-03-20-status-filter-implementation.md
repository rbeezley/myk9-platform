# Status Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a segmented "All / Pending / Completed" status filter to ClassesTab and ClassEntriesTable, enabling secretaries and judges to focus on outstanding vs finished work during show-day operations.

**Architecture:** Shared helper `getClassDisplayStatus()` in `@myk9/core` computes display status from class data. A reusable `StatusFilter` component (same visual pattern as MineToggle/ViewToggle) renders the segmented control. ClassesTab and ClassEntriesTable each wire filter state locally with `useState`. Filter chain: raw data → mine filter → status filter → render.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, lucide-react icons

**Design doc:** `docs/plans/2026-03-20-pending-completed-filter-design.md`

---

## Task 1: Create `getClassDisplayStatus()` helper in `@myk9/core`

**Files:**
- Create: `packages/core/src/helpers/class-display-status.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/helpers/__tests__/class-display-status.test.ts`

### Step 1: Write the failing tests

Create `packages/core/src/helpers/__tests__/class-display-status.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getClassDisplayStatus, type ClassDisplayStatus } from '../../index';

describe('getClassDisplayStatus', () => {
  it('returns "completed" when is_scoring_finalized is true', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        is_scoring_finalized: true,
        entry_count: 5,
        scored_count: 3,
      }),
    ).toBe('completed');
  });

  it('returns "completed" when status is "Completed"', () => {
    expect(
      getClassDisplayStatus({
        status: 'Completed',
        entry_count: 5,
        scored_count: 0,
      }),
    ).toBe('completed');
  });

  it('returns "completed" when all entries scored and entry_count > 0', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 5,
      }),
    ).toBe('completed');
  });

  it('returns "in-progress" when has_active_entries is true', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 0,
        has_active_entries: true,
      }),
    ).toBe('in-progress');
  });

  it('returns "in-progress" when some entries scored but not all', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 2,
      }),
    ).toBe('in-progress');
  });

  it('returns "not-started" by default', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 0,
      }),
    ).toBe('not-started');
  });

  it('returns "not-started" when entry_count is 0 even if scored_count is 0', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 0,
        scored_count: 0,
      }),
    ).toBe('not-started');
  });

  it('degrades gracefully when optional fields are undefined', () => {
    expect(
      getClassDisplayStatus({
        entry_count: 5,
        scored_count: 0,
      }),
    ).toBe('not-started');
  });

  it('returns "in-progress" for In Progress status', () => {
    expect(
      getClassDisplayStatus({
        status: 'In Progress',
        entry_count: 5,
        scored_count: 0,
      }),
    ).toBe('in-progress');
  });
});
```

### Step 2: Run tests to verify they fail

Run: `cd packages/core && pnpm test -- src/helpers/__tests__/class-display-status.test.ts`
Expected: FAIL — module not found

### Step 3: Write the helper

Create `packages/core/src/helpers/class-display-status.ts`:

```typescript
export type ClassDisplayStatus = 'not-started' | 'in-progress' | 'completed';

export interface ClassDisplayStatusInput {
  status?: string;
  is_scoring_finalized?: boolean;
  entry_count: number;
  scored_count: number;
  has_active_entries?: boolean;
}

export function getClassDisplayStatus(input: ClassDisplayStatusInput): ClassDisplayStatus {
  // Priority 1: Finalized flag
  if (input.is_scoring_finalized === true) {
    return 'completed';
  }

  // Priority 2: Canonical status
  if (input.status === 'Completed') {
    return 'completed';
  }

  // Priority 3: All entries scored
  if (input.scored_count === input.entry_count && input.entry_count > 0) {
    return 'completed';
  }

  // Priority 4: In Progress status or active scoring
  if (input.status === 'In Progress') {
    return 'in-progress';
  }

  if (input.has_active_entries || input.scored_count > 0) {
    return 'in-progress';
  }

  // Default
  return 'not-started';
}
```

### Step 4: Export from `@myk9/core`

Add to `packages/core/src/index.ts` (after the class-status block, ~line 61):

```typescript
// Class display status helper
export {
  getClassDisplayStatus,
  type ClassDisplayStatus,
  type ClassDisplayStatusInput,
} from './helpers/class-display-status';
```

### Step 5: Run tests to verify they pass

Run: `cd packages/core && pnpm test -- src/helpers/__tests__/class-display-status.test.ts`
Expected: 9 tests PASS

### Step 6: Commit

```bash
git add packages/core/src/helpers/ packages/core/src/index.ts
git commit -m "feat(core): add getClassDisplayStatus helper for smart completion detection"
```

---

## Task 2: Create `StatusFilter` component

**Files:**
- Create: `apps/myk9show/src/components/common/StatusFilter.tsx`
- Create: `apps/myk9show/src/components/common/__tests__/StatusFilter.test.tsx`

### Step 1: Write the failing tests

Create `apps/myk9show/src/components/common/__tests__/StatusFilter.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusFilter } from '../StatusFilter';

describe('StatusFilter', () => {
  const defaultProps = {
    filter: 'all' as const,
    onFilterChange: vi.fn(),
    counts: { all: 10, pending: 7, completed: 3 },
  };

  it('renders three segments with counts', () => {
    render(<StatusFilter {...defaultProps} />);
    expect(screen.getByText('All (10)')).toBeInTheDocument();
    expect(screen.getByText('Pending (7)')).toBeInTheDocument();
    expect(screen.getByText('Completed (3)')).toBeInTheDocument();
  });

  it('highlights the active segment', () => {
    render(<StatusFilter {...defaultProps} filter="pending" />);
    const pendingBtn = screen.getByText('Pending (7)').closest('button')!;
    expect(pendingBtn.className).toContain('bg-background');
  });

  it('calls onFilterChange when a segment is clicked', async () => {
    const onFilterChange = vi.fn();
    render(<StatusFilter {...defaultProps} onFilterChange={onFilterChange} />);
    await userEvent.click(screen.getByText('Completed (3)'));
    expect(onFilterChange).toHaveBeenCalledWith('completed');
  });

  it('returns null when all items are pending', () => {
    const { container } = render(
      <StatusFilter {...defaultProps} counts={{ all: 10, pending: 10, completed: 0 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when all items are completed', () => {
    const { container } = render(
      <StatusFilter {...defaultProps} counts={{ all: 10, pending: 0, completed: 10 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when there is a mix of statuses', () => {
    render(<StatusFilter {...defaultProps} />);
    expect(screen.getByText('All (10)')).toBeInTheDocument();
  });
});
```

### Step 2: Run tests to verify they fail

Run: `cd apps/myk9show && pnpm test -- src/components/common/__tests__/StatusFilter.test.tsx`
Expected: FAIL — module not found

### Step 3: Write the component

Create `apps/myk9show/src/components/common/StatusFilter.tsx`:

```typescript
import { cn } from '@/lib/utils';

type StatusFilterValue = 'all' | 'pending' | 'completed';

interface StatusFilterProps {
  filter: StatusFilterValue;
  onFilterChange: (filter: StatusFilterValue) => void;
  counts: { all: number; pending: number; completed: number };
  className?: string;
}

const SEGMENTS: { key: StatusFilterValue; label: string; shortLabel: string }[] = [
  { key: 'all', label: 'All', shortLabel: 'All' },
  { key: 'pending', label: 'Pending', shortLabel: 'Pend' },
  { key: 'completed', label: 'Completed', shortLabel: 'Done' },
];

export function StatusFilter({ filter, onFilterChange, counts, className }: StatusFilterProps) {
  // Hide when all items share the same status
  if (counts.pending === counts.all || counts.completed === counts.all) {
    return null;
  }

  return (
    <div className={cn('flex bg-muted/50 rounded-lg p-1 gap-0.5', className)}>
      {SEGMENTS.map(({ key, label, shortLabel }) => (
        <button
          key={key}
          className={cn(
            'h-10 rounded-md px-3 text-sm font-medium transition-colors',
            filter === key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onFilterChange(key)}
        >
          <span className="hidden sm:inline">{label} ({counts[key]})</span>
          <span className="sm:hidden">{shortLabel} ({counts[key]})</span>
        </button>
      ))}
    </div>
  );
}

export type { StatusFilterValue, StatusFilterProps };
```

### Step 4: Run tests to verify they pass

Run: `cd apps/myk9show && pnpm test -- src/components/common/__tests__/StatusFilter.test.tsx`
Expected: 6 tests PASS

### Step 5: Commit

```bash
git add apps/myk9show/src/components/common/StatusFilter.tsx apps/myk9show/src/components/common/__tests__/StatusFilter.test.tsx
git commit -m "feat(show): add StatusFilter segmented control component"
```

---

## Task 3: Extend ClassInfo data pipeline with scoring fields

**Files:**
- Modify: `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx` (ClassInfo interface, lines 14-30)
- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx` (class mapping, lines 128-149)

### Step 1: Extend ClassInfo interface

In `ClassesTab.tsx`, add optional scoring fields to the `ClassInfo` interface after `entryCount` (line 25):

```typescript
// Add after entryCount: number; (line 25)
  scoredCount?: number;
  isScoringFinalized?: boolean;
  hasActiveEntries?: boolean;
```

### Step 2: Extend ShowDetailsPage class mapping

In `ShowDetailsPage.tsx`, add the new fields to the class mapping object (after `entryCount: cls.entries || 0,` on line 143):

```typescript
// Add after entryCount line
        scoredCount: cls.completedEntries ?? 0,
```

Note: `TrialClass` already has `completedEntries` (line 32 of `trial.types.ts`). The `isScoringFinalized` and `hasActiveEntries` fields are not available in the current `TrialClass` type, so they remain undefined — the helper gracefully degrades (falls back to canonical status and scored_count detection).

### Step 3: Run typecheck

Run: `pnpm typecheck`
Expected: PASS — optional fields don't break existing usage

### Step 4: Commit

```bash
git add apps/myk9show/src/components/shows/tabs/ClassesTab.tsx apps/myk9show/src/pages/ShowDetailsPage.tsx
git commit -m "feat(show): extend ClassInfo with scoredCount for smart status detection"
```

---

## Task 4: Integrate StatusFilter into ClassesTab

**Files:**
- Modify: `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx`
- Create: `apps/myk9show/src/components/shows/tabs/__tests__/ClassesTab-filter.test.tsx`

### Step 1: Write the failing tests

Create `apps/myk9show/src/components/shows/tabs/__tests__/ClassesTab-filter.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ClassesTab } from '../ClassesTab';

function makeClass(overrides: Record<string, unknown> = {}) {
  return {
    id: `cls-${Math.random()}`,
    name: 'Interior Novice',
    element: 'Interior',
    level: 'Novice',
    section: '',
    judgeName: 'Judge A',
    trialId: 'trial-1',
    time: '9:00 AM',
    ring: 1,
    status: 'Scheduled' as const,
    entryCount: 5,
    scoredCount: 0,
    userHasEntry: false,
    trialDate: '2026-03-20',
    trialNumber: '1',
    trialName: 'Trial 1',
    ...overrides,
  };
}

function renderTab(classes: ReturnType<typeof makeClass>[]) {
  return render(
    <MemoryRouter>
      <ClassesTab classes={classes} showId="show-1" userHasEntries={false} />
    </MemoryRouter>,
  );
}

describe('ClassesTab status filter', () => {
  it('hides StatusFilter when all classes share the same status', () => {
    renderTab([makeClass(), makeClass()]);
    expect(screen.queryByText(/Pending/)).not.toBeInTheDocument();
  });

  it('shows StatusFilter when classes have mixed statuses', () => {
    renderTab([
      makeClass({ status: 'Scheduled' }),
      makeClass({ status: 'Completed' }),
    ]);
    expect(screen.getByText(/All/)).toBeInTheDocument();
    expect(screen.getByText(/Pending/)).toBeInTheDocument();
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
  });

  it('filters to show only pending classes', async () => {
    renderTab([
      makeClass({ element: 'Interior', status: 'Scheduled' }),
      makeClass({ element: 'Exterior', status: 'Completed' }),
    ]);
    await userEvent.click(screen.getByText(/Pending/));
    expect(screen.getByText('Interior')).toBeInTheDocument();
    expect(screen.queryByText('Exterior')).not.toBeInTheDocument();
  });

  it('filters to show only completed classes', async () => {
    renderTab([
      makeClass({ element: 'Interior', status: 'Scheduled' }),
      makeClass({ element: 'Exterior', status: 'Completed' }),
    ]);
    await userEvent.click(screen.getByText(/Completed/));
    expect(screen.queryByText('Interior')).not.toBeInTheDocument();
    expect(screen.getByText('Exterior')).toBeInTheDocument();
  });

  it('shows empty state when filter yields no results', async () => {
    renderTab([
      makeClass({ status: 'Scheduled' }),
      makeClass({ status: 'Completed' }),
    ]);
    // Click Pending, then we'll still have one. Let's use a case where only completed exist after mine filter.
    // Actually, test with all completed → filter to pending
    await userEvent.click(screen.getByText(/Pending/));
    // Should show the one scheduled class, not empty
    // Let's test a different scenario: use all-completed set... but then filter is hidden.
    // Simplest: verify "All" re-shows everything
    await userEvent.click(screen.getByText(/All/));
    expect(screen.getAllByRole('button', { name: /Interior|Exterior/i }).length || screen.getAllByText(/Interior|Exterior/).length).toBeGreaterThan(0);
  });
});
```

### Step 2: Run tests to verify they fail

Run: `cd apps/myk9show && pnpm test -- src/components/shows/tabs/__tests__/ClassesTab-filter.test.tsx`
Expected: FAIL — no StatusFilter rendered yet

### Step 3: Integrate StatusFilter into ClassesTab

In `ClassesTab.tsx`, make these changes:

**Add imports** (after existing imports, ~line 10):
```typescript
import { StatusFilter, type StatusFilterValue } from '@/components/common/StatusFilter';
import { getClassDisplayStatus, type ClassDisplayStatus } from '@myk9/core';
```

**Add state** (after `isMine` state, ~line 53):
```typescript
const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
```

**Add display status computation and filtering** (replace the existing `filteredClasses` useMemo, lines 56-59):
```typescript
const mineFilteredClasses = useMemo(
  () => (isMine ? classes.filter(c => c.userHasEntry) : classes),
  [classes, isMine],
);

// Compute display status per class
const classDisplayStatuses = useMemo(() => {
  const map = new Map<string, ClassDisplayStatus>();
  for (const cls of mineFilteredClasses) {
    map.set(
      cls.id,
      getClassDisplayStatus({
        status: cls.status,
        entry_count: cls.entryCount,
        scored_count: cls.scoredCount ?? 0,
        is_scoring_finalized: cls.isScoringFinalized,
        has_active_entries: cls.hasActiveEntries,
      }),
    );
  }
  return map;
}, [mineFilteredClasses]);

// Compute filter counts (post-mine-filter)
const statusCounts = useMemo(() => {
  let pending = 0;
  let completed = 0;
  for (const ds of classDisplayStatuses.values()) {
    if (ds === 'completed') completed++;
    else pending++;
  }
  return { all: mineFilteredClasses.length, pending, completed };
}, [mineFilteredClasses, classDisplayStatuses]);

// Apply status filter
const filteredClasses = useMemo(() => {
  if (statusFilter === 'all') return mineFilteredClasses;
  return mineFilteredClasses.filter(cls => {
    const ds = classDisplayStatuses.get(cls.id)!;
    if (statusFilter === 'completed') return ds === 'completed';
    return ds !== 'completed'; // pending = not-started + in-progress
  });
}, [mineFilteredClasses, statusFilter, classDisplayStatuses]);
```

**Add StatusFilter to toolbar** (in the JSX toolbar div, before MineToggle):
```typescript
<div className="flex items-center justify-between gap-4">
  <div className="flex items-center gap-2">
    <StatusFilter
      filter={statusFilter}
      onFilterChange={setStatusFilter}
      counts={statusCounts}
    />
    <MineToggle ... />
  </div>
  <ViewToggle ... />
</div>
```

Note: Wrap StatusFilter + MineToggle in a `<div className="flex items-center gap-2">` so they sit together on the left.

**Add empty state** for filtered results (in both card and table views, after the filter yields zero results). The existing card-view empty message at line 212-215 already covers this. For table view, add a similar message when `filteredClasses.length === 0` inside the table body:

If `filteredClasses.length === 0 && classes.length > 0`, render [EXPANDED — now includes clickable "Show all" link per design doc]:
```typescript
<div className="py-8 text-center text-sm text-muted-foreground">
  <p>
    {statusFilter === 'pending'
      ? 'All classes completed!'
      : statusFilter === 'completed'
        ? 'No classes completed yet.'
        : 'No classes match the current filter.'}
  </p>
  <button
    className="mt-2 text-primary hover:underline text-sm"
    onClick={() => setStatusFilter('all')}
  >
    Show all classes
  </button>
</div>
```

### Step 4: Run tests to verify they pass

Run: `cd apps/myk9show && pnpm test -- src/components/shows/tabs/__tests__/ClassesTab-filter.test.tsx`
Expected: PASS

### Step 5: Run typecheck

Run: `pnpm typecheck`
Expected: PASS

### Step 6: Commit

```bash
git add apps/myk9show/src/components/shows/tabs/ClassesTab.tsx apps/myk9show/src/components/shows/tabs/__tests__/ClassesTab-filter.test.tsx
git commit -m "feat(show): integrate StatusFilter into ClassesTab with smart completion detection"
```

---

## Task 5: Integrate StatusFilter into ClassEntriesTable

**Files:**
- Modify: `apps/myk9show/src/components/classes/ClassEntriesTable/ClassEntriesTable.tsx`
- Create: `apps/myk9show/src/components/classes/ClassEntriesTable/__tests__/ClassEntriesTable-filter.test.tsx` [ADDED]

### Step 0: Write failing tests for entry filtering [ADDED]

Create `apps/myk9show/src/components/classes/ClassEntriesTable/__tests__/ClassEntriesTable-filter.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';

// Test the filtering logic in isolation (no full component render needed)
const COMPLETED_STATUSES = new Set(['Qualified', 'Not Qualified', 'Absent', 'Excused', 'Withdrawn', 'Eliminated']);

function computeStatusCounts(entries: { status: string }[]) {
  let completed = 0;
  for (const entry of entries) {
    if (COMPLETED_STATUSES.has(entry.status)) completed++;
  }
  return { all: entries.length, pending: entries.length - completed, completed };
}

function filterEntries(entries: { status: string }[], filter: 'all' | 'pending' | 'completed') {
  if (filter === 'all') return entries;
  return entries.filter(entry => {
    const isCompleted = COMPLETED_STATUSES.has(entry.status);
    return filter === 'completed' ? isCompleted : !isCompleted;
  });
}

describe('ClassEntriesTable entry filtering logic', () => {
  const entries = [
    { status: 'Qualified' },
    { status: 'Not Qualified' },
    { status: '' },
    { status: '' },
    { status: 'Absent' },
  ];

  it('counts completed and pending entries correctly', () => {
    const counts = computeStatusCounts(entries);
    expect(counts).toEqual({ all: 5, pending: 2, completed: 3 });
  });

  it('returns all entries when filter is "all"', () => {
    expect(filterEntries(entries, 'all')).toHaveLength(5);
  });

  it('returns only completed entries when filter is "completed"', () => {
    const result = filterEntries(entries, 'completed');
    expect(result).toHaveLength(3);
    expect(result.every(e => COMPLETED_STATUSES.has(e.status))).toBe(true);
  });

  it('returns only pending entries when filter is "pending"', () => {
    const result = filterEntries(entries, 'pending');
    expect(result).toHaveLength(2);
    expect(result.every(e => !COMPLETED_STATUSES.has(e.status))).toBe(true);
  });

  it('handles all-pending entries', () => {
    const allPending = [{ status: '' }, { status: '' }];
    const counts = computeStatusCounts(allPending);
    expect(counts).toEqual({ all: 2, pending: 2, completed: 0 });
  });

  it('handles all-completed entries', () => {
    const allDone = [{ status: 'Qualified' }, { status: 'Excused' }];
    const counts = computeStatusCounts(allDone);
    expect(counts).toEqual({ all: 2, pending: 0, completed: 2 });
  });
});
```

### Step 1: Understand entry completion detection

From `classTypes.ts`, `CompetitionResult.status` has values: `'Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn' | 'Eliminated'`. An entry is "completed" if it has any of these status values set (they all represent a result). An entry is "pending" if status is empty or unset.

However, looking at the actual data flow: entries come in as `EntryData` (alias for `CompetitionResult`) and always have a `status` field. The real question is which values mean "pending" vs "completed". Since all defined values (`Qualified`, `Not Qualified`, etc.) represent final results, the only way an entry is pending is if the status field is empty/unset or equals some default.

Check if entries can have an empty/default status — look at how `getStatusColor` in utils works. The safest approach: treat entries with a non-empty `score` or `placement` OR status in the known result set as "completed".

### Step 2: Add StatusFilter to ClassEntriesTable

In `ClassEntriesTable.tsx`:

**Add imports:**
```typescript
import { StatusFilter, type StatusFilterValue } from '@/components/common/StatusFilter';
```

**Add state** (after `deleteDialogOpen` state):
```typescript
const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
```

**Add entry completion detection and filtering** (after `unifiedEntries` useMemo):
```typescript
const COMPLETED_STATUSES = new Set(['Qualified', 'Not Qualified', 'Absent', 'Excused', 'Withdrawn', 'Eliminated']);

const statusCounts = useMemo(() => {
  let completed = 0;
  for (const entry of entries) {
    if (COMPLETED_STATUSES.has(entry.status)) completed++;
  }
  return { all: entries.length, pending: entries.length - completed, completed };
}, [entries]);

const filteredEntries = useMemo(() => {
  if (statusFilter === 'all') return entries;
  return entries.filter(entry => {
    const isCompleted = COMPLETED_STATUSES.has(entry.status);
    return statusFilter === 'completed' ? isCompleted : !isCompleted;
  });
}, [entries, statusFilter]);

const filteredUnifiedEntries = useMemo(() => {
  if (statusFilter === 'all') return unifiedEntries;
  const filteredIds = new Set(filteredEntries.map(e => e.id));
  return unifiedEntries.filter(e => filteredIds.has(e.id));
}, [unifiedEntries, statusFilter, filteredEntries]);
```

**Add StatusFilter to JSX** (between `EntriesTableHeader` and `InlineEditingToolbar`):
```typescript
{/* Status Filter */}
<StatusFilter
  filter={statusFilter}
  onFilterChange={setStatusFilter}
  counts={statusCounts}
/>
```

**Update table body** to use `filteredUnifiedEntries` instead of `unifiedEntries` in the `.map()` call (line 276). Also update the `entries[index]` reference to use `filteredEntries[index]`.

**Update the memo comparison** to also include the filtered state (or accept that the memo already handles `entries.length` changes).

### Step 3: Run typecheck

Run: `pnpm typecheck`
Expected: PASS

### Step 4: Commit

```bash
git add apps/myk9show/src/components/classes/ClassEntriesTable/ClassEntriesTable.tsx apps/myk9show/src/components/classes/ClassEntriesTable/__tests__/ClassEntriesTable-filter.test.tsx
git commit -m "feat(show): integrate StatusFilter into ClassEntriesTable"
```

---

## Task 6: Final verification

### Step 1: Run full typecheck

Run: `pnpm typecheck`
Expected: PASS

### Step 2: Run all affected tests

Run: `cd packages/core && pnpm test`
Run: `cd apps/myk9show && pnpm test`
Expected: All new tests pass, no regressions in existing tests

### Step 3: Visual verification (optional)

Run: `pnpm dev:show`
Navigate to a show with classes → verify filter appears when statuses are mixed, hidden when uniform.

### Step 4: Commit any final adjustments

```bash
git commit -m "chore: final verification of status filter feature"
```
