# Entry Management Scoring Enhancement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cascading trial/class filter dropdowns to the Entry Management page, enabling secretaries to view trial rosters and score entries inline without navigating through Show > Trial > Class detail pages.

**Architecture:** Extend the existing `useEntryManagementFilters` hook with trial/class filter state synced to URL query params. Add a view-mode concept (`registration | roster | scoring`) derived from filter state. Reuse the existing `useClassResults` hook and scoring columns for inline class-level scoring. New components for trial roster view and filter breadcrumbs.

**Tech Stack:** React, TypeScript, React Query, Supabase, Zustand (existing stores), DataTable (existing), SubTabs (existing), SearchBar (existing).

**Design doc:** `docs/plans/2026-03-29-entry-management-scoring-design.md`

---

## Task 1: Add Trial/Class Filter State to useEntryManagementFilters

**Files:**
- Modify: `apps/myk9show/src/hooks/useEntryManagementFilters.ts`
- Test: `apps/myk9show/src/test/hooks/useEntryManagementFilters.test.ts`

**Step 1: Write failing tests**

```typescript
import { renderHook, act } from '@testing-library/react';
import { useEntryManagementFilters } from '@/hooks/useEntryManagementFilters';

// Mock useSearchParams
const mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

describe('useEntryManagementFilters - trial/class filters', () => {
  const baseProps = { entries: [], tabCounts: { all: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 } };

  it('initializes trialFilter and classFilter as null', () => {
    const { result } = renderHook(() => useEntryManagementFilters(baseProps));
    expect(result.current.trialFilter).toBeNull();
    expect(result.current.classFilter).toBeNull();
  });

  it('derives viewMode "registration" when no trial/class filter', () => {
    const { result } = renderHook(() => useEntryManagementFilters(baseProps));
    expect(result.current.viewMode).toBe('registration');
  });

  it('derives viewMode "roster" when trial is set but class is not', () => {
    const { result } = renderHook(() => useEntryManagementFilters(baseProps));
    act(() => result.current.setTrialFilter('trial-1'));
    expect(result.current.viewMode).toBe('roster');
  });

  it('derives viewMode "scoring" when both trial and class are set', () => {
    const { result } = renderHook(() => useEntryManagementFilters(baseProps));
    act(() => { result.current.setTrialFilter('trial-1'); result.current.setClassFilter('class-1'); });
    expect(result.current.viewMode).toBe('scoring');
  });

  it('clears classFilter when trialFilter changes', () => {
    const { result } = renderHook(() => useEntryManagementFilters(baseProps));
    act(() => { result.current.setTrialFilter('trial-1'); result.current.setClassFilter('class-1'); });
    act(() => result.current.setTrialFilter('trial-2'));
    expect(result.current.classFilter).toBeNull();
  });

  it('clears both filters when trialFilter is set to null', () => {
    const { result } = renderHook(() => useEntryManagementFilters(baseProps));
    act(() => { result.current.setTrialFilter('trial-1'); result.current.setClassFilter('class-1'); });
    act(() => result.current.setTrialFilter(null));
    expect(result.current.trialFilter).toBeNull();
    expect(result.current.classFilter).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useEntryManagementFilters.test.ts`
Expected: FAIL — `trialFilter`, `classFilter`, `viewMode` not in return type

**Step 3: Implement filter state**

Add to `useEntryManagementFilters.ts`:
- `trialFilter: string | null` state (initialized from `searchParams.get('trial')`)
- `classFilter: string | null` state (initialized from `searchParams.get('class')`)
- `setTrialFilter(id: string | null)` — sets trial, clears class, syncs to URL
- `setClassFilter(id: string | null)` — sets class, syncs to URL
- `viewMode` derived: no filters → `'registration'`, trial only → `'roster'`, trial+class → `'scoring'`
- Update `clearFilters()` to also clear trial/class
- Import `useSearchParams` from react-router-dom

[ADDED] **Reset on show change:** Add a `useEffect` that clears `trialFilter` and `classFilter` when the entries array identity changes (proxy for show change), or accept `showId` as a prop and reset on change.

[ADDED] **Filter stacking test:** Add test that verifies existing status/payment filters still apply when trial filter is active — `filteredEntries` should respect all filters simultaneously.

**Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useEntryManagementFilters.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useEntryManagementFilters.ts apps/myk9show/src/test/hooks/useEntryManagementFilters.test.ts
git commit -m "feat(entries): add trial/class filter state with URL sync"
```

---

## Task 2: React Query Hook for Trials by Show

**Files:**
- Create: `apps/myk9show/src/hooks/queries/useShowTrials.ts`
- Test: `apps/myk9show/src/test/hooks/useShowTrials.test.ts`

**Step 1: Write failing test**

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { useShowTrials } from '@/hooks/queries/useShowTrials';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

describe('useShowTrials', () => {
  it('returns empty array when showId is null', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useShowTrials(null), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useShowTrials.test.ts`

