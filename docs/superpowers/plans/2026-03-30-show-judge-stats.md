# Show Stats & Judge Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public Show Stats and Judge Stats sub-tabs to the Results tab on ShowDetailsPage, reusing existing analytics components.

**Architecture:** Results tab becomes a sub-tabbed container (Podium | Show Stats | Judge Stats) using the existing `SubTabs` component. Show Stats fetches all entries for a show; Judge Stats fetches entries for a selected judge's classes. Both compute stats client-side via existing `analytics-utils.ts` functions. A new `ClassBreakdownTable` component shows per-class Q rates for judges.

**Tech Stack:** React, TypeScript, React Query, Supabase, Recharts (via existing analytics components), SubTabs, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-30-show-judge-stats-design.md`

---

## File Structure

### New Files

| File                                                              | Responsibility                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| `src/hooks/queries/useShowStats.ts`                               | Hook: all entries for a show (no dog/user filter)      |
| `src/hooks/queries/useShowJudges.ts`                              | Hook: judges assigned to a show with names             |
| `src/hooks/queries/useJudgeShowStats.ts`                          | Hook: entries for classes assigned to a selected judge |
| `src/components/analytics/ShowStatsSubTab.tsx`                    | Show Stats sub-tab component                           |
| `src/components/analytics/JudgeStatsSubTab.tsx`                   | Judge Stats sub-tab with judge dropdown                |
| `src/components/analytics/ClassBreakdownTable.tsx`                | Per-class Q rate table                                 |
| `src/components/analytics/__tests__/ClassBreakdownTable.test.tsx` | ClassBreakdownTable tests                              |
| `src/components/analytics/__tests__/ShowStatsSubTab.test.tsx`     | ShowStatsSubTab tests                                  |
| `src/components/analytics/__tests__/JudgeStatsSubTab.test.tsx`    | JudgeStatsSubTab tests                                 |
| `src/test/hooks/useShowStats.test.ts`                             | useShowStats hook tests                                |
| `src/test/hooks/useJudgeShowStats.test.ts`                        | useJudgeShowStats hook tests                           |
| `src/test/hooks/useShowJudges.test.ts`                            | useShowJudges hook tests [ADDED]                       |

### Modified Files

| File                                          | Change                                                              |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/queryClient.ts`                      | Add `showStats`, `showJudges`, `judgeShowStats` query key factories |
| `src/components/analytics/analytics-utils.ts` | Add `ClassBreakdownEntry` type + `computeClassBreakdown()` function |
| `src/components/analytics/index.ts`           | Export new components                                               |
| `src/components/results/ShowResultsTab.tsx`   | Wrap with SubTabs (Podium / Show Stats / Judge Stats)               |
| `src/pages/ShowDetailsPage.tsx`               | No changes needed — `ShowResultsTab` handles sub-tabs internally    |

All file paths below are relative to `apps/myk9show/`.

---

## Task 1: Add Query Keys

**Files:**

- Modify: `src/lib/queryClient.ts:232-233`

- [ ] **Step 1: Add query key factories**

In `src/lib/queryClient.ts`, find the `// Exhibitor Analytics` comment block (around line 231) and add the new keys after it:

```typescript
  // Exhibitor Analytics
  myShowStats: (showId: string) => ['analytics', 'show', showId] as const,
  myLifetimeStats: () => ['analytics', 'lifetime'] as const,

  // Public Show & Judge Analytics
  showStats: (showId: string) => ['analytics', 'show-stats', showId] as const,
  showJudges: (showId: string) => ['analytics', 'show-judges', showId] as const,
  judgeShowStats: (judgeId: string, showId: string) =>
    ['analytics', 'judge-show-stats', judgeId, showId] as const,
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/lib/queryClient.ts
git commit -m "feat(analytics): add query keys for show and judge stats"
```

---

## Task 2: Add `computeClassBreakdown()` Utility

**Files:**

- Modify: `src/components/analytics/analytics-utils.ts`
- Modify: `src/components/analytics/__tests__/analytics-utils.test.ts`

- [ ] **Step 1: Write failing tests for `computeClassBreakdown`**

Add the following to the end of `src/components/analytics/__tests__/analytics-utils.test.ts`:

