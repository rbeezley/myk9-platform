# Check-In Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated secretary check-in report page at `/secretary/check-in` that shows all entries for a show grouped by dog/armband, with real-time updates, filtering, and one-click check-in actions.

**Architecture:** A new page component queries entries for the selected show via React Query, groups them client-side by dog+handler+armband, and renders an expandable card list sorted by urgency. A Supabase real-time subscription invalidates the query cache when check-in statuses change. Filters (search, trial, status) are client-side on the grouped data.

**Tech Stack:** React, TypeScript, React Query, Supabase (PostgREST + Realtime), Tailwind, shadcn/ui, Lucide icons, `@myk9/core` check-in status config

**Spec:** `docs/superpowers/specs/2026-03-30-check-in-report-design.md`

---

## File Structure

### New Files

| File                                                             | Responsibility                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/hooks/queries/useCheckInReport.ts`                          | React Query hook: fetch entries for show, group by dog/armband |
| `src/hooks/useShowCheckInSubscription.ts`                        | Show-level Supabase real-time subscription                     |
| `src/components/checkin/CheckInProgressBar.tsx`                  | Segmented progress bar with legend                             |
| `src/components/checkin/CheckInClassRow.tsx`                     | Per-class row inside expanded card                             |
| `src/components/checkin/CheckInExhibitorCard.tsx`                | Expandable exhibitor card                                      |
| `src/pages/secretary/CheckInReportPage.tsx`                      | Page component                                                 |
| `src/hooks/queries/__tests__/useCheckInReport.test.ts`           | Hook unit tests                                                |
| `src/components/checkin/__tests__/CheckInProgressBar.test.tsx`   | Progress bar tests                                             |
| `src/components/checkin/__tests__/CheckInClassRow.test.tsx`      | Class row tests                                                |
| `src/components/checkin/__tests__/CheckInExhibitorCard.test.tsx` | Card tests                                                     |
| `src/pages/__tests__/CheckInReportPage.test.tsx`                 | Page integration tests                                         |

### Modified Files

| File                                                    | Change                                |
| ------------------------------------------------------- | ------------------------------------- |
| `src/lib/queryClient.ts`                                | Add `checkInReport` query key factory |
| `src/routes/secretaryRoutes.tsx`                        | Add `/secretary/check-in` route       |
| `src/components/layout/sidebar/unifiedSidebarConfig.ts` | Add "Check-In" sidebar entry          |

All file paths below are relative to `apps/myk9show/`.

---

## Task 1: Add Query Key

**Files:**

- Modify: `src/lib/queryClient.ts:232-233`

- [ ] **Step 1: Add the query key factory**

In `src/lib/queryClient.ts`, find the `// Exhibitor Analytics` comment block (around line 231) and add the new key after the analytics keys but before the legacy aliases:

```typescript
  // Exhibitor Analytics
  myShowStats: (showId: string) => ['analytics', 'show', showId] as const,
  myLifetimeStats: () => ['analytics', 'lifetime'] as const,

  // Public Show & Judge Analytics
  showStats: (showId: string) => ['analytics', 'show-stats', showId] as const,
  showJudges: (showId: string) => ['analytics', 'show-judges', showId] as const,
  judgeShowStats: (judgeId: string, showId: string) =>
    ['analytics', 'judge-show-stats', judgeId, showId] as const,

  // Check-In Report
  checkInReport: (showId: string) => ['check-in-report', showId] as const,

  // Legacy aliases for backward compatibility with existing showEntries key
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/lib/queryClient.ts
git commit -m "feat(check-in): add checkInReport query key"
```

---

## Task 2: Data Hook — useCheckInReport

**Files:**

- Create: `src/hooks/queries/useCheckInReport.ts`
- Test: `src/hooks/queries/__tests__/useCheckInReport.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/queries/__tests__/useCheckInReport.test.ts`:

```typescript
import {
  groupEntriesByExhibitor,
  deriveSummaryStatus,
  buildClassDisplayName,
} from '../useCheckInReport';

describe('groupEntriesByExhibitor', () => {
  const makeEntry = (
    overrides: Partial<{
      id: string;
      dog_id: string;
      handler_id: string;
      armband_number: number;
      handler_first_name: string;
      handler_last_name: string;
      dog_call_name: string;
      dog_breed_name: string;
      check_in_status: string;
      class_id: string;
      element: string;
      level: string;
      section: string | null;
      trial_id: string;
      trial_date: string;
      trial_number: number;
    }> = {}
  ) => ({
    id: 'entry-1',
    dog_id: 'dog-1',
    handler_id: 'handler-1',
    armband_number: 142,
    handler_first_name: 'Sarah',
    handler_last_name: 'Mitchell',
    dog_call_name: 'Buddy',
    dog_breed_name: 'Golden Retriever',
    check_in_status: 'no-status',
    class_id: 'class-1',
    element: 'Buried',
    level: 'Novice',
    section: null,
    trial_id: 'trial-1',
    trial_date: '2026-04-12',
    trial_number: 1,
    ...overrides,
  });

  it('groups entries by dog_id + handler_id', () => {
    const entries = [
      makeEntry({ id: 'e1', class_id: 'c1', element: 'Buried' }),
      makeEntry({ id: 'e2', class_id: 'c2', element: 'Interior' }),
    ];
    const groups = groupEntriesByExhibitor(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].armbandNumber).toBe(142);
    expect(groups[0].handlerName).toBe('Sarah Mitchell');
    expect(groups[0].dogName).toBe('Buddy');
  });

  it('creates separate groups for different dogs', () => {
    const entries = [
      makeEntry({ id: 'e1', dog_id: 'dog-1', armband_number: 142 }),
      makeEntry({ id: 'e2', dog_id: 'dog-2', armband_number: 143, dog_call_name: 'Daisy' }),
    ];
    const groups = groupEntriesByExhibitor(entries);
    expect(groups).toHaveLength(2);
  });

  it('sorts groups by armband number', () => {
    const entries = [
      makeEntry({ id: 'e1', dog_id: 'dog-2', armband_number: 200, dog_call_name: 'Ziggy' }),
      makeEntry({ id: 'e2', dog_id: 'dog-1', armband_number: 100 }),
    ];
    const groups = groupEntriesByExhibitor(entries);
    expect(groups[0].armbandNumber).toBe(100);
    expect(groups[1].armbandNumber).toBe(200);
  });
});

describe('deriveSummaryStatus', () => {
  it('returns "none" when all entries have no-status', () => {
    expect(deriveSummaryStatus(['no-status', 'no-status'])).toBe('none');
  });

  it('returns "checked-in" when all entries have a non-none status', () => {
    expect(deriveSummaryStatus(['checked-in', 'completed', 'in-ring'])).toBe('checked-in');
  });

  it('returns "partial" when some entries are checked in and some are not', () => {
    expect(deriveSummaryStatus(['checked-in', 'no-status'])).toBe('partial');
  });

  it('treats pulled entries as having a status (not none)', () => {
    expect(deriveSummaryStatus(['pulled', 'checked-in'])).toBe('checked-in');
  });
});

describe('buildClassDisplayName', () => {
  it('formats with day abbreviation, trial number, element, and level', () => {
    const result = buildClassDisplayName({
      element: 'Buried',
      level: 'Novice',
      section: null,
      trialDate: '2026-04-12',
      trialNumber: 1,
    });
    // April 12, 2026 is a Sunday
    expect(result).toBe('Sun T1: Buried Novice');
  });

  it('includes section for Novice level', () => {
    const result = buildClassDisplayName({
      element: 'Buried',
      level: 'Novice',
      section: 'A',
      trialDate: '2026-04-12',
      trialNumber: 1,
    });
    expect(result).toBe('Sun T1: Buried Novice A');
  });

  it('omits section for non-Novice levels', () => {
    const result = buildClassDisplayName({
      element: 'Buried',
      level: 'Advanced',
      section: 'A',
      trialDate: '2026-04-12',
      trialNumber: 1,
    });
    expect(result).toBe('Sun T1: Buried Advanced');
  });

  it('omits section for Detective element', () => {
    const result = buildClassDisplayName({
      element: 'Detective',
      level: 'Novice',
      section: 'A',
      trialDate: '2026-04-12',
      trialNumber: 1,
    });
    expect(result).toBe('Sun T1: Detective Novice');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useCheckInReport.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/hooks/queries/useCheckInReport.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { supabase } from '@/services/database/supabaseClient';
import { shouldShowSection } from '@/components/classes/ClassDetailsMain.helpers';

// ============================================================================
// Types
// ============================================================================

/** Raw row returned by the Supabase query */
export interface CheckInEntryRow {
  id: string;
  dog_id: string;
  handler_id: string;
  check_in_status: string | null;
  armband_number: number | null;
  handler_first_name: string | null;
  handler_last_name: string | null;
  dog_call_name: string | null;
  dog_breed_name: string | null;
  class_id: string;
  element: string | null;
  level: string | null;
  section: string | null;
  trial_id: string;
  trial_date: string;
  trial_number: number;
}

/** A single class entry within a group */
export interface CheckInClassEntry {
  entryId: string;
  classId: string;
  className: string;
  checkInStatus: string;
  trialId: string;
}

/** One card in the check-in report (one dog + handler + armband) */
export interface ExhibitorCheckInGroup {
  key: string; // dog_id:handler_id
  armbandNumber: number;
  handlerName: string;
  dogName: string;
  dogBreed: string;
  entries: CheckInClassEntry[];
  totalEntries: number;
  checkedInCount: number;
  summaryStatus: 'none' | 'partial' | 'checked-in';
}

// ============================================================================
// Pure Functions (exported for testing)
// ============================================================================

const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Build a short class display name: "Sat T1: Buried Novice A" */
export function buildClassDisplayName(params: {
  element: string | null;
  level: string | null;
  section: string | null;
  trialDate: string;
  trialNumber: number;
}): string {
  const { element, level, section, trialDate, trialNumber } = params;
  const date = new Date(trialDate + 'T00:00:00');
  const dayAbbrev = DAY_ABBREVS[date.getDay()];
  const showSection = shouldShowSection({
    element: element ?? undefined,
    level: level ?? undefined,
    section: section ?? undefined,
  });
  const parts = [element, level, showSection ? section : null].filter(Boolean);
  return `${dayAbbrev} T${trialNumber}: ${parts.join(' ')}`;
}

/** Derive summary status from an array of individual statuses */
export function deriveSummaryStatus(statuses: string[]): 'none' | 'partial' | 'checked-in' {
  const hasNone = statuses.some(s => s === 'no-status' || !s);
  const hasCheckedIn = statuses.some(s => s !== 'no-status' && !!s);
  if (hasNone && hasCheckedIn) return 'partial';
  if (hasCheckedIn) return 'checked-in';
  return 'none';
}

/** Group flat entry rows into ExhibitorCheckInGroup cards */
export function groupEntriesByExhibitor(rows: CheckInEntryRow[]): ExhibitorCheckInGroup[] {
  const map = new Map<
    string,
    {
      group: Omit<ExhibitorCheckInGroup, 'summaryStatus' | 'checkedInCount' | 'totalEntries'>;
      statuses: string[];
    }
  >();

  for (const row of rows) {
    const key = `${row.dog_id}:${row.handler_id}`;
    const status = row.check_in_status || 'no-status';

    if (!map.has(key)) {
      map.set(key, {
        group: {
          key,
          armbandNumber: row.armband_number ?? 0,
          handlerName:
            [row.handler_first_name, row.handler_last_name].filter(Boolean).join(' ') || 'Unknown',
          dogName: row.dog_call_name || 'Unknown',
          dogBreed: row.dog_breed_name || '',
          entries: [],
        },
        statuses: [],
      });
    }

    const item = map.get(key)!;
    item.group.entries.push({
      entryId: row.id,
      classId: row.class_id,
      className: buildClassDisplayName({
        element: row.element,
        level: row.level,
        section: row.section,
        trialDate: row.trial_date,
        trialNumber: row.trial_number,
      }),
      checkInStatus: status,
      trialId: row.trial_id,
    });
    item.statuses.push(status);
  }

  return Array.from(map.values())
    .map(({ group, statuses }) => ({
      ...group,
      totalEntries: statuses.length,
      checkedInCount: statuses.filter(s => s !== 'no-status' && !!s).length,
      summaryStatus: deriveSummaryStatus(statuses),
    }))
    .sort((a, b) => a.armbandNumber - b.armbandNumber);
}

// ============================================================================
// Query Function
// ============================================================================

async function fetchCheckInEntries(showId: string): Promise<CheckInEntryRow[]> {
  const { data, error } = await supabase
    .from('entries')
    .select(
      `
      id,
      dog_id,
      check_in_status,
      class_id,
      dog:dogs!inner(id, call_name, breed_name),
      handler:people!entries_handler_id_fkey(id, first_name, last_name),
      armband:armbands!inner(armband_number),
      class:classes!inner(
        id, element, level, section,
        trial:trials!inner(id, trial_date, trial_number, show_id)
      )
    `
    )
    .eq('class.trial.show_id', showId)
    .is('deleted_at', null);

  if (error) throw error;

  // Flatten the joined result into CheckInEntryRow shape
  return (data ?? []).map((row: Record<string, unknown>) => {
    const dog = row.dog as Record<string, unknown> | null;
    const handler = row.handler as Record<string, unknown> | null;
    const armband = row.armband as Record<string, unknown> | null;
    const cls = row.class as Record<string, unknown> | null;
    const trial = cls?.trial as Record<string, unknown> | null;

    return {
      id: row.id as string,
      dog_id: (dog?.id as string) ?? '',
      handler_id: (handler?.id as string) ?? '',
      check_in_status: (row.check_in_status as string) ?? 'no-status',
      armband_number: (armband?.armband_number as number) ?? null,
      handler_first_name: (handler?.first_name as string) ?? null,
      handler_last_name: (handler?.last_name as string) ?? null,
      dog_call_name: (dog?.call_name as string) ?? null,
      dog_breed_name: (dog?.breed_name as string) ?? null,
      class_id: (cls?.id as string) ?? '',
      element: (cls?.element as string) ?? null,
      level: (cls?.level as string) ?? null,
      section: (cls?.section as string) ?? null,
      trial_id: (trial?.id as string) ?? '',
      trial_date: (trial?.trial_date as string) ?? '',
      trial_number: (trial?.trial_number as number) ?? 1,
    };
  });
}

// ============================================================================
// Hook
// ============================================================================

export function useCheckInReport(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.checkInReport(showId ?? ''),
    queryFn: async () => {
      const rows = await fetchCheckInEntries(showId!);
      return groupEntriesByExhibitor(rows);
    },
    enabled: !!showId,
    ...cacheStrategies.realtime,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useCheckInReport.test.ts`