**Step 3: Implement**

```typescript
// apps/myk9show/src/hooks/queries/useShowTrials.ts
import { useQuery } from '@tanstack/react-query';
import { getTrialsByShow } from '@/services/database/queries/trialQueries';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

export function useShowTrials(showId: string | null) {
  return useQuery({
    queryKey: queryKeys.showTrials(showId!),
    queryFn: async () => {
      const { data, error } = await getTrialsByShow(showId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
```

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat(entries): add useShowTrials query hook"
```

---

## Task 3: Trial/Class Filter Dropdowns Component

**Files:**
- Create: `apps/myk9show/src/components/entries/management/TrialClassFilters.tsx`
- Test: `apps/myk9show/src/test/components/entries/TrialClassFilters.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@/test/utils/testUtils';
import { TrialClassFilters } from '@/components/entries/management/TrialClassFilters';

describe('TrialClassFilters', () => {
  const trials = [
    { id: 't1', name: 'Trial 1', date: '2026-04-01', trial_number: 1 },
    { id: 't2', name: 'Trial 2', date: '2026-04-02', trial_number: 2 },
  ];

  it('renders trial dropdown with "All Trials" option', () => {
    render(
      <TrialClassFilters
        trials={trials}
        classes={[]}
        trialFilter={null}
        classFilter={null}
        onTrialChange={vi.fn()}
        onClassChange={vi.fn()}
      />
    );
    expect(screen.getByText('All Trials')).toBeInTheDocument();
  });

  it('disables class dropdown when no trial selected', () => {
    render(
      <TrialClassFilters
        trials={trials}
        classes={[]}
        trialFilter={null}
        classFilter={null}
        onTrialChange={vi.fn()}
        onClassChange={vi.fn()}
      />
    );
    const classSelect = screen.getByLabelText('Filter by class');
    expect(classSelect).toBeDisabled();
  });

  it('enables class dropdown when trial is selected', () => {
    const classes = [{ id: 'c1', name: 'Novice Interior' }];
    render(
      <TrialClassFilters
        trials={trials}
        classes={classes}
        trialFilter="t1"
        classFilter={null}
        onTrialChange={vi.fn()}
        onClassChange={vi.fn()}
      />
    );
    const classSelect = screen.getByLabelText('Filter by class');
    expect(classSelect).not.toBeDisabled();
  });
});
```

**Step 2: Run tests to verify fail**

**Step 3: Implement**

Two `<select>` dropdowns styled consistently with the existing `EntryFiltersCard` pattern. Trial dropdown lists trials with formatted date. Class dropdown lists classes for the selected trial, disabled when no trial. Uses existing `Select` component or plain `<select>` matching the filter card pattern.

[ADDED] **Loading state:** Show skeleton/spinner in trial dropdown while `useShowTrials` is loading. Show skeleton in class dropdown while `useClassesByTrialQuery` is loading.

[ADDED] **Empty state:** If no trials exist for the show, show "No trials" in the dropdown. If no classes for the trial, show "No classes" in the class dropdown.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat(entries): add TrialClassFilters dropdown component"
```

---

## Task 4: Filter Breadcrumb Component

**Files:**
- Create: `apps/myk9show/src/components/entries/management/FilterBreadcrumb.tsx`
- Test: `apps/myk9show/src/test/components/entries/FilterBreadcrumb.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@/test/utils/testUtils';
import { FilterBreadcrumb } from '@/components/entries/management/FilterBreadcrumb';

describe('FilterBreadcrumb', () => {
  it('renders nothing when no filters active', () => {
    const { container } = render(
      <FilterBreadcrumb trialName={null} className={null} onClearTrial={vi.fn()} onClearClass={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows trial name when trial filter active', () => {
    render(
      <FilterBreadcrumb trialName="Trial 1 (Apr 1)" className={null} onClearTrial={vi.fn()} onClearClass={vi.fn()} />
    );
    expect(screen.getByText('All Entries')).toBeInTheDocument();
    expect(screen.getByText('Trial 1 (Apr 1)')).toBeInTheDocument();
  });

  it('shows trial + class when both filters active', () => {
    render(
      <FilterBreadcrumb trialName="Trial 1 (Apr 1)" className="Novice Interior" onClearTrial={vi.fn()} onClearClass={vi.fn()} />
    );
    expect(screen.getByText('All Entries')).toBeInTheDocument();
    expect(screen.getByText('Trial 1 (Apr 1)')).toBeInTheDocument();
    expect(screen.getByText('Novice Interior')).toBeInTheDocument();
  });

  it('calls onClearTrial when "All Entries" is clicked', async () => {
    const onClearTrial = vi.fn();
    const { user } = render(
      <FilterBreadcrumb trialName="Trial 1" className={null} onClearTrial={onClearTrial} onClearClass={vi.fn()} />
    );
    await user.click(screen.getByText('All Entries'));
    expect(onClearTrial).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify fail**

**Step 3: Implement**

Simple breadcrumb: `All Entries > Trial Name > Class Name`. Each segment clickable to widen filter. Uses `ChevronRight` icon separator. Styled with `text-sm text-muted-foreground` and `hover:text-foreground` on clickable segments.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat(entries): add FilterBreadcrumb navigation component"
```