```typescript
import { computeClassBreakdown, type ClassBreakdownEntry } from '../analytics-utils';

describe('computeClassBreakdown', () => {
  it('returns empty array for empty entries', () => {
    expect(computeClassBreakdown([])).toEqual([]);
  });

  it('groups entries by classId and computes per-class stats', () => {
    const entries: StatsEntry[] = [
      makeEntry({
        id: 'e1',
        classId: 'c1',
        className: 'Containers Novice',
        classElement: 'Containers',
        classLevel: 'Novice',
        resultText: 'Q',
        searchTimeSeconds: 30,
      }),
      makeEntry({
        id: 'e2',
        classId: 'c1',
        className: 'Containers Novice',
        classElement: 'Containers',
        classLevel: 'Novice',
        resultText: 'Q',
        searchTimeSeconds: 45,
      }),
      makeEntry({
        id: 'e3',
        classId: 'c1',
        className: 'Containers Novice',
        classElement: 'Containers',
        classLevel: 'Novice',
        resultText: 'NQ',
        searchTimeSeconds: 60,
      }),
      makeEntry({
        id: 'e4',
        classId: 'c2',
        className: 'Interiors Excellent',
        classElement: 'Interiors',
        classLevel: 'Excellent',
        resultText: 'Q',
        searchTimeSeconds: 20,
      }),
    ];
    const result = computeClassBreakdown(entries);

    expect(result).toHaveLength(2);

    const c1 = result.find(r => r.classId === 'c1')!;
    expect(c1.className).toBe('Containers Novice');
    expect(c1.entryCount).toBe(3);
    expect(c1.qualifiedCount).toBe(2);
    expect(c1.qualificationRate).toBeCloseTo(2 / 3);
    expect(c1.bestTime).toBe(30);
    expect(c1.avgTime).toBeCloseTo(37.5);

    const c2 = result.find(r => r.classId === 'c2')!;
    expect(c2.entryCount).toBe(1);
    expect(c2.qualifiedCount).toBe(1);
    expect(c2.qualificationRate).toBe(1);
    expect(c2.bestTime).toBe(20);
    expect(c2.avgTime).toBe(20);
  });

  it('handles classes with no qualified entries', () => {
    const entries: StatsEntry[] = [
      makeEntry({ id: 'e1', classId: 'c1', resultText: 'NQ', searchTimeSeconds: 50 }),
      makeEntry({ id: 'e2', classId: 'c1', resultText: 'ABS', searchTimeSeconds: null }),
    ];
    const result = computeClassBreakdown(entries);

    expect(result).toHaveLength(1);
    expect(result[0].qualifiedCount).toBe(0);
    expect(result[0].qualificationRate).toBe(0);
    expect(result[0].bestTime).toBeNull();
    expect(result[0].avgTime).toBeNull();
  });

  it('sorts by trialDate, then trialNumber, then element, then level', () => {
    const entries: StatsEntry[] = [
      makeEntry({
        id: 'e1',
        classId: 'c2',
        classElement: 'Interiors',
        classLevel: 'Novice',
        trialDate: '2026-04-01',
        trialNumber: '1',
      }),
      makeEntry({
        id: 'e2',
        classId: 'c1',
        classElement: 'Containers',
        classLevel: 'Novice',
        trialDate: '2026-04-01',
        trialNumber: '1',
      }),
      makeEntry({
        id: 'e3',
        classId: 'c3',
        classElement: 'Containers',
        classLevel: 'Novice',
        trialDate: '2026-03-31',
        trialNumber: '2',
      }),
    ];
    const result = computeClassBreakdown(entries);

    expect(result[0].classId).toBe('c3'); // earliest date
    expect(result[1].classId).toBe('c1'); // same date, Containers < Interiors
    expect(result[2].classId).toBe('c2');
  });

  it('includes pending (unscored) entries in entry count but not Q rate', () => {
    const entries: StatsEntry[] = [
      makeEntry({ id: 'e1', classId: 'c1', resultText: 'Q', searchTimeSeconds: 30 }),
      makeEntry({ id: 'e2', classId: 'c1', resultText: 'pending', searchTimeSeconds: null }),
    ];
    const result = computeClassBreakdown(entries);

    expect(result[0].entryCount).toBe(2);
    expect(result[0].qualifiedCount).toBe(1);
    expect(result[0].qualificationRate).toBe(1); // 1/1 scored
  });
});
```

Note: The existing test file already has a `makeEntry` helper and imports `StatsEntry`. You will need to add `trialDate` and `trialNumber` fields to the `StatsEntry` interface (see Step 3). If the existing `makeEntry` doesn't include these fields, add defaults for them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/components/analytics/__tests__/analytics-utils.test.ts`
Expected: FAIL — `computeClassBreakdown` is not exported

- [ ] **Step 3: Add `trialDate` and `trialNumber` to `StatsEntry` and implement `computeClassBreakdown`**

In `src/components/analytics/analytics-utils.ts`, add optional fields to `StatsEntry`:

```typescript
export interface StatsEntry {
  id: string;
  dogId: string;
  dogCallName: string;
  showId: string;
  showName: string;
  showDate: string;
  classId: string;
  className: string;
  classElement: string | null;
  classLevel: string | null;
  resultText: 'Q' | 'NQ' | 'ABS' | 'EX' | 'WD' | 'pending';
  searchTimeSeconds: number | null;
  totalFaults: number | null;
  finalPlacement: number | null;
  organization?: string | undefined;
  trialDate?: string | undefined;
  trialNumber?: string | undefined;
}
```

Add the new type and function at the end of the file (before the deprecated `findCleanSweepDogs`):

```typescript
export interface ClassBreakdownEntry {
  classId: string;
  className: string;
  classElement: string | null;
  classLevel: string | null;
  trialDate: string;
  trialNumber: string;
  entryCount: number;
  scoredCount: number;
  qualifiedCount: number;
  /** 0–1 fraction */
  qualificationRate: number;
  bestTime: number | null;
  avgTime: number | null;
}

export function computeClassBreakdown(entries: StatsEntry[]): ClassBreakdownEntry[] {
  if (entries.length === 0) return [];

  const grouped = new Map<string, StatsEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.classId) ?? [];
    list.push(entry);
    grouped.set(entry.classId, list);
  }

  const results: ClassBreakdownEntry[] = [];
  for (const [classId, classEntries] of grouped) {
    let scoredCount = 0;
    let qualifiedCount = 0;
    const qualifiedTimes: number[] = [];

    for (const e of classEntries) {
      if (!isScored(e)) continue;
      scoredCount++;
      if (isQualified(e)) {
        qualifiedCount++;
        if (e.searchTimeSeconds != null) qualifiedTimes.push(e.searchTimeSeconds);
      }
    }

    qualifiedTimes.sort((a, b) => a - b);
    const first = classEntries[0]!;

    results.push({
      classId,
      className: first.className,
      classElement: first.classElement,
      classLevel: first.classLevel,
      trialDate: first.trialDate || '',
      trialNumber: first.trialNumber || '',
      entryCount: classEntries.length,
      scoredCount,
      qualifiedCount,
      qualificationRate: scoredCount > 0 ? qualifiedCount / scoredCount : 0,
      bestTime: qualifiedTimes.length > 0 ? qualifiedTimes[0]! : null,
      avgTime:
        qualifiedTimes.length > 0
          ? qualifiedTimes.reduce((sum, t) => sum + t, 0) / qualifiedTimes.length
          : null,
    });
  }

  return results.sort((a, b) => {
    const dateCompare = a.trialDate.localeCompare(b.trialDate);
    if (dateCompare !== 0) return dateCompare;
    const numCompare = a.trialNumber.localeCompare(b.trialNumber);
    if (numCompare !== 0) return numCompare;
    const elCompare = (a.classElement || '').localeCompare(b.classElement || '');
    if (elCompare !== 0) return elCompare;
    return (a.classLevel || '').localeCompare(b.classLevel || '');
  });
}
```

- [ ] **Step 4: Update `makeEntry` in test file and fix `computeClassBreakdown` tests [EXPANDED]**

The existing test file uses `makeEntry` as the helper name. Make these changes to `src/components/analytics/__tests__/analytics-utils.test.ts`:

1. Add `trialDate` and `trialNumber` to the `makeEntry` helper defaults:

```typescript
    trialDate: '2026-04-01',
    trialNumber: '1',
```

2. Update the import to include `computeClassBreakdown`:

```typescript
import {
  computeSummaryStats,
  computePerDogStats,
  computeResultDistribution,
  computeFastestTimes,
  computeQualificationTrend,
  computeClassBreakdown,
  findCleanSweepDogs,
  type StatsEntry,
} from '../analytics-utils';
```

3. The `computeClassBreakdown` tests from Step 1 already use `makeEntry(` — verify they match the helper name in the file.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/analytics/__tests__/analytics-utils.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/analytics/analytics-utils.ts apps/myk9show/src/components/analytics/__tests__/analytics-utils.test.ts
git commit -m "feat(analytics): add computeClassBreakdown utility and ClassBreakdownEntry type"
```

---

## Task 3: Create `useShowStats` Hook

**Files:**

- Create: `src/hooks/queries/useShowStats.ts`
- Create: `src/test/hooks/useShowStats.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/test/hooks/useShowStats.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/services/database/supabaseClient';
import { useShowStats } from '@/hooks/queries/useShowStats';

const mockFrom = vi.mocked(supabase.from);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useShowStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when showId is undefined', () => {
    const { result } = renderHook(() => useShowStats(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('fetches all entries for a show and merges trial metadata', async () => {
    // [PATCHED] Two-query approach: entries from view, trial metadata from classes table
    const mockEntryData = [
      {
        id: 'e1',
        dog_id: 'd1',
        dog_call_name: 'Rex',
        show_id: 'show-1',
        class_id: 'c1',
        class_name: 'Containers Novice',
        class_element: 'Containers',
        class_level: 'Novice',
        result_text: 'Q',
        search_time_seconds: 35,
        total_faults: 0,
        final_placement: 1,
      },
    ];

    const mockClassData = [
      {
        id: 'c1',
        trial_id: 't1',
        trials: { trial_date: '2026-04-01', trial_number: '1' },
      },
    ];

    // First call: view_entry_with_results
    const mockEq = vi.fn().mockResolvedValue({ data: mockEntryData, error: null });
    const mockEntrySelect = vi.fn().mockReturnValue({ eq: mockEq });

    // Second call: classes table
    const mockIn = vi.fn().mockResolvedValue({ data: mockClassData, error: null });
    const mockClassSelect = vi.fn().mockReturnValue({ in: mockIn });

    mockFrom
      .mockReturnValueOnce({ select: mockEntrySelect } as never)
      .mockReturnValueOnce({ select: mockClassSelect } as never);

    const { result } = renderHook(() => useShowStats('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].dogCallName).toBe('Rex');
    expect(result.current.data![0].trialDate).toBe('2026-04-01');
    expect(result.current.data![0].trialNumber).toBe('1');
    expect(mockFrom).toHaveBeenCalledWith('view_entry_with_results');
    expect(mockFrom).toHaveBeenCalledWith('classes');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useShowStats.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

Create `src/hooks/queries/useShowStats.ts`:

**Note:** `view_entry_with_results` is a Postgres VIEW. PostgREST cannot follow foreign-key joins through views (e.g., `classes!inner(...)` won't work). Instead, fetch entries from the view and trial metadata from the `classes` table in a separate query, then merge client-side. [PATCHED — original plan used a nested join on the view]

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';

async function fetchShowEntries(showId: string): Promise<StatsEntry[]> {
  // 1. Fetch entries from the view (no nested joins on views)
  const { data: entryData, error: entryError } = await supabase
    .from('view_entry_with_results')
    .select(
      `
      id,
      dog_id,
      dog_call_name,
      show_id,
      class_id,
      class_name,
      class_element,
      class_level,
      result_text,
      search_time_seconds,
      total_faults,
      final_placement
    `
    )
    .eq('show_id', showId);

  if (entryError) throw entryError;
  if (!entryData || entryData.length === 0) return [];

  // 2. Fetch trial metadata for classes in this show
  const classIds = [...new Set(entryData.map(r => r.class_id as string))];
  const { data: classData, error: classError } = await supabase
    .from('classes')
    .select('id, trial_id, trials!inner(trial_date, trial_number)')
    .in('id', classIds);

  if (classError) throw classError;

  // Build classId -> trial metadata map
  const classTrialMap = new Map<string, { trialDate: string; trialNumber: string }>();
  for (const cls of classData || []) {
    const trial = cls.trials as Record<string, unknown>;
    classTrialMap.set(cls.id as string, {
      trialDate: (trial?.trial_date as string) || '',
      trialNumber: (trial?.trial_number as string) || '',
    });
  }

  // 3. Merge
  return entryData.map((row: Record<string, unknown>): StatsEntry => {
    const classId = row.class_id as string;
    const trialMeta = classTrialMap.get(classId);

    return {
      id: row.id as string,
      dogId: row.dog_id as string,
      dogCallName: (row.dog_call_name as string) || '',
      showId: row.show_id as string,
      showName: '',
      showDate: '',
      classId,
      className: (row.class_name as string) || 'Unknown Class',
      classElement: row.class_element as string | null,
      classLevel: row.class_level as string | null,
      resultText: (row.result_text as StatsEntry['resultText']) || 'pending',
      searchTimeSeconds: row.search_time_seconds as number | null,
      totalFaults: row.total_faults as number | null,
      finalPlacement: row.final_placement as number | null,
      trialDate: trialMeta?.trialDate || '',
      trialNumber: trialMeta?.trialNumber || '',
    };
  });
}

export function useShowStats(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.showStats(showId || ''),
    queryFn: () => fetchShowEntries(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useShowStats.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useShowStats.ts apps/myk9show/src/test/hooks/useShowStats.test.ts
git commit -m "feat(analytics): add useShowStats hook for show-level entries"
```

---

## Task 4: Create `useShowJudges` Hook

**Files:**

- Create: `src/hooks/queries/useShowJudges.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/queries/useShowJudges.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

export interface ShowJudge {
  id: string;
  name: string;
}

async function fetchShowJudges(showId: string): Promise<ShowJudge[]> {
  // Get distinct judges assigned to classes in this show's trials
  const { data, error } = await supabase
    .from('judge_assignments')
    .select(
      `
      person_id,
      people!inner(id, first_name, last_name),
      classes!inner(trial_id, trials!inner(show_id))
    `
    )
    .eq('classes.trials.show_id', showId);

  if (error) throw error;

  // Deduplicate by person_id
  const seen = new Set<string>();
  const judges: ShowJudge[] = [];
  for (const row of data || []) {
    const person = row.people as Record<string, unknown>;
    const personId = person.id as string;
    if (seen.has(personId)) continue;
    seen.add(personId);
    const firstName = (person.first_name as string) || '';
    const lastName = (person.last_name as string) || '';
    judges.push({
      id: personId,
      name: `${firstName} ${lastName}`.trim() || 'Unknown Judge',
    });
  }

  return judges.sort((a, b) => a.name.localeCompare(b.name));
}

export function useShowJudges(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.showJudges(showId || ''),
    queryFn: () => fetchShowJudges(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
```

- [ ] **Step 2: Write test [ADDED]**

Create `src/test/hooks/useShowJudges.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/services/database/supabaseClient';
import { useShowJudges } from '@/hooks/queries/useShowJudges';

const mockFrom = vi.mocked(supabase.from);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useShowJudges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when showId is undefined', () => {
    const { result } = renderHook(() => useShowJudges(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('deduplicates judges and sorts by name', async () => {
    const mockData = [
      { person_id: 'p1', people: { id: 'p1', first_name: 'Bob', last_name: 'Jones' }, classes: { trial_id: 't1', trials: { show_id: 'show-1' } } },
      { person_id: 'p2', people: { id: 'p2', first_name: 'Alice', last_name: 'Smith' }, classes: { trial_id: 't1', trials: { show_id: 'show-1' } } },
      { person_id: 'p1', people: { id: 'p1', first_name: 'Bob', last_name: 'Jones' }, classes: { trial_id: 't2', trials: { show_id: 'show-1' } } },
    ];

    const mockEq = vi.fn().mockResolvedValue({ data: mockData, error: null });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect } as never);

    const { result } = renderHook(() => useShowJudges('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].name).toBe('Alice Smith');
    expect(result.current.data![1].name).toBe('Bob Jones');
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useShowJudges.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useShowJudges.ts apps/myk9show/src/test/hooks/useShowJudges.test.ts
git commit -m "feat(analytics): add useShowJudges hook for judge dropdown"
```

---

## Task 5: Create `useJudgeShowStats` Hook

**Files:**

- Create: `src/hooks/queries/useJudgeShowStats.ts`
- Create: `src/test/hooks/useJudgeShowStats.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/test/hooks/useJudgeShowStats.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/services/database/supabaseClient';
import { useJudgeShowStats } from '@/hooks/queries/useJudgeShowStats';

const mockFrom = vi.mocked(supabase.from);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useJudgeShowStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when judgeId is undefined', () => {
    const { result } = renderHook(() => useJudgeShowStats(undefined, 'show-1'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('is disabled when showId is undefined', () => {
    const { result } = renderHook(() => useJudgeShowStats('judge-1', undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('fetches entries for a judge at a show', async () => {
    const mockData = [
      {
        id: 'e1',
        dog_id: 'd1',
        dog_call_name: 'Rex',
        show_id: 'show-1',
        class_id: 'c1',
        class_name: 'Containers Novice',
        class_element: 'Containers',
        class_level: 'Novice',
        result_text: 'Q',
        search_time_seconds: 35,
        total_faults: 0,
        final_placement: 1,
        trial_date: '2026-04-01',
        trial_number: '1',
      },
    ];

    const mockEq2 = vi.fn().mockResolvedValue({ data: mockData, error: null });
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });
    mockFrom.mockReturnValue({ select: mockSelect } as never);

    const { result } = renderHook(
      () => useJudgeShowStats('judge-1', 'show-1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].dogCallName).toBe('Rex');
    expect(mockFrom).toHaveBeenCalledWith('view_entry_with_results');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useJudgeShowStats.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

Create `src/hooks/queries/useJudgeShowStats.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';

async function fetchJudgeShowEntries(judgeId: string, showId: string): Promise<StatsEntry[]> {
  // Get class IDs assigned to this judge for this show
  const { data: assignments, error: assignError } = await supabase
    .from('judge_assignments')
    .select(
      `
      class_id,
      classes!inner(
        trial_id,
        trials!inner(show_id, trial_date, trial_number)
      )
    `
    )
    .eq('person_id', judgeId)
    .eq('classes.trials.show_id', showId);

  if (assignError) throw assignError;
  if (!assignments || assignments.length === 0) return [];

  // Build a map of classId -> trial metadata
  const classTrialMap = new Map<string, { trialDate: string; trialNumber: string }>();
  const classIds: string[] = [];
  for (const a of assignments) {
    const classId = a.class_id as string;
    classIds.push(classId);
    const cls = a.classes as Record<string, unknown>;
    const trial = cls.trials as Record<string, unknown>;
    classTrialMap.set(classId, {
      trialDate: (trial.trial_date as string) || '',
      trialNumber: (trial.trial_number as string) || '',
    });
  }

  // Fetch entries for those classes
  const { data, error } = await supabase
    .from('view_entry_with_results')
    .select(
      `
      id,
      dog_id,
      dog_call_name,
      show_id,
      class_id,
      class_name,
      class_element,
      class_level,
      result_text,
      search_time_seconds,
      total_faults,
      final_placement
    `
    )
    .eq('show_id', showId)
    .in('class_id', classIds);

  if (error) throw error;

  return (data || []).map((row: Record<string, unknown>): StatsEntry => {
    const classId = row.class_id as string;
    const trialMeta = classTrialMap.get(classId);

    return {
      id: row.id as string,
      dogId: row.dog_id as string,
      dogCallName: (row.dog_call_name as string) || '',
      showId: row.show_id as string,
      showName: '',
      showDate: '',
      classId,
      className: (row.class_name as string) || 'Unknown Class',
      classElement: row.class_element as string | null,
      classLevel: row.class_level as string | null,
      resultText: (row.result_text as StatsEntry['resultText']) || 'pending',
      searchTimeSeconds: row.search_time_seconds as number | null,
      totalFaults: row.total_faults as number | null,
      finalPlacement: row.final_placement as number | null,
      trialDate: trialMeta?.trialDate || '',
      trialNumber: trialMeta?.trialNumber || '',
    };
  });
}

export function useJudgeShowStats(judgeId: string | undefined, showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.judgeShowStats(judgeId || '', showId || ''),
    queryFn: () => fetchJudgeShowEntries(judgeId!, showId!),
    enabled: !!judgeId && !!showId,
    ...cacheStrategies.moderate,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useJudgeShowStats.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useJudgeShowStats.ts apps/myk9show/src/test/hooks/useJudgeShowStats.test.ts
git commit -m "feat(analytics): add useJudgeShowStats hook for judge class-level entries"
```

---

## Task 6: Create `ClassBreakdownTable` Component

**Files:**

- Create: `src/components/analytics/ClassBreakdownTable.tsx`
- Create: `src/components/analytics/__tests__/ClassBreakdownTable.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/analytics/__tests__/ClassBreakdownTable.test.tsx`:

```typescript
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { ClassBreakdownTable } from '../ClassBreakdownTable';
import type { ClassBreakdownEntry } from '../analytics-utils';

function makeClassEntry(overrides: Partial<ClassBreakdownEntry> = {}): ClassBreakdownEntry {
  return {
    classId: 'c1',
    className: 'Containers Novice',
    classElement: 'Containers',
    classLevel: 'Novice',
    trialDate: '2026-04-01',
    trialNumber: '1',
    entryCount: 5,
    scoredCount: 4,
    qualifiedCount: 3,
    qualificationRate: 0.75,
    bestTime: 30,
    avgTime: 42.5,
    ...overrides,
  };
}

describe('ClassBreakdownTable', () => {
  it('returns null when classes array is empty', () => {
    const { container } = render(<ClassBreakdownTable classes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a row for each class', () => {
    const classes = [
      makeClassEntry({ classId: 'c1', className: 'Containers Novice' }),
      makeClassEntry({ classId: 'c2', className: 'Interiors Excellent', trialNumber: '2' }),
    ];

    render(<ClassBreakdownTable classes={classes} />);

    expect(screen.getByText('Class Performance')).toBeInTheDocument();
    expect(screen.getByText('Containers Novice')).toBeInTheDocument();
    expect(screen.getByText('Interiors Excellent')).toBeInTheDocument();
  });

  it('displays trial date and trial number', () => {
    const classes = [
      makeClassEntry({ trialDate: '2026-04-01', trialNumber: '2' }),
    ];

    render(<ClassBreakdownTable classes={classes} />);

    expect(screen.getByText('Apr 1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('formats Q rate as percentage', () => {
    const classes = [makeClassEntry({ qualificationRate: 0.75 })];

    render(<ClassBreakdownTable classes={classes} />);

    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows dash for null times', () => {
    const classes = [makeClassEntry({ bestTime: null, avgTime: null })];

    render(<ClassBreakdownTable classes={classes} />);

    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/analytics/__tests__/ClassBreakdownTable.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

Create `src/components/analytics/ClassBreakdownTable.tsx`:

```typescript
import { ListChecks } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { msToDisplay } from '@myk9/scoring';
import type { ClassBreakdownEntry } from './analytics-utils';

interface ClassBreakdownTableProps {
  classes: ClassBreakdownEntry[];
}

function formatDate(isoDate: string): string {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(seconds: number | null): string {
  if (seconds == null) return '—';
  return msToDisplay(seconds * 1000, 'hundredths');
}

export function ClassBreakdownTable({ classes }: ClassBreakdownTableProps) {
  if (classes.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">Class Performance</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Trial</th>
              <th className="px-4 py-2 font-medium">Class</th>
              <th className="px-4 py-2 font-medium text-center">Entries</th>
              <th className="px-4 py-2 font-medium text-center">Q Rate</th>
              <th className="px-4 py-2 font-medium text-right">Best</th>
              <th className="px-4 py-2 font-medium text-right">Avg</th>
            </tr>
          </thead>
          <tbody>
            {classes.map(cls => (
              <tr key={cls.classId} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2 whitespace-nowrap">
                  <span className="text-muted-foreground">{formatDate(cls.trialDate)}</span>
                  {cls.trialNumber && (
                    <span className="ml-1.5 text-xs text-muted-foreground/70">#{cls.trialNumber}</span>
                  )}
                </td>
                <td className="px-4 py-2 font-medium">{cls.className}</td>
                <td className="px-4 py-2 text-center">{cls.entryCount}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-medium">{Math.round(cls.qualificationRate * 100)}%</span>
                    <div className="h-1.5 w-16 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.round(cls.qualificationRate * 100)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  {formatTime(cls.bestTime)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  {formatTime(cls.avgTime)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/analytics/__tests__/ClassBreakdownTable.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/analytics/ClassBreakdownTable.tsx apps/myk9show/src/components/analytics/__tests__/ClassBreakdownTable.test.tsx
git commit -m "feat(analytics): add ClassBreakdownTable component for per-class Q rates"
```

---

## Task 7: Create `ShowStatsSubTab` Component

**Files:**

- Create: `src/components/analytics/ShowStatsSubTab.tsx`
- Create: `src/components/analytics/__tests__/ShowStatsSubTab.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/analytics/__tests__/ShowStatsSubTab.test.tsx`:

```typescript
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ShowStatsSubTab } from '../ShowStatsSubTab';
import type { StatsEntry } from '../analytics-utils';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;

vi.mock('@/hooks/queries/useShowStats', () => ({
  useShowStats: vi.fn(),
}));

import { useShowStats } from '@/hooks/queries/useShowStats';
const mockUseShowStats = vi.mocked(useShowStats);

function makeEntry(overrides: Partial<StatsEntry> = {}): StatsEntry {
  return {
    id: 'entry-1',
    dogId: 'dog-1',
    dogCallName: 'Rex',
    showId: 'show-1',
    showName: '',
    showDate: '',
    classId: 'class-1',
    className: 'Containers Novice',
    classElement: 'Containers',
    classLevel: 'Novice',
    resultText: 'Q',
    searchTimeSeconds: 42.5,
    totalFaults: 0,
    finalPlacement: 1,
    ...overrides,
  };
}

describe('ShowStatsSubTab', () => {
  it('shows skeleton while loading', () => {
    mockUseShowStats.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useShowStats>);

    render(<ShowStatsSubTab showId="show-1" />);

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when no scored entries', () => {
    mockUseShowStats.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useShowStats>);

    render(<ShowStatsSubTab showId="show-1" />);

    expect(screen.getByText('No Scored Entries')).toBeInTheDocument();
  });

  it('renders all analytics sections when scored entries exist', () => {
    const entries: StatsEntry[] = [
      makeEntry({ id: 'e1', resultText: 'Q', searchTimeSeconds: 35 }),
      makeEntry({ id: 'e2', dogId: 'd2', dogCallName: 'Bella', resultText: 'NQ', searchTimeSeconds: 55 }),
    ];

    mockUseShowStats.mockReturnValue({
      data: entries,
      isLoading: false,
    } as ReturnType<typeof useShowStats>);

    render(<ShowStatsSubTab showId="show-1" />);

    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByText('Result Distribution')).toBeInTheDocument();
    expect(screen.getByText('Performance by Dog')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/analytics/__tests__/ShowStatsSubTab.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

Create `src/components/analytics/ShowStatsSubTab.tsx`:

```typescript
import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useShowStats } from '@/hooks/queries/useShowStats';
import {
  computeSummaryStats,
  computePerDogStats,
  computeResultDistribution,
  computeFastestTimes,
} from './analytics-utils';
import { StatsSummaryCards, StatsSummaryCardsSkeleton } from './StatsSummaryCards';
import { ResultDistributionChart } from './ResultDistributionChart';
import { DogBreakdownCards } from './DogBreakdownCards';
import { FastestTimesTable } from './FastestTimesTable';

interface ShowStatsSubTabProps {
  showId: string;
}

export function ShowStatsSubTab({ showId }: ShowStatsSubTabProps) {
  const { data: entries, isLoading } = useShowStats(showId);

  const summary = useMemo(() => computeSummaryStats(entries || []), [entries]);
  const distribution = useMemo(() => computeResultDistribution(entries || []), [entries]);
  const dogStats = useMemo(() => computePerDogStats(entries || []), [entries]);
  const fastestTimes = useMemo(() => computeFastestTimes(entries || [], 10), [entries]);

  const hasScoredEntries = summary.scoredEntries > 0;

  if (isLoading) {
    return <StatsSummaryCardsSkeleton />;
  }

  if (!hasScoredEntries) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold text-foreground">No Scored Entries</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Show statistics will appear here once scoring begins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StatsSummaryCards stats={summary} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResultDistributionChart data={distribution} />
        <DogBreakdownCards dogs={dogStats} />
      </div>

      {fastestTimes.length > 0 && <FastestTimesTable times={fastestTimes} showShowColumn={false} />}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/analytics/__tests__/ShowStatsSubTab.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/analytics/ShowStatsSubTab.tsx apps/myk9show/src/components/analytics/__tests__/ShowStatsSubTab.test.tsx
git commit -m "feat(analytics): add ShowStatsSubTab component"
```

---

## Task 8: Create `JudgeStatsSubTab` Component

**Files:**

- Create: `src/components/analytics/JudgeStatsSubTab.tsx`
- Create: `src/components/analytics/__tests__/JudgeStatsSubTab.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/analytics/__tests__/JudgeStatsSubTab.test.tsx`:

```typescript
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { JudgeStatsSubTab } from '../JudgeStatsSubTab';
import type { StatsEntry } from '../analytics-utils';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;

vi.mock('@/hooks/queries/useShowJudges', () => ({
  useShowJudges: vi.fn(),
}));
vi.mock('@/hooks/queries/useJudgeShowStats', () => ({
  useJudgeShowStats: vi.fn(),
}));

import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { useJudgeShowStats } from '@/hooks/queries/useJudgeShowStats';
const mockUseShowJudges = vi.mocked(useShowJudges);
const mockUseJudgeShowStats = vi.mocked(useJudgeShowStats);

function makeEntry(overrides: Partial<StatsEntry> = {}): StatsEntry {
  return {
    id: 'entry-1',
    dogId: 'dog-1',
    dogCallName: 'Rex',
    showId: 'show-1',
    showName: '',
    showDate: '',
    classId: 'class-1',
    className: 'Containers Novice',
    classElement: 'Containers',
    classLevel: 'Novice',
    resultText: 'Q',
    searchTimeSeconds: 42.5,
    totalFaults: 0,
    finalPlacement: 1,
    trialDate: '2026-04-01',
    trialNumber: '1',
    ...overrides,
  };
}

describe('JudgeStatsSubTab', () => {
  it('shows empty state when no judges', () => {
    mockUseShowJudges.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useShowJudges>);
    mockUseJudgeShowStats.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useJudgeShowStats>);

    render(<JudgeStatsSubTab showId="show-1" />);

    expect(screen.getByText('No Judge Assignments')).toBeInTheDocument();
  });

  it('renders judge dropdown when judges exist', () => {
    mockUseShowJudges.mockReturnValue({
      data: [
        { id: 'j1', name: 'Alice Smith' },
        { id: 'j2', name: 'Bob Jones' },
      ],
      isLoading: false,
    } as ReturnType<typeof useShowJudges>);
    mockUseJudgeShowStats.mockReturnValue({
      data: [makeEntry()],
      isLoading: false,
    } as ReturnType<typeof useJudgeShowStats>);

    render(<JudgeStatsSubTab showId="show-1" />);

    expect(screen.getByDisplayValue('Alice Smith')).toBeInTheDocument();
  });

  it('renders stats and class breakdown when judge has scored entries', () => {
    mockUseShowJudges.mockReturnValue({
      data: [{ id: 'j1', name: 'Alice Smith' }],
      isLoading: false,
    } as ReturnType<typeof useShowJudges>);
    mockUseJudgeShowStats.mockReturnValue({
      data: [
        makeEntry({ id: 'e1', resultText: 'Q', searchTimeSeconds: 35 }),
        makeEntry({ id: 'e2', dogId: 'd2', dogCallName: 'Bella', resultText: 'NQ' }),
      ],
      isLoading: false,
    } as ReturnType<typeof useJudgeShowStats>);

    render(<JudgeStatsSubTab showId="show-1" />);

    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByText('Class Performance')).toBeInTheDocument();
    expect(screen.getByText('Result Distribution')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/analytics/__tests__/JudgeStatsSubTab.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

Create `src/components/analytics/JudgeStatsSubTab.tsx`:

```typescript
import { useState, useMemo, useEffect } from 'react';
import { Scale } from 'lucide-react';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { useJudgeShowStats } from '@/hooks/queries/useJudgeShowStats';
import {
  computeSummaryStats,
  computePerDogStats,
  computeResultDistribution,
  computeFastestTimes,
  computeClassBreakdown,
} from './analytics-utils';
import { StatsSummaryCards, StatsSummaryCardsSkeleton } from './StatsSummaryCards';
import { ResultDistributionChart } from './ResultDistributionChart';
import { DogBreakdownCards } from './DogBreakdownCards';
import { FastestTimesTable } from './FastestTimesTable';
import { ClassBreakdownTable } from './ClassBreakdownTable';

interface JudgeStatsSubTabProps {
  showId: string;
}

export function JudgeStatsSubTab({ showId }: JudgeStatsSubTabProps) {
  const { data: judges = [], isLoading: judgesLoading } = useShowJudges(showId);
  const [selectedJudgeId, setSelectedJudgeId] = useState<string | undefined>();

  // Auto-select first judge when judges load
  useEffect(() => {
    if (judges.length > 0 && !selectedJudgeId) {
      setSelectedJudgeId(judges[0].id);
    }
  }, [judges, selectedJudgeId]);

  const { data: entries, isLoading: entriesLoading } = useJudgeShowStats(
    selectedJudgeId,
    showId
  );

  const summary = useMemo(() => computeSummaryStats(entries || []), [entries]);
  const distribution = useMemo(() => computeResultDistribution(entries || []), [entries]);
  const dogStats = useMemo(() => computePerDogStats(entries || []), [entries]);
  const fastestTimes = useMemo(() => computeFastestTimes(entries || [], 10), [entries]);
  const classBreakdown = useMemo(() => computeClassBreakdown(entries || []), [entries]);

  const hasScoredEntries = summary.scoredEntries > 0;
  const isLoading = judgesLoading || entriesLoading;

  if (judgesLoading) {
    return <StatsSummaryCardsSkeleton />;
  }

  if (judges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Scale className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold text-foreground">No Judge Assignments</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Judge statistics will appear here once judges are assigned to classes.
        </p>
      </div>
    );
  }

  const selectedJudge = judges.find(j => j.id === selectedJudgeId);

  return (
    <div className="space-y-6">
      {/* Judge selector */}
      <div className="flex items-center gap-3">
        <Scale className="h-4 w-4 text-muted-foreground" />
        <select
          value={selectedJudgeId || ''}
          onChange={e => setSelectedJudgeId(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm font-medium"
          aria-label="Select judge"
        >
          {judges.map(judge => (
            <option key={judge.id} value={judge.id}>
              {judge.name}
            </option>
          ))}
        </select>
        {selectedJudge && (
          <span className="text-sm text-muted-foreground">
            {classBreakdown.length} class{classBreakdown.length !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {isLoading && <StatsSummaryCardsSkeleton />}

      {!isLoading && !hasScoredEntries && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Scale className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <h3 className="text-base font-semibold text-foreground">No Scored Entries</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Statistics will appear once scoring begins for this judge&apos;s classes.
          </p>
        </div>
      )}

      {!isLoading && hasScoredEntries && (
        <>
          <StatsSummaryCards stats={summary} />

          <ClassBreakdownTable classes={classBreakdown} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResultDistributionChart data={distribution} />
            <DogBreakdownCards dogs={dogStats} />
          </div>

          {fastestTimes.length > 0 && (
            <FastestTimesTable times={fastestTimes} showShowColumn={false} />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/analytics/__tests__/JudgeStatsSubTab.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/analytics/JudgeStatsSubTab.tsx apps/myk9show/src/components/analytics/__tests__/JudgeStatsSubTab.test.tsx
git commit -m "feat(analytics): add JudgeStatsSubTab component with judge dropdown and class breakdown"
```

---

## Task 9: Update Exports

**Files:**

- Modify: `src/components/analytics/index.ts`

- [ ] **Step 1: Add exports for new components**

Add these exports to `src/components/analytics/index.ts`:

```typescript
export { ShowStatsSubTab } from './ShowStatsSubTab';
export { JudgeStatsSubTab } from './JudgeStatsSubTab';
export { ClassBreakdownTable } from './ClassBreakdownTable';
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/analytics/index.ts
git commit -m "feat(analytics): export new Show Stats and Judge Stats components"
```

---

## Task 10: Wire Sub-Tabs into `ShowResultsTab`

**Files:**

- Modify: `src/components/results/ShowResultsTab.tsx`

- [ ] **Step 1: Add sub-tabs to ShowResultsTab**

Replace the content of `src/components/results/ShowResultsTab.tsx` to wrap the existing podium content with SubTabs. The component will manage its own sub-tab state:

```typescript
/**
 * ShowResultsTab — renders inside ShowDetailsPage's "Results" tab.
 * Contains sub-tabs: Podium (existing results), Show Stats, Judge Stats.
 */

import { useState, useMemo } from 'react';
import { Trophy, Filter, ChevronDown, ChevronRight, Clock, BarChart3, Scale, Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { SubTabs, SubTabsContent, type SubTabDef } from '@/components/common/SubTabs';
import { PodiumCard } from './PodiumCard';
import {
  useShowResults,
  filterResults,
  getFilterOptions,
  type ResultsFilters,
  type ClassResult,
} from '@/hooks/queries/useShowResults';
import { useVisibleResultFields, deriveClassState } from '@/hooks/useVisibleResultFields';
import { useShowStats } from '@/hooks/queries/useShowStats';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { ShowStatsSubTab } from '@/components/analytics/ShowStatsSubTab';
import { JudgeStatsSubTab } from '@/components/analytics/JudgeStatsSubTab';

interface VisibilityGatedPodiumCardProps {
  cls: ClassResult;
  showId: string;
}

function VisibilityGatedPodiumCard({ cls, showId }: VisibilityGatedPodiumCardProps) {
  const classState = deriveClassState('completed', cls.resultsReleasedAt);
  const { showPlacement, isLoading } = useVisibleResultFields(
    showId,
    cls.trialId,
    cls.classId,
    classState
  );

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <div className="border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold tracking-tight">{cls.className}</h3>
        </div>
        <div className="flex items-center justify-center p-6">
          <LoadingSpinner />
        </div>
      </Card>
    );
  }

  if (!showPlacement) {
    return (
      <Card className="overflow-hidden">
        <div className="border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold tracking-tight">{cls.className}</h3>
        </div>
        <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
          Results pending review
        </div>
      </Card>
    );
  }

  return <PodiumCard classTitle={cls.className} placements={cls.placements} />;
}

interface PodiumContentProps {
  showId: string;
}

function PodiumContent({ showId }: PodiumContentProps) {
  const { data: results = [], isLoading, error, refetch } = useShowResults(showId);
  const [filters, setFilters] = useState<ResultsFilters>({ element: null, level: null });
  const [pendingExpanded, setPendingExpanded] = useState(false);

  const filtered = useMemo(() => filterResults(results, filters), [results, filters]);
  const { elements, levels } = useMemo(() => getFilterOptions(results), [results]);

  const { withPlacements, pending } = useMemo(() => {
    const w: typeof filtered = [];
    const p: typeof filtered = [];
    for (const c of filtered) {
      (c.placements.length > 0 ? w : p).push(c);
    }
    return { withPlacements: w, pending: p };
  }, [filtered]);

  const hasActiveFilters = filters.element || filters.level;

  if (isLoading) {
    return <LoadingSpinner message="Loading results..." />;
  }

  if (error) {
    return (
      <EmptyState
        icon={Trophy}
        title="Error loading results"
        action={{ label: 'Retry', onClick: () => refetch() }}
      />
    );
  }

  if (results.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No results yet"
        description="Results will appear here as classes complete scoring."
      />
    );
  }

  return (
    <div className="space-y-4">
      {(elements.length > 1 || levels.length > 1) && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />

          {elements.length > 1 && (
            <select
              value={filters.element || ''}
              onChange={e => setFilters(f => ({ ...f, element: e.target.value || null }))}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">All Elements</option>
              {elements.map(el => (
                <option key={el} value={el}>
                  {el}
                </option>
              ))}
            </select>
          )}

          {levels.length > 1 && (
            <select
              value={filters.level || ''}
              onChange={e => setFilters(f => ({ ...f, level: e.target.value || null }))}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">All Levels</option>
              {levels.map(lv => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
          )}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFilters({ element: null, level: null })}
            >
              Clear
            </Button>
          )}

          <Badge variant="secondary" className="ml-auto">
            {withPlacements.length} class{withPlacements.length !== 1 ? 'es' : ''}
          </Badge>
        </div>
      )}

      {withPlacements.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {withPlacements.map(cls => (
            <VisibilityGatedPodiumCard key={cls.classId} cls={cls} showId={showId} />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-muted-foreground">
          <p>No results match the current filters.</p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="rounded-lg border">
          <button
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50"
            onClick={() => setPendingExpanded(!pendingExpanded)}
            aria-expanded={pendingExpanded}
          >
            {pendingExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Clock className="h-4 w-4" />
            Pending Results
            <Badge variant="outline" className="ml-auto">
              {pending.length}
            </Badge>
          </button>

          {pendingExpanded && (
            <div className="divide-y border-t px-4">
              {pending.map(cls => (
                <p key={cls.classId} className="py-2 text-sm">
                  {cls.className}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ShowResultsTabProps {
  showId: string;
}

export function ShowResultsTab({ showId }: ShowResultsTabProps) {
  const { data: showEntries } = useShowStats(showId);
  const { data: judges } = useShowJudges(showId);

  const hasScoredEntries = (showEntries || []).some(e => e.resultText !== 'pending');
  const hasJudges = (judges || []).length > 0;

  const subTabDefs: SubTabDef[] = useMemo(
    () => [
      { id: 'podium', label: 'Podium', icon: Medal },
      ...(hasScoredEntries ? [{ id: 'show-stats', label: 'Show Stats', icon: BarChart3 }] : []),
      ...(hasJudges ? [{ id: 'judge-stats', label: 'Judge Stats', icon: Scale }] : []),
    ],
    [hasScoredEntries, hasJudges]
  );

  const [activeSubTab, setActiveSubTab] = useState('podium');

  return (
    <SubTabs tabs={subTabDefs} value={activeSubTab} onValueChange={setActiveSubTab}>
      <SubTabsContent value="podium">
        <PodiumContent showId={showId} />
      </SubTabsContent>

      {hasScoredEntries && (
        <SubTabsContent value="show-stats">
          <ShowStatsSubTab showId={showId} />
        </SubTabsContent>
      )}

      {hasJudges && (
        <SubTabsContent value="judge-stats">
          <JudgeStatsSubTab showId={showId} />
        </SubTabsContent>
      )}
    </SubTabs>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Run all analytics tests**

Run: `cd apps/myk9show && npx vitest run src/components/analytics/ src/components/results/ src/test/hooks/useShowStats.test.ts src/test/hooks/useJudgeShowStats.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/results/ShowResultsTab.tsx
git commit -m "feat(analytics): wire Show Stats and Judge Stats sub-tabs into Results tab"
```

---

## Task 11: Full Test Suite and Typecheck

- [ ] **Step 1: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `cd apps/myk9show && npx eslint src/ --quiet`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 3: Run full test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests PASS

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(analytics): address typecheck and lint issues in show/judge stats"
```

---

## Task 12: Update TO-DOS.md

- [ ] **Step 1: Mark both todo items as done in TO-DOS.md**

Mark the following items as `[x]` in `TO-DOS.md` under `Data & Analytics`:

- `Secretary show-level statistics`
- `Judge class-level statistics`

Add completion notes describing what was built.

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark show stats and judge stats as complete"
```