Expected: All tests pass

- [ ] **Step 5: Verify typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useCheckInReport.ts apps/myk9show/src/hooks/queries/__tests__/useCheckInReport.test.ts
git commit -m "feat(check-in): add useCheckInReport hook with grouping logic"
```

---

## Task 3: Real-Time Subscription — useShowCheckInSubscription

**Files:**

- Create: `src/hooks/useShowCheckInSubscription.ts`

- [ ] **Step 1: Write the subscription hook**

Create `src/hooks/useShowCheckInSubscription.ts`:

```typescript
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryClient';

/**
 * Subscribes to real-time check-in status changes for all entries in a show.
 * Invalidates the check-in report query cache when any entry's status changes.
 *
 * Uses the entries table filtered by class→trial→show relationship.
 * Since Supabase real-time filters are limited to direct column equality,
 * we subscribe to all entry updates and let React Query deduplication handle
 * the invalidation efficiently.
 */
export function useShowCheckInSubscription(showId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!showId) return;

    const channel = supabase.channel(`checkin-report:${showId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'entries',
        },
        payload => {
          // Only invalidate if check_in_status actually changed
          const oldStatus = (payload.old as Record<string, unknown>)?.check_in_status;
          const newStatus = (payload.new as Record<string, unknown>)?.check_in_status;
          if (oldStatus !== newStatus) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.checkInReport(showId),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showId, queryClient]);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/hooks/useShowCheckInSubscription.ts
git commit -m "feat(check-in): add show-level real-time subscription"
```

---

## Task 4: CheckInProgressBar Component

**Files:**

- Create: `src/components/checkin/CheckInProgressBar.tsx`
- Test: `src/components/checkin/__tests__/CheckInProgressBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/checkin/__tests__/CheckInProgressBar.test.tsx`:

```typescript
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { CheckInProgressBar } from '../CheckInProgressBar';

describe('CheckInProgressBar', () => {
  it('renders counts for each status group', () => {
    render(
      <CheckInProgressBar
        checkedInCount={27}
        partialCount={8}
        noneCount={12}
        totalEntries={47}
      />
    );
    expect(screen.getByText(/Checked In 27/)).toBeInTheDocument();
    expect(screen.getByText(/Partial 8/)).toBeInTheDocument();
    expect(screen.getByText(/Not Checked In 12/)).toBeInTheDocument();
  });

  it('shows percentage', () => {
    render(
      <CheckInProgressBar
        checkedInCount={27}
        partialCount={8}
        noneCount={12}
        totalEntries={47}
      />
    );
    // 35 / 47 = 74%
    expect(screen.getByText(/35 \/ 47/)).toBeInTheDocument();
    expect(screen.getByText(/74%/)).toBeInTheDocument();
  });

  it('handles zero entries gracefully', () => {
    render(
      <CheckInProgressBar
        checkedInCount={0}
        partialCount={0}
        noneCount={0}
        totalEntries={0}
      />
    );
    expect(screen.getByText(/0 \/ 0/)).toBeInTheDocument();
  });

  it('renders progress bar segments', () => {
    const { container } = render(
      <CheckInProgressBar
        checkedInCount={10}
        partialCount={5}
        noneCount={5}
        totalEntries={20}
      />
    );
    // Three segments exist in the progress bar
    const segments = container.querySelectorAll('[data-testid="progress-segment"]');
    expect(segments).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/checkin/__tests__/CheckInProgressBar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `src/components/checkin/CheckInProgressBar.tsx`:

```typescript
interface CheckInProgressBarProps {
  checkedInCount: number;
  partialCount: number;
  noneCount: number;
  totalEntries: number;
}

export function CheckInProgressBar({
  checkedInCount,
  partialCount,
  noneCount,
  totalEntries,
}: CheckInProgressBarProps) {
  const actionableCount = checkedInCount + partialCount;
  const percentage = totalEntries > 0 ? Math.round((actionableCount / totalEntries) * 100) : 0;

  const checkedInPct = totalEntries > 0 ? (checkedInCount / totalEntries) * 100 : 0;
  const partialPct = totalEntries > 0 ? (partialCount / totalEntries) * 100 : 0;
  const nonePct = totalEntries > 0 ? (noneCount / totalEntries) * 100 : 0;

  return (
    <div className="rounded-xl bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold">Check-In Progress</span>
        <span className="text-muted-foreground">
          {actionableCount} / {totalEntries} &middot; {percentage}%
        </span>
      </div>

      {/* Segmented progress bar */}
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          data-testid="progress-segment"
          className="transition-all duration-500"
          style={{
            width: `${checkedInPct}%`,
            backgroundColor: 'var(--checkin-checked-in)',
          }}
        />
        <div
          data-testid="progress-segment"
          className="transition-all duration-500"
          style={{
            width: `${partialPct}%`,
            backgroundColor: 'var(--checkin-conflict)',
          }}
        />
        <div
          data-testid="progress-segment"
          className="transition-all duration-500"
          style={{
            width: `${nonePct}%`,
            backgroundColor: 'var(--checkin-none)',
          }}
        />
      </div>

      {/* Legend */}
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span>
          <span style={{ color: 'var(--checkin-checked-in)' }}>&bull;</span> Checked In {checkedInCount}
        </span>
        <span>
          <span style={{ color: 'var(--checkin-conflict)' }}>&bull;</span> Partial {partialCount}
        </span>
        <span>
          <span style={{ color: 'var(--checkin-none)' }}>&bull;</span> Not Checked In {noneCount}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/checkin/__tests__/CheckInProgressBar.test.tsx`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/checkin/CheckInProgressBar.tsx apps/myk9show/src/components/checkin/__tests__/CheckInProgressBar.test.tsx
git commit -m "feat(check-in): add CheckInProgressBar component"
```

---

## Task 5: CheckInClassRow Component

**Files:**

- Create: `src/components/checkin/CheckInClassRow.tsx`
- Test: `src/components/checkin/__tests__/CheckInClassRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/checkin/__tests__/CheckInClassRow.test.tsx`:

```typescript
import { render, userEvent } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { CheckInClassRow } from '../CheckInClassRow';

describe('CheckInClassRow', () => {
  const defaultProps = {
    entryId: 'entry-1',
    className: 'Sat T1: Buried Novice',
    checkInStatus: 'no-status' as const,
    onCheckIn: vi.fn(),
  };

  it('renders class name', () => {
    render(<CheckInClassRow {...defaultProps} />);
    expect(screen.getByText('Sat T1: Buried Novice')).toBeInTheDocument();
  });

  it('shows Check In button when status is no-status', () => {
    render(<CheckInClassRow {...defaultProps} />);
    expect(screen.getByRole('button', { name: /check in/i })).toBeInTheDocument();
  });

  it('shows "Self check-in" attribution when checked in by exhibitor', () => {
    render(<CheckInClassRow {...defaultProps} checkInStatus="checked-in" />);
    expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Self check-in/)).toBeInTheDocument();
  });

  it('shows "Secretary" attribution when checked in by secretary [ADDED]', () => {
    render(<CheckInClassRow {...defaultProps} checkInStatus="checked-in" checkedBySecretary />);
    expect(screen.getByText(/Secretary/)).toBeInTheDocument();
  });

  it('shows status label for other statuses (at-gate, in-ring, etc)', () => {
    render(<CheckInClassRow {...defaultProps} checkInStatus="in-ring" />);
    expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
    expect(screen.getByText('In Ring')).toBeInTheDocument();
  });

  it('calls onCheckIn when Check In button is clicked', async () => {
    const onCheckIn = vi.fn();
    const { user } = render(<CheckInClassRow {...defaultProps} onCheckIn={onCheckIn} />);
    await user.click(screen.getByRole('button', { name: /check in/i }));
    expect(onCheckIn).toHaveBeenCalledWith('entry-1');
  });

  it('renders status dot with correct color variable', () => {
    const { container } = render(<CheckInClassRow {...defaultProps} checkInStatus="checked-in" />);
    const dot = container.querySelector('[data-testid="status-dot"]');
    expect(dot).toHaveStyle({ backgroundColor: 'var(--checkin-checked-in)' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/checkin/__tests__/CheckInClassRow.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `src/components/checkin/CheckInClassRow.tsx`:

```typescript
import { Button } from '@/components/ui/button';
import { getCheckinStatusConfig } from '@myk9/core';

interface CheckInClassRowProps {
  entryId: string;
  className: string;
  checkInStatus: string;
  onCheckIn: (entryId: string) => void;
  /** [ADDED] Whether this entry was checked in by the secretary this session */
  checkedBySecretary?: boolean;
}

export function CheckInClassRow({
  entryId,
  className,
  checkInStatus,
  onCheckIn,
  checkedBySecretary = false,
}: CheckInClassRowProps) {
  const config = getCheckinStatusConfig(checkInStatus);
  const isNone = checkInStatus === 'no-status' || !checkInStatus;
  const colorVar = config?.colorVar ?? '--checkin-none';
  const label = config?.label ?? 'No Status';

  return (
    <div className="flex items-center justify-between rounded-md bg-background px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span
          data-testid="status-dot"
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: `var(${colorVar})` }}
        />
        {className}
      </div>

      {isNone ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onCheckIn(entryId)}
        >
          Check In
        </Button>
      ) : (
        <span
          className="text-xs"
          style={{ color: `var(${colorVar})` }}
        >
          {/* [ADDED] Attribution: show who checked in */}
          {checkInStatus === 'checked-in'
            ? checkedBySecretary ? '✓ Secretary' : '✓ Self check-in'
            : label}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/checkin/__tests__/CheckInClassRow.test.tsx`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/checkin/CheckInClassRow.tsx apps/myk9show/src/components/checkin/__tests__/CheckInClassRow.test.tsx
git commit -m "feat(check-in): add CheckInClassRow component"
```

---

## Task 6: CheckInExhibitorCard Component

**Files:**

- Create: `src/components/checkin/CheckInExhibitorCard.tsx`
- Test: `src/components/checkin/__tests__/CheckInExhibitorCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/checkin/__tests__/CheckInExhibitorCard.test.tsx`:

```typescript
import { render, userEvent } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { CheckInExhibitorCard } from '../CheckInExhibitorCard';
import type { ExhibitorCheckInGroup } from '@/hooks/queries/useCheckInReport';

const makeGroup = (overrides: Partial<ExhibitorCheckInGroup> = {}): ExhibitorCheckInGroup => ({
  key: 'dog-1:handler-1',
  armbandNumber: 142,
  handlerName: 'Sarah Mitchell',
  dogName: 'Buddy',
  dogBreed: 'Golden Retriever',
  entries: [
    { entryId: 'e1', classId: 'c1', className: 'Sat T1: Buried Novice', checkInStatus: 'no-status', trialId: 't1' },
    { entryId: 'e2', classId: 'c2', className: 'Sat T1: Interior Novice', checkInStatus: 'no-status', trialId: 't1' },
    { entryId: 'e3', classId: 'c3', className: 'Sat T2: Buried Novice', checkInStatus: 'no-status', trialId: 't2' },
  ],
  totalEntries: 3,
  checkedInCount: 0,
  summaryStatus: 'none',
  ...overrides,
});

describe('CheckInExhibitorCard', () => {
  it('renders armband, handler name, and dog name', () => {
    render(<CheckInExhibitorCard group={makeGroup()} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />);
    expect(screen.getByText('#142')).toBeInTheDocument();
    expect(screen.getByText('Sarah Mitchell')).toBeInTheDocument();
    expect(screen.getByText(/Buddy/)).toBeInTheDocument();
  });

  it('shows "Check In All" button when no entries are checked in', () => {
    render(<CheckInExhibitorCard group={makeGroup()} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />);
    expect(screen.getByRole('button', { name: /check in all/i })).toBeInTheDocument();
  });

  it('shows "Check In Rest" button when partially checked in', () => {
    const group = makeGroup({
      checkedInCount: 1,
      summaryStatus: 'partial',
      entries: [
        { entryId: 'e1', classId: 'c1', className: 'Sat T1: Buried Nov', checkInStatus: 'checked-in', trialId: 't1' },
        { entryId: 'e2', classId: 'c2', className: 'Sat T1: Interior Nov', checkInStatus: 'no-status', trialId: 't1' },
      ],
      totalEntries: 2,
    });
    render(<CheckInExhibitorCard group={group} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />);
    expect(screen.getByRole('button', { name: /check in rest/i })).toBeInTheDocument();
  });

  it('shows checkmark when fully checked in', () => {
    const group = makeGroup({
      checkedInCount: 3,
      summaryStatus: 'checked-in',
      entries: [
        { entryId: 'e1', classId: 'c1', className: 'Sat T1: Buried Nov', checkInStatus: 'checked-in', trialId: 't1' },
        { entryId: 'e2', classId: 'c2', className: 'Sat T1: Interior Nov', checkInStatus: 'checked-in', trialId: 't1' },
        { entryId: 'e3', classId: 'c3', className: 'Sat T2: Buried Nov', checkInStatus: 'completed', trialId: 't2' },
      ],
      totalEntries: 3,
    });
    render(<CheckInExhibitorCard group={group} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
  });

  it('expands to show class rows on click', async () => {
    const { user } = render(<CheckInExhibitorCard group={makeGroup()} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />);
    // Class rows should not be visible initially
    expect(screen.queryByText('Sat T1: Buried Novice')).not.toBeInTheDocument();
    // Click the card header to expand
    await user.click(screen.getByTestId('exhibitor-card-header'));
    // Class rows should now be visible
    expect(screen.getByText('Sat T1: Buried Novice')).toBeInTheDocument();
    expect(screen.getByText('Sat T1: Interior Novice')).toBeInTheDocument();
    expect(screen.getByText('Sat T2: Buried Novice')).toBeInTheDocument();
  });

  it('calls onCheckInAll with unchecked entry IDs when button clicked', async () => {
    const onCheckInAll = vi.fn();
    const { user } = render(<CheckInExhibitorCard group={makeGroup()} onCheckIn={vi.fn()} onCheckInAll={onCheckInAll} />);
    await user.click(screen.getByRole('button', { name: /check in all/i }));
    expect(onCheckInAll).toHaveBeenCalledWith(['e1', 'e2', 'e3']);
  });

  it('shows checked-in count in subtitle', () => {
    render(<CheckInExhibitorCard group={makeGroup()} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />);
    expect(screen.getByText(/0\/3 checked in/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/checkin/__tests__/CheckInExhibitorCard.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `src/components/checkin/CheckInExhibitorCard.tsx`:

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { CheckInClassRow } from './CheckInClassRow';
import type { ExhibitorCheckInGroup } from '@/hooks/queries/useCheckInReport';

const SUMMARY_BORDER_COLOR: Record<string, string> = {
  none: 'var(--checkin-none)',
  partial: 'var(--checkin-conflict)',
  'checked-in': 'var(--checkin-checked-in)',
};

interface CheckInExhibitorCardProps {
  group: ExhibitorCheckInGroup;
  onCheckIn: (entryId: string) => void;
  onCheckInAll: (entryIds: string[]) => void;
  /** [ADDED] Entry IDs checked in by the secretary this session */
  secretaryCheckedIds?: Set<string>;
}

export function CheckInExhibitorCard({
  group,
  onCheckIn,
  onCheckInAll,
  secretaryCheckedIds = new Set(),
}: CheckInExhibitorCardProps) {
  const [expanded, setExpanded] = useState(false);

  const uncheckedEntryIds = group.entries
    .filter(e => e.checkInStatus === 'no-status' || !e.checkInStatus)
    .map(e => e.entryId);

  const borderColor = SUMMARY_BORDER_COLOR[group.summaryStatus] ?? 'var(--checkin-none)';
  const isDone = group.summaryStatus === 'checked-in';

  return (
    <div
      className="rounded-lg bg-card shadow-card"
      style={{
        borderLeft: `3px solid ${borderColor}`,
        opacity: isDone ? 0.7 : 1,
      }}
    >
      {/* Header — always visible */}
      <div
        data-testid="exhibitor-card-header"
        className="flex cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setExpanded(prev => !prev)}
      >
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-muted px-2.5 py-0.5 text-sm font-bold tabular-nums">
            #{group.armbandNumber}
          </span>
          <div>
            <div className="text-sm font-semibold">{group.handlerName}</div>
            <div className="text-xs text-muted-foreground">
              {group.dogName} &middot; {group.checkedInCount}/{group.totalEntries} checked in
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}

          {isDone ? (
            <Check className="h-5 w-5" style={{ color: 'var(--checkin-checked-in)' }} />
          ) : (
            <Button
              size="sm"
              className="h-8"
              onClick={(e) => {
                e.stopPropagation();
                onCheckInAll(uncheckedEntryIds);
              }}
            >
              {group.summaryStatus === 'none' ? 'Check In All' : 'Check In Rest'}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded class list */}
      {expanded && (
        <div className="space-y-1 px-4 pb-3" style={{ marginLeft: 54 }}>
          {group.entries.map(entry => (
            <CheckInClassRow
              key={entry.entryId}
              entryId={entry.entryId}
              className={entry.className}
              checkInStatus={entry.checkInStatus}
              onCheckIn={onCheckIn}
              checkedBySecretary={secretaryCheckedIds.has(entry.entryId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/checkin/__tests__/CheckInExhibitorCard.test.tsx`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/checkin/CheckInExhibitorCard.tsx apps/myk9show/src/components/checkin/__tests__/CheckInExhibitorCard.test.tsx
git commit -m "feat(check-in): add CheckInExhibitorCard component"
```

---

## Task 7: CheckInReportPage

**Files:**

- Create: `src/pages/secretary/CheckInReportPage.tsx`
- Test: `src/pages/__tests__/CheckInReportPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/pages/__tests__/CheckInReportPage.test.tsx`:

```typescript
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import CheckInReportPage from '../secretary/CheckInReportPage';

// Mock the stores
vi.mock('@/store/showStore', () => ({
  useShowStore: vi.fn(() => ({
    selectedShowId: 'show-1',
    shows: [{ id: 'show-1', name: 'Spring Scent Work Trial' }],
  })),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: vi.fn(() => ({
    trials: [
      { id: 't1', showId: 'show-1', trialDate: '2026-04-12', trialNumber: 1 },
      { id: 't2', showId: 'show-1', trialDate: '2026-04-12', trialNumber: 2 },
    ],
  })),
}));

// Mock the hook to return test data
vi.mock('@/hooks/queries/useCheckInReport', () => ({
  useCheckInReport: vi.fn(() => ({
    data: [
      {
        key: 'dog-1:h-1',
        armbandNumber: 142,
        handlerName: 'Sarah Mitchell',
        dogName: 'Buddy',
        dogBreed: 'Golden Retriever',
        entries: [
          { entryId: 'e1', classId: 'c1', className: 'Sat T1: Buried Nov', checkInStatus: 'no-status', trialId: 't1' },
        ],
        totalEntries: 1,
        checkedInCount: 0,
        summaryStatus: 'none',
      },
      {
        key: 'dog-2:h-2',
        armbandNumber: 200,
        handlerName: 'Jenny Park',
        dogName: 'Luna',
        dogBreed: 'Border Collie',
        entries: [
          { entryId: 'e2', classId: 'c2', className: 'Sat T1: Interior Nov', checkInStatus: 'checked-in', trialId: 't1' },
        ],
        totalEntries: 1,
        checkedInCount: 1,
        summaryStatus: 'checked-in',
      },
    ],
    isLoading: false,
    error: null,
  })),
}));

vi.mock('@/hooks/useShowCheckInSubscription', () => ({
  useShowCheckInSubscription: vi.fn(),
}));

describe('CheckInReportPage', () => {
  it('renders page title', () => {
    render(<CheckInReportPage />);
    expect(screen.getByText('Check-In')).toBeInTheDocument();
  });

  it('renders show name', () => {
    render(<CheckInReportPage />);
    expect(screen.getByText(/Spring Scent Work Trial/)).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    render(<CheckInReportPage />);
    expect(screen.getByText(/Check-In Progress/)).toBeInTheDocument();
  });

  it('renders exhibitor cards', () => {
    render(<CheckInReportPage />);
    expect(screen.getByText('Sarah Mitchell')).toBeInTheDocument();
    expect(screen.getByText('Jenny Park')).toBeInTheDocument();
  });

  it('renders search bar', () => {
    render(<CheckInReportPage />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('shows empty state when no show is selected', () => {
    const { useShowStore } = vi.mocked(await import('@/store/showStore'));
    useShowStore.mockReturnValueOnce({ selectedShowId: null, shows: [] } as never);
    render(<CheckInReportPage />);
    expect(screen.getByText(/select a show/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/__tests__/CheckInReportPage.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the page component**

Create `src/pages/secretary/CheckInReportPage.tsx`:

```typescript
import { useState, useMemo } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useCheckInReport } from '@/hooks/queries/useCheckInReport';
import { useShowCheckInSubscription } from '@/hooks/useShowCheckInSubscription';
import { CheckInProgressBar } from '@/components/checkin/CheckInProgressBar';
import { CheckInExhibitorCard } from '@/components/checkin/CheckInExhibitorCard';
import { SearchBar } from '@/components/common/SearchBar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@/lib/notifications'; // [ADDED] Error feedback
import type { ExhibitorCheckInGroup } from '@/hooks/queries/useCheckInReport';

type StatusFilter = 'needs-action' | 'done' | 'all';

export default function CheckInReportPage() {
  const { selectedShowId, shows } = useShowStore();
  const { trials } = useTrialStore();
  const queryClient = useQueryClient();

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;
  const showTrials = trials.filter(t => t.showId === selectedShowId);

  const { data: groups = [], isLoading } = useCheckInReport(selectedShowId ?? undefined);
  useShowCheckInSubscription(selectedShowId ?? undefined);

  // Filters
  const [search, setSearch] = useState('');
  const [trialFilter, setTrialFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('needs-action');

  // Track entries checked in by this session for attribution
  const [secretaryCheckedIds, setSecretaryCheckedIds] = useState<Set<string>>(new Set());

  // Filtered groups
  const filteredGroups = useMemo(() => {
    let result = groups;

    // Trial filter
    if (trialFilter !== 'all') {
      result = result
        .map(g => ({
          ...g,
          entries: g.entries.filter(e => e.trialId === trialFilter),
        }))
        .filter(g => g.entries.length > 0)
        .map(g => {
          const checkedInCount = g.entries.filter(e => e.checkInStatus !== 'no-status' && !!e.checkInStatus).length;
          const totalEntries = g.entries.length;
          const statuses = g.entries.map(e => e.checkInStatus);
          const hasNone = statuses.some(s => s === 'no-status' || !s);
          const hasCheckedIn = statuses.some(s => s !== 'no-status' && !!s);
          const summaryStatus: 'none' | 'partial' | 'checked-in' =
            hasNone && hasCheckedIn ? 'partial' : hasCheckedIn ? 'checked-in' : 'none';
          return { ...g, checkedInCount, totalEntries, summaryStatus };
        });
    }

    // Status filter
    if (statusFilter === 'needs-action') {
      result = result.filter(g => g.summaryStatus !== 'checked-in');
    } else if (statusFilter === 'done') {
      result = result.filter(g => g.summaryStatus === 'checked-in');
    }

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        g =>
          g.handlerName.toLowerCase().includes(q) ||
          g.dogName.toLowerCase().includes(q) ||
          String(g.armbandNumber).includes(q)
      );
    }

    // Sort: none first, then partial, then checked-in (within same status, by armband)
    const statusOrder = { none: 0, partial: 1, 'checked-in': 2 };
    return result.sort(
      (a, b) => statusOrder[a.summaryStatus] - statusOrder[b.summaryStatus] || a.armbandNumber - b.armbandNumber
    );
  }, [groups, trialFilter, statusFilter, search]);

  // Counts for filter badges
  const counts = useMemo(() => {
    const needsAction = groups.filter(g => g.summaryStatus !== 'checked-in').length;
    const done = groups.filter(g => g.summaryStatus === 'checked-in').length;
    return { needsAction, done, all: groups.length };
  }, [groups]);

  // Progress bar counts (entry-level, not group-level)
  const progressCounts = useMemo(() => {
    const checkedIn = groups.filter(g => g.summaryStatus === 'checked-in').reduce((sum, g) => sum + g.totalEntries, 0);
    const partial = groups.filter(g => g.summaryStatus === 'partial').reduce((sum, g) => sum + g.totalEntries, 0);
    const none = groups.filter(g => g.summaryStatus === 'none').reduce((sum, g) => sum + g.totalEntries, 0);
    const total = groups.reduce((sum, g) => sum + g.totalEntries, 0);
    return { checkedIn, partial, none, total };
  }, [groups]);

  // Check-in mutation [EXPANDED: added error toasts + optimistic updates]
  const handleCheckIn = async (entryId: string) => {
    // Optimistic: update cache immediately
    const previousData = queryClient.getQueryData<ExhibitorCheckInGroup[]>(
      queryKeys.checkInReport(selectedShowId!)
    );
    queryClient.setQueryData<ExhibitorCheckInGroup[]>(
      queryKeys.checkInReport(selectedShowId!),
      (old) => old?.map(g => ({
        ...g,
        entries: g.entries.map(e =>
          e.entryId === entryId ? { ...e, checkInStatus: 'checked-in' } : e
        ),
        checkedInCount: g.entries.filter(e =>
          e.entryId === entryId ? true : (e.checkInStatus !== 'no-status' && !!e.checkInStatus)
        ).length,
        summaryStatus: undefined as never, // recalculated below
      }))
    );

    const { error } = await supabase
      .from('entries')
      .update({ check_in_status: 'checked-in' })
      .eq('id', entryId);

    if (error) {
      // Rollback on error
      queryClient.setQueryData(queryKeys.checkInReport(selectedShowId!), previousData);
      notifications.error('Failed to check in entry');
    } else {
      setSecretaryCheckedIds(prev => new Set(prev).add(entryId));
      // Refetch for authoritative data
      queryClient.invalidateQueries({ queryKey: queryKeys.checkInReport(selectedShowId!) });
    }
  };

  const handleCheckInAll = async (entryIds: string[]) => {
    const entryIdSet = new Set(entryIds);
    // Optimistic: update cache immediately
    const previousData = queryClient.getQueryData<ExhibitorCheckInGroup[]>(
      queryKeys.checkInReport(selectedShowId!)
    );
    queryClient.setQueryData<ExhibitorCheckInGroup[]>(
      queryKeys.checkInReport(selectedShowId!),
      (old) => old?.map(g => ({
        ...g,
        entries: g.entries.map(e =>
          entryIdSet.has(e.entryId) ? { ...e, checkInStatus: 'checked-in' } : e
        ),
        checkedInCount: g.entries.length, // all checked in after batch
        summaryStatus: 'checked-in' as const,
      }))
    );

    const { error } = await supabase
      .from('entries')
      .update({ check_in_status: 'checked-in' })
      .in('id', entryIds);

    if (error) {
      queryClient.setQueryData(queryKeys.checkInReport(selectedShowId!), previousData);
      notifications.error('Failed to check in entries');
    } else {
      setSecretaryCheckedIds(prev => {
        const next = new Set(prev);
        entryIds.forEach(id => next.add(id));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.checkInReport(selectedShowId!) });
    }
  };

  // Empty state — no show selected
  if (!selectedShowId) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ClipboardCheck className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">Select a show to view check-in status.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Check-In</h1>
          {selectedShow && (
            <p className="text-sm text-muted-foreground">{selectedShow.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>

      {/* Progress bar */}
      {isLoading ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : (
        <CheckInProgressBar
          checkedInCount={progressCounts.checkedIn}
          partialCount={progressCounts.partial}
          noneCount={progressCounts.none}
          totalEntries={progressCounts.total}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] flex-1">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name or armband..."
          />
        </div>

        <Select value={trialFilter} onValueChange={setTrialFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Trials" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trials</SelectItem>
            {/* [EXPANDED] Show day abbreviation + trial number */}
            {showTrials.map(trial => {
              const dayAbbrevs = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              const day = new Date(trial.trialDate + 'T00:00:00');
              const label = `${dayAbbrevs[day.getDay()]} T${trial.trialNumber}`;
              return (
                <SelectItem key={trial.id} value={trial.id}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <div className="flex overflow-hidden rounded-lg border border-border">
          {(['needs-action', 'done', 'all'] as const).map(filter => (
            <button
              key={filter}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                statusFilter === filter
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => setStatusFilter(filter)}
            >
              {filter === 'needs-action' && `Needs Action · ${counts.needsAction}`}
              {filter === 'done' && `Done · ${counts.done}`}
              {filter === 'all' && `All · ${counts.all}`}
            </button>
          ))}
        </div>
      </div>

      {/* Exhibitor list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {groups.length === 0 ? 'No entries found for this show.' : 'No results match your filters.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map(group => (
            <CheckInExhibitorCard
              key={group.key}
              group={group}
              onCheckIn={handleCheckIn}
              onCheckInAll={handleCheckInAll}
              secretaryCheckedIds={secretaryCheckedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/pages/__tests__/CheckInReportPage.test.tsx`
Expected: All tests pass

- [ ] **Step 5: Verify typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/secretary/CheckInReportPage.tsx apps/myk9show/src/pages/__tests__/CheckInReportPage.test.tsx
git commit -m "feat(check-in): add CheckInReportPage"
```

---

## Task 8: Route and Sidebar Wiring

**Files:**

- Modify: `src/routes/secretaryRoutes.tsx`
- Modify: `src/components/layout/sidebar/unifiedSidebarConfig.ts`

- [ ] **Step 1: Add the route**

In `src/routes/secretaryRoutes.tsx`, add the lazy import near the top with the other secretary imports:

```typescript
const CheckInReportPage = lazy(() => import('@/pages/secretary/CheckInReportPage'));
```

Then add the route inside the `SecretaryRoutes` component, after the `/secretary/day-of` route (around line 174):

```typescript
    <Route
      path="/secretary/check-in"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <CheckInReportPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
```

- [ ] **Step 2: Add the sidebar entry**

In `src/components/layout/sidebar/unifiedSidebarConfig.ts`, add `ClipboardCheck` to the Lucide import:

```typescript
import {
  LayoutDashboard,
  Plus,
  FileText,
  ClipboardCheck,
  KanbanSquare,
  List,
  Settings,
} from 'lucide-react';
```

Then add the Check-In item after the "Day-of Ops" entry (after line 225) in the Manage group:

```typescript
        {
          title: 'Check-In',
          href: '/secretary/check-in',
          icon: ClipboardCheck,
          description: 'Check-in status and management',
        },
```

**Note:** Check if `ClipboardCheck` is already imported (Day-of Ops uses it). If so, no need to add the import. Use a different icon if there's a conflict — `UserCheck` from Lucide would also work for check-in.

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Verify dev server renders the page**

Run: `cd apps/myk9show && pnpm dev` (if not already running)
Navigate to `http://localhost:5173/secretary/check-in` while logged in as secretary.
Expected: Page renders with empty state or data depending on selected show.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/routes/secretaryRoutes.tsx apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts
git commit -m "feat(check-in): wire up route and sidebar entry"
```

---

## Task 9: Run Full Test Suite

- [ ] **Step 1: Run all myK9Show tests**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass, no regressions

- [ ] **Step 2: Run typecheck across monorepo**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No new warnings or errors

- [ ] **Step 4: Fix any issues found**

If any tests fail or lint errors appear, fix them before proceeding.

- [ ] **Step 5: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "fix(check-in): address test/lint issues from check-in report"
```