---

## Task 5: Trial Roster View Component

**Files:**
- Create: `apps/myk9show/src/components/entries/management/TrialRosterView.tsx`
- Test: `apps/myk9show/src/test/components/entries/TrialRosterView.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@/test/utils/testUtils';
import { TrialRosterView } from '@/components/entries/management/TrialRosterView';

describe('TrialRosterView', () => {
  const entries = [
    {
      id: '1', armband: '101', dogName: 'Buddy', handlerName: 'Jane',
      className: 'Novice Interior', classId: 'c1', isScored: true,
      checkInStatus: 'checked_in' as const,
    },
    {
      id: '2', armband: '102', dogName: 'Rex', handlerName: 'John',
      className: 'Novice Interior', classId: 'c1', isScored: false,
      checkInStatus: null,
    },
  ];

  it('renders entries with armband, dog, handler, class columns', () => {
    render(<TrialRosterView entries={entries} onClassClick={vi.fn()} />);
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
  });

  it('shows scoring status badges', () => {
    render(<TrialRosterView entries={entries} onClassClick={vi.fn()} />);
    expect(screen.getByText('Scored')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('calls onClassClick when class name is clicked', async () => {
    const onClassClick = vi.fn();
    const { user } = render(<TrialRosterView entries={entries} onClassClick={onClassClick} />);
    await user.click(screen.getAllByText('Novice Interior')[0]);
    expect(onClassClick).toHaveBeenCalledWith('c1');
  });
});
```

**Step 2: Run tests to verify fail**

**Step 3: Implement**

Uses `DataTable` with columns: Armband (ArmbandBadge), Dog (name), Handler, Class (clickable button that calls `onClassClick(classId)`), Check-In (CheckInStatusBadge), Scoring (Badge: "Scored" green / "Pending" muted). Read-only — no editing.

Data comes from `useTrialEntries(trialId)` — the hook already exists and returns `TrialEntryRow[]`. The component maps these to display rows.

[ADDED] **Class grouping with collapsible headers:** Group entries by `class.id`. Render a collapsible header per class showing `className — 4/12 scored`. Use a `Collapsible` component (already exists in `@myk9/ui`). Default all groups expanded.

[ADDED] **Empty state:** If `entries` is empty, render `EmptyState` with "No entries for this trial" message.

[ADDED] **Loading state:** Accept an `isLoading` prop. When true, render `LoadingSkeleton`.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat(entries): add TrialRosterView component"
```

---

## Task 6: Wire Filters and Views into EntryManagementPage

**Files:**
- Modify: `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx`
- Modify: `apps/myk9show/src/hooks/useEntryManagementData.ts` (add trial/class data)

**Step 1: Add trial/class data to useEntryManagementData**

Add to the data hook:
- Call `useShowTrials(selectedShowId)` to fetch trials for the selected show
- Call `useClassesByTrialQuery(trialFilter)` to fetch classes when trial is selected
- Return `trials`, `trialClasses` alongside existing data

**Step 2: Update EntryManagementPage to use viewMode**

In `EntryManagementPage.tsx`:
- Destructure `trialFilter`, `classFilter`, `viewMode`, `setTrialFilter`, `setClassFilter` from the filters hook
- Render `TrialClassFilters` above the existing `EntryFiltersCard`
- Render `FilterBreadcrumb` below the filters
- Conditional rendering based on `viewMode`:
  - `'registration'` → current behavior (tabs, EntryListCard/EntriesTableView)
  - `'roster'` → `TrialRosterView` (with `onClassClick` → `setClassFilter`)
  - `'scoring'` → `ClassResultsTable` (reused from class detail page)
- Hide registration tabs when `viewMode !== 'registration'`

[ADDED] **Step 2b: Update stats cards for view mode**

`EntryStatsCards` currently shows: Total, Pending, Accepted, Waitlist, Revenue. Add a `viewMode` prop:
- `'registration'` → current stats (unchanged)
- `'roster'` → Total Entries, Scored, Pending, Checked In, Absent (computed from `useTrialEntries` data)
- `'scoring'` → hide stats cards entirely (ClassResultsTable has its own SubTabs with counts)

**Step 3: Wire ClassResultsTable for scoring mode [EXPANDED]**

When `viewMode === 'scoring'`:

**Decision: Reuse the full `ClassResultsTable` component** (not just the hook). It already handles SubTabs, SearchBar, ViewToggle, Submit, card/table view, and keyboard navigation. Extracting columns would duplicate this orchestration logic.

**Data bridge — the key challenge:**
`ClassResultsTable` requires these props (see `ClassResultsTableProps` in `types.ts`):
- `entries: ScentWorkEntry[]` — mapped from `useClassEntriesWithQuery(classId)`
- `rawEntries: RawEntryRow[]` — from `useClassEntriesRaw(classId)`
- `classConfig: ScentWorkClassConfig` — from class metadata (element, level, section, maxTime, etc.)
- `userPermissions: UserPermissions` — already available in EntryManagementPage via auth context
- `classId: string` — the `classFilter` value
- `classStatus`, `resultsReleasedAt` — from class metadata

**Approach:** Create a wrapper component `ScoringModeWrapper` that:
1. Calls `useClassEntriesWithQuery(classFilter)` and `useClassEntriesRaw(classFilter)` to get entries in the right shape
2. Calls `useClassStoreCompat()` to get class metadata → build `classConfig`
3. Builds `userPermissions` from auth context (secretary = canEditEntries + canViewResults)
4. Passes all props to `ClassResultsTable`
5. Shows loading state while data loads, error state on failure

This wrapper is ~50 lines — it's a data adapter, not new UI.

**Action bar:** Above `ClassResultsTable`, render a row with "Back to Trial" button (calls `setClassFilter(null)`) and the class name as a heading. The Submit button is inside `ClassResultsTable` already.

[ADDED] **Error handling:** If `useClassEntriesRaw` or `useClassEntriesWithQuery` returns an error, render an error card with "Failed to load entries" + retry button. Don't render ClassResultsTable with partial data.

**Step 4: Run typecheck and existing tests**

Run: `cd apps/myk9show && npx tsc --noEmit`
Run: `cd apps/myk9show && npx vitest run src/test/hooks/useEntryManagement*.test.ts`

**Step 5: Commit**

```bash
git commit -m "feat(entries): wire trial/class filters and view switching into EntryManagementPage"
```

---

## Task 7: Deep Links from Detail Pages

**Files:**
- Modify: `apps/myk9show/src/pages/TrialDetailsPage.tsx`
- Modify: `apps/myk9show/src/pages/ClassDetailsPage/index.tsx`

**Step 1: Add "Manage Entries" link to TrialDetailsPage**

In the DetailHero `secondaryActions` area, add a `Button` with `variant="outline"` that navigates to `/secretary/entries/${showId}?trial=${trialId}`. Only show for secretary/admin roles.

**Step 2: Add "Score in Entry Management" link to ClassDetailsPage**

In the ClassCompactHeader actions area, add a link button to `/secretary/entries/${showId}?trial=${trialId}&class=${classId}`. Only show for secretary/admin roles.

**Step 3: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`

**Step 4: Commit**

```bash
git commit -m "feat(entries): add deep links from detail pages to Entry Management"
```

---

## Task 8: Integration Testing and Polish

**Files:**
- Test: `apps/myk9show/src/test/pages/EntryManagementPage.test.tsx` (update existing)

**Step 1: Add integration tests**

Test the full flow:
- Render EntryManagementPage with mock data
- Select a trial → verify roster view renders
- Click a class name → verify scoring view renders
- Click breadcrumb "All Entries" → verify registration view returns

**Step 2: Run full test suite**

Run: `cd apps/myk9show && pnpm test`

**Step 3: Run typecheck**

Run: `pnpm typecheck`

**Step 4: Final commit**

```bash
git commit -m "test(entries): add integration tests for Entry Management scoring flow"
```

---

## Task Summary

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Trial/class filter state + URL sync + show-change reset | Low |
| 2 | useShowTrials query hook | Low |
| 3 | TrialClassFilters dropdown component (with loading/empty states) | Low |
| 4 | FilterBreadcrumb component | Low |
| 5 | TrialRosterView component (with class grouping, empty/loading states) | Medium |
| 6 | Wire views + ScoringModeWrapper data bridge + stats cards | High |
| 7 | Deep links from detail pages | Low |
| 8 | Integration tests and polish | Medium |

## Verification Notes

[ADDED] Key risk: Task 6's `ScoringModeWrapper` is the critical integration point. It must correctly provide `ScentWorkEntry[]`, `RawEntryRow[]`, and `ScentWorkClassConfig` to `ClassResultsTable`. Verify by testing that inline scoring works end-to-end (edit a time field, submit, verify replication layer write). If the data shapes don't align, the scoring will silently fail or crash.

[ADDED] The `useClassEntriesWithQuery` and `useClassEntriesRaw` hooks both take `classId` and handle their own fetching — the wrapper just needs to call them and pass results through. The class metadata (for `classConfig`) can come from the class store or a direct query.
