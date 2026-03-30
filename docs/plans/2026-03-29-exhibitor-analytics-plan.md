# Exhibitor Analytics — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the mock AnalyticsDashboard with real exhibitor-focused analytics — a show-scoped "My Stats" tab and a rebuilt lifetime `/analytics` page.

**Architecture:** Two data hooks query `view_entry_with_results` via Supabase. Shared pure-function utils compute stats client-side from the raw rows. Shared visualization components (Recharts + StatCard from `@myk9/ui`) render in both views. Existing `useExhibitorResults` hook already fetches lifetime data — we extend it for the show-scoped variant.

**Tech Stack:** React, TypeScript, React Query, Recharts (already installed), `@myk9/ui` StatCard/StatsGrid, Supabase `view_entry_with_results` view.

**Design doc:** `docs/plans/2026-03-29-exhibitor-analytics-design.md`

---

## Task 1: Analytics Utility Functions + Tests

Pure computation functions with no React dependencies. These are the foundation everything else builds on.

**Files:**
- Create: `apps/myk9show/src/components/analytics/analytics-utils.ts`
- Test: `apps/myk9show/src/components/analytics/__tests__/analytics-utils.test.ts`

### Step 1: Write the test file

Create the test file with tests for all 6 utility functions. Use the `ExhibitorResult` interface from `src/hooks/queries/useExhibitorResults.ts` as the input shape.

```typescript
import { describe, it, expect } from 'vitest';
import {
  computeSummaryStats,
  computePerDogStats,
  computeResultDistribution,
  computeFastestTimes,
  computeQualificationTrend,
  findCleanSweepDogs,
  type StatsEntry,
} from '../analytics-utils';

// Reusable test data factory
function makeEntry(overrides: Partial<StatsEntry> = {}): StatsEntry {
  return {
    id: crypto.randomUUID(),
    dogId: 'dog-1',
    dogCallName: 'Buddy',
    showId: 'show-1',
    showName: 'Spring Classic',
    showDate: '2026-03-01',
    classId: 'class-1',
    className: 'Containers Novice',
    classElement: 'Containers',
    classLevel: 'Novice',
    resultText: 'Q',
    searchTimeSeconds: 45.2,
    totalFaults: 0,
    finalPlacement: 1,
    organization: 'AKC',
    ...overrides,
  };
}

describe('computeSummaryStats', () => {
  it('returns zeroed stats for empty array', () => {
    const stats = computeSummaryStats([]);
    expect(stats.totalEntries).toBe(0);
    expect(stats.qualificationRate).toBe(0);
    expect(stats.bestTime).toBeNull();
    expect(stats.avgTime).toBeNull();
  });

  it('computes qualification rate from scored entries', () => {
    const entries = [
      makeEntry({ resultText: 'Q' }),
      makeEntry({ resultText: 'Q' }),
      makeEntry({ resultText: 'NQ' }),
      makeEntry({ resultText: 'pending' }),
    ];
    const stats = computeSummaryStats(entries);
    expect(stats.totalEntries).toBe(4);
    expect(stats.scoredEntries).toBe(3);
    expect(stats.qualifiedCount).toBe(2);
    // Q rate = 2/3 scored = 66.67
    expect(stats.qualificationRate).toBeCloseTo(66.67, 1);
  });

  it('computes best/avg/median time from qualified entries with times', () => {
    const entries = [
      makeEntry({ resultText: 'Q', searchTimeSeconds: 30 }),
      makeEntry({ resultText: 'Q', searchTimeSeconds: 60 }),
      makeEntry({ resultText: 'Q', searchTimeSeconds: 45 }),
      makeEntry({ resultText: 'NQ', searchTimeSeconds: 20 }),
    ];
    const stats = computeSummaryStats(entries);
    expect(stats.bestTime).toBe(30);
    expect(stats.avgTime).toBeCloseTo(45, 0);
    expect(stats.medianTime).toBe(45);
    expect(stats.bestTimeDogName).toBe('Buddy');
  });
});

describe('computePerDogStats', () => {
  it('groups entries by dog and computes per-dog stats', () => {
    const entries = [
      makeEntry({ dogId: 'dog-1', dogCallName: 'Buddy', resultText: 'Q', searchTimeSeconds: 30 }),
      makeEntry({ dogId: 'dog-1', dogCallName: 'Buddy', resultText: 'NQ', searchTimeSeconds: 50 }),
      makeEntry({ dogId: 'dog-2', dogCallName: 'Luna', resultText: 'Q', searchTimeSeconds: 25 }),
    ];
    const stats = computePerDogStats(entries);
    expect(stats).toHaveLength(2);

    const buddy = stats.find(s => s.dogId === 'dog-1')!;
    expect(buddy.entries).toBe(2);
    expect(buddy.qualificationRate).toBe(50);
    expect(buddy.bestTime).toBe(30);
    expect(buddy.isCleanSweep).toBe(false);

    const luna = stats.find(s => s.dogId === 'dog-2')!;
    expect(luna.entries).toBe(1);
    expect(luna.qualificationRate).toBe(100);
    expect(luna.isCleanSweep).toBe(true);
  });
});

describe('computeResultDistribution', () => {
  it('counts results by status', () => {
    const entries = [
      makeEntry({ resultText: 'Q' }),
      makeEntry({ resultText: 'Q' }),
      makeEntry({ resultText: 'NQ' }),
      makeEntry({ resultText: 'ABS' }),
      makeEntry({ resultText: 'EX' }),
      makeEntry({ resultText: 'pending' }),
    ];
    const dist = computeResultDistribution(entries);
    expect(dist).toEqual([
      { status: 'Qualified', count: 2, color: '#10b981' },
      { status: 'Not Qualified', count: 1, color: '#ef4444' },
      { status: 'Excused', count: 1, color: '#fbbf24' },
      { status: 'Absent', count: 1, color: '#8b5cf6' },
    ]);
  });

  it('omits zero-count statuses', () => {
    const entries = [makeEntry({ resultText: 'Q' })];
    const dist = computeResultDistribution(entries);
    expect(dist).toHaveLength(1);
    expect(dist[0].status).toBe('Qualified');
  });
});

describe('computeFastestTimes', () => {
  it('returns top N qualified entries sorted by time', () => {
    const entries = [
      makeEntry({ resultText: 'Q', searchTimeSeconds: 50, dogCallName: 'Slow' }),
      makeEntry({ resultText: 'Q', searchTimeSeconds: 20, dogCallName: 'Fast' }),
      makeEntry({ resultText: 'Q', searchTimeSeconds: 35, dogCallName: 'Mid' }),
      makeEntry({ resultText: 'NQ', searchTimeSeconds: 10, dogCallName: 'NQ' }),
    ];
    const top2 = computeFastestTimes(entries, 2);
    expect(top2).toHaveLength(2);
    expect(top2[0].dogCallName).toBe('Fast');
    expect(top2[0].rank).toBe(1);
    expect(top2[1].dogCallName).toBe('Mid');
    expect(top2[1].rank).toBe(2);
  });

  it('excludes entries without times', () => {
    const entries = [
      makeEntry({ resultText: 'Q', searchTimeSeconds: null }),
      makeEntry({ resultText: 'Q', searchTimeSeconds: 30 }),
    ];
    const result = computeFastestTimes(entries, 10);
    expect(result).toHaveLength(1);
  });
});

describe('computeQualificationTrend', () => {
  it('groups by show and computes per-show Q rate', () => {
    const entries = [
      makeEntry({ showId: 's1', showName: 'Show A', showDate: '2026-01-15', resultText: 'Q' }),
      makeEntry({ showId: 's1', showName: 'Show A', showDate: '2026-01-15', resultText: 'NQ' }),
      makeEntry({ showId: 's2', showName: 'Show B', showDate: '2026-02-20', resultText: 'Q' }),
      makeEntry({ showId: 's2', showName: 'Show B', showDate: '2026-02-20', resultText: 'Q' }),
    ];
    const trend = computeQualificationTrend(entries);
    expect(trend).toHaveLength(2);
    expect(trend[0].showName).toBe('Show A');
    expect(trend[0].qualificationRate).toBe(50);
    expect(trend[1].showName).toBe('Show B');
    expect(trend[1].qualificationRate).toBe(100);
  });

  it('sorts by show date ascending', () => {
    const entries = [
      makeEntry({ showId: 's2', showDate: '2026-03-01', resultText: 'Q' }),
      makeEntry({ showId: 's1', showDate: '2026-01-01', resultText: 'Q' }),
    ];
    const trend = computeQualificationTrend(entries);
    expect(trend[0].showDate).toBe('2026-01-01');
    expect(trend[1].showDate).toBe('2026-03-01');
  });
});

describe('findCleanSweepDogs', () => {
  it('identifies dogs with 100% qualification (scored only)', () => {
    const entries = [
      makeEntry({ dogId: 'd1', dogCallName: 'Perfect', resultText: 'Q' }),
      makeEntry({ dogId: 'd1', dogCallName: 'Perfect', resultText: 'Q' }),
      makeEntry({ dogId: 'd2', dogCallName: 'Mixed', resultText: 'Q' }),
      makeEntry({ dogId: 'd2', dogCallName: 'Mixed', resultText: 'NQ' }),
    ];
    const sweeps = findCleanSweepDogs(entries);
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0].dogCallName).toBe('Perfect');
    expect(sweeps[0].totalEntries).toBe(2);
  });

  it('ignores pending entries when computing clean sweep', () => {
    const entries = [
      makeEntry({ dogId: 'd1', dogCallName: 'Pending', resultText: 'Q' }),
      makeEntry({ dogId: 'd1', dogCallName: 'Pending', resultText: 'pending' }),
    ];
    const sweeps = findCleanSweepDogs(entries);
    expect(sweeps).toHaveLength(1);
  });
});
```

### Step 2: Run tests to verify they fail

```bash
cd apps/myk9show && npx vitest run src/components/analytics/__tests__/analytics-utils.test.ts
```

Expected: FAIL — module `../analytics-utils` does not exist.

### Step 3: Implement the utility functions

Create `analytics-utils.ts` with the `StatsEntry` interface and all 6 functions. The `StatsEntry` type is a subset of `ExhibitorResult` with an added `organization` field for lifetime filtering.

```typescript
/**
 * Pure computation functions for exhibitor analytics.
 * No React dependencies — tested in isolation.
 */

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
  organization?: string;
}

export interface SummaryStats {
  totalEntries: number;
  scoredEntries: number;
  qualifiedCount: number;
  qualificationRate: number;
  bestTime: number | null;
  bestTimeDogName: string | null;
  avgTime: number | null;
  medianTime: number | null;
}

export interface DogStats {
  dogId: string;
  dogCallName: string;
  entries: number;
  qualifiedCount: number;
  qualificationRate: number;
  bestTime: number | null;
  avgTime: number | null;
  isCleanSweep: boolean;
}

export interface ResultDistributionItem {
  status: string;
  count: number;
  color: string;
}

export interface FastestTimeEntry {
  rank: number;
  id: string;
  dogCallName: string;
  className: string;
  classElement: string | null;
  classLevel: string | null;
  searchTimeSeconds: number;
  showName: string;
}

export interface TrendPoint {
  showId: string;
  showName: string;
  showDate: string;
  totalEntries: number;
  qualifiedCount: number;
  qualificationRate: number;
}

export interface CleanSweepDog {
  dogId: string;
  dogCallName: string;
  totalEntries: number;
  qualifiedCount: number;
}

const RESULT_COLORS: Record<string, string> = {
  Q: '#10b981',
  NQ: '#ef4444',
  EX: '#fbbf24',
  ABS: '#8b5cf6',
  WD: '#6b7280',
};

const RESULT_LABELS: Record<string, string> = {
  Q: 'Qualified',
  NQ: 'Not Qualified',
  EX: 'Excused',
  ABS: 'Absent',
  WD: 'Withdrawn',
};

function isScored(entry: StatsEntry): boolean {
  return entry.resultText !== 'pending';
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeSummaryStats(entries: StatsEntry[]): SummaryStats {
  const scored = entries.filter(isScored);
  const qualified = scored.filter(e => e.resultText === 'Q');
  const qualifiedWithTime = qualified
    .filter(e => e.searchTimeSeconds != null)
    .map(e => e.searchTimeSeconds!);

  qualifiedWithTime.sort((a, b) => a - b);

  const bestTimeEntry = qualifiedWithTime.length > 0
    ? entries.find(
        e => e.resultText === 'Q' && e.searchTimeSeconds === qualifiedWithTime[0]
      )
    : null;

  return {
    totalEntries: entries.length,
    scoredEntries: scored.length,
    qualifiedCount: qualified.length,
    qualificationRate: scored.length > 0
      ? Math.round((qualified.length / scored.length) * 10000) / 100
      : 0,
    bestTime: qualifiedWithTime[0] ?? null,
    bestTimeDogName: bestTimeEntry?.dogCallName ?? null,
    avgTime: qualifiedWithTime.length > 0
      ? qualifiedWithTime.reduce((a, b) => a + b, 0) / qualifiedWithTime.length
      : null,
    medianTime: median(qualifiedWithTime),
  };
}

export function computePerDogStats(entries: StatsEntry[]): DogStats[] {
  const byDog = new Map<string, StatsEntry[]>();
  for (const e of entries) {
    const arr = byDog.get(e.dogId) || [];
    arr.push(e);
    byDog.set(e.dogId, arr);
  }

  return Array.from(byDog.entries()).map(([dogId, dogEntries]) => {
    const scored = dogEntries.filter(isScored);
    const qualified = scored.filter(e => e.resultText === 'Q');
    const times = qualified
      .filter(e => e.searchTimeSeconds != null)
      .map(e => e.searchTimeSeconds!)
      .sort((a, b) => a - b);

    return {
      dogId,
      dogCallName: dogEntries[0].dogCallName,
      entries: dogEntries.length,
      qualifiedCount: qualified.length,
      qualificationRate: scored.length > 0
        ? Math.round((qualified.length / scored.length) * 100)
        : 0,
      bestTime: times[0] ?? null,
      avgTime: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : null,
      isCleanSweep: scored.length > 0 && qualified.length === scored.length,
    };
  });
}

export function computeResultDistribution(entries: StatsEntry[]): ResultDistributionItem[] {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    if (e.resultText === 'pending') continue;
    counts[e.resultText] = (counts[e.resultText] || 0) + 1;
  }

  // Fixed display order
  return ['Q', 'NQ', 'EX', 'ABS', 'WD']
    .filter(key => (counts[key] || 0) > 0)
    .map(key => ({
      status: RESULT_LABELS[key],
      count: counts[key],
      color: RESULT_COLORS[key],
    }));
}

export function computeFastestTimes(entries: StatsEntry[], limit: number): FastestTimeEntry[] {
  return entries
    .filter(e => e.resultText === 'Q' && e.searchTimeSeconds != null)
    .sort((a, b) => a.searchTimeSeconds! - b.searchTimeSeconds!)
    .slice(0, limit)
    .map((e, i) => ({
      rank: i + 1,
      id: e.id,
      dogCallName: e.dogCallName,
      className: e.className,
      classElement: e.classElement,
      classLevel: e.classLevel,
      searchTimeSeconds: e.searchTimeSeconds!,
      showName: e.showName,
    }));
}

export function computeQualificationTrend(entries: StatsEntry[]): TrendPoint[] {
  const byShow = new Map<string, { entries: StatsEntry[]; name: string; date: string }>();
  for (const e of entries) {
    if (!byShow.has(e.showId)) {
      byShow.set(e.showId, { entries: [], name: e.showName, date: e.showDate });
    }
    byShow.get(e.showId)!.entries.push(e);
  }

  return Array.from(byShow.entries())
    .map(([showId, { entries: showEntries, name, date }]) => {
      const scored = showEntries.filter(isScored);
      const qualified = scored.filter(e => e.resultText === 'Q');
      return {
        showId,
        showName: name,
        showDate: date,
        totalEntries: scored.length,
        qualifiedCount: qualified.length,
        qualificationRate: scored.length > 0
          ? Math.round((qualified.length / scored.length) * 100)
          : 0,
      };
    })
    .sort((a, b) => a.showDate.localeCompare(b.showDate));
}

export function findCleanSweepDogs(entries: StatsEntry[]): CleanSweepDog[] {
  const byDog = new Map<string, { name: string; scored: number; qualified: number }>();
  for (const e of entries) {
    if (!isScored(e)) continue;
    if (!byDog.has(e.dogId)) {
      byDog.set(e.dogId, { name: e.dogCallName, scored: 0, qualified: 0 });
    }
    const d = byDog.get(e.dogId)!;
    d.scored++;
    if (e.resultText === 'Q') d.qualified++;
  }

  return Array.from(byDog.entries())
    .filter(([, d]) => d.scored > 0 && d.qualified === d.scored)
    .map(([dogId, d]) => ({
      dogId,
      dogCallName: d.name,
      totalEntries: d.scored,
      qualifiedCount: d.qualified,
    }));
}
```

### Step 4: Run tests to verify they pass

```bash
cd apps/myk9show && npx vitest run src/components/analytics/__tests__/analytics-utils.test.ts
```

Expected: All tests PASS.

### Step 5: Commit

```bash
git add apps/myk9show/src/components/analytics/analytics-utils.ts apps/myk9show/src/components/analytics/__tests__/analytics-utils.test.ts
git commit -m "feat(analytics): add pure computation utils for exhibitor analytics"
```

---

## Task 2: Data Hooks — `useMyShowStats` and `useMyLifetimeStats`

Extend the existing `useExhibitorResults` pattern for both scopes.

**Files:**
- Create: `apps/myk9show/src/hooks/queries/useMyShowStats.ts`
- Create: `apps/myk9show/src/hooks/queries/useMyLifetimeStats.ts`
- Modify: `apps/myk9show/src/lib/queryClient.ts` (add query keys)
- Test: `apps/myk9show/src/hooks/queries/__tests__/useMyShowStats.test.ts`
- Test: `apps/myk9show/src/hooks/queries/__tests__/useMyLifetimeStats.test.ts`

### Step 1: Add query keys to queryClient.ts

Add to the `queryKeys` object (after the `showDayRingProgress` entry):

```typescript
  // Exhibitor Analytics
  myShowStats: (showId: string) => ['analytics', 'show', showId] as const,
  myLifetimeStats: () => ['analytics', 'lifetime'] as const,
```

### Step 2: Write `useMyShowStats` hook

This hook fetches all entries for the current user's dogs in a specific show and maps them to `StatsEntry[]`.

```typescript
/**
 * Fetches the current user's entries for a specific show,
 * mapped to StatsEntry for analytics computation.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useDogsQuery } from './useDogsDatabase';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';

async function fetchMyShowEntries(showId: string, dogIds: string[]): Promise<StatsEntry[]> {
  if (dogIds.length === 0) return [];

  const { data, error } = await supabase
    .from('view_entry_with_results')
    .select(
      'id, dog_id, dog_call_name, show_id, class_id, class_name, class_element, class_level, result_text, search_time_seconds, total_faults, final_placement'
    )
    .eq('show_id', showId)
    .in('dog_id', dogIds);

  if (error) throw error;

  return (data || []).map((row: Record<string, unknown>): StatsEntry => ({
    id: row.id as string,
    dogId: row.dog_id as string,
    dogCallName: (row.dog_call_name as string) || 'Unknown',
    showId: row.show_id as string,
    showName: '',
    showDate: '',
    classId: row.class_id as string,
    className: (row.class_name as string) || 'Unknown Class',
    classElement: row.class_element as string | null,
    classLevel: row.class_level as string | null,
    resultText: (row.result_text as StatsEntry['resultText']) || 'pending',
    searchTimeSeconds: row.search_time_seconds as number | null,
    totalFaults: row.total_faults as number | null,
    finalPlacement: row.final_placement as number | null,
  }));
}

export function useMyShowStats(showId: string | undefined) {
  const { data: dogs = [] } = useDogsQuery();
  const dogIds = dogs.map((d: Record<string, unknown>) => d.id as string);

  return useQuery({
    queryKey: queryKeys.myShowStats(showId || ''),
    queryFn: () => fetchMyShowEntries(showId!, dogIds),
    enabled: !!showId && dogIds.length > 0,
    ...cacheStrategies.moderate,
  });
}
```

### Step 3: Write `useMyLifetimeStats` hook

Extends the `useExhibitorResults` data to include unscored entries and adds organization.

```typescript
/**
 * Fetches all entries for the current user's dogs across all shows,
 * mapped to StatsEntry for analytics computation.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useDogsQuery } from './useDogsDatabase';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';

async function fetchMyLifetimeEntries(dogIds: string[]): Promise<StatsEntry[]> {
  if (dogIds.length === 0) return [];

  const { data, error } = await supabase
    .from('view_entry_with_results')
    .select(
      `id, dog_id, dog_call_name, show_id, class_id, class_name, class_element, class_level,
       result_text, search_time_seconds, total_faults, final_placement,
       show:show_id (id, name, start_date, organization)`
    )
    .in('dog_id', dogIds)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((row: Record<string, unknown>): StatsEntry => {
    const show = row.show as Record<string, unknown> | null;
    return {
      id: row.id as string,
      dogId: row.dog_id as string,
      dogCallName: (row.dog_call_name as string) || 'Unknown',
      showId: row.show_id as string,
      showName: (show?.name as string) || 'Unknown Show',
      showDate: (show?.start_date as string) || '',
      classId: row.class_id as string,
      className: (row.class_name as string) || 'Unknown Class',
      classElement: row.class_element as string | null,
      classLevel: row.class_level as string | null,
      resultText: (row.result_text as StatsEntry['resultText']) || 'pending',
      searchTimeSeconds: row.search_time_seconds as number | null,
      totalFaults: row.total_faults as number | null,
      finalPlacement: row.final_placement as number | null,
      organization: (show?.organization as string) || undefined,
    };
  });
}

export function useMyLifetimeStats() {
  const { data: dogs = [] } = useDogsQuery();
  const dogIds = dogs.map((d: Record<string, unknown>) => d.id as string);
  const sortedIds = dogIds.slice().sort();

  return useQuery({
    queryKey: queryKeys.myLifetimeStats(),
    queryFn: () => fetchMyLifetimeEntries(dogIds),
    enabled: dogIds.length > 0,
    ...cacheStrategies.moderate,
  });
}
```

### Step 4: Write tests for both hooks

Test that the hooks pass correct parameters and return mapped data. Mock Supabase client (already auto-mocked by test setup).

**`useMyShowStats.test.ts`** — test that the hook is disabled when no showId or no dogs, and returns StatsEntry[] shape when enabled.

**`useMyLifetimeStats.test.ts`** — test that the hook is disabled when no dogs, and returns StatsEntry[] with show metadata.

Both test files should use `renderHook` from `@testing-library/react` with the custom wrapper from `testUtils.tsx`. Mock `useDogsQuery` to return test dogs, and mock the supabase query chain.

### Step 5: Run tests

```bash
cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useMyShowStats.test.ts src/hooks/queries/__tests__/useMyLifetimeStats.test.ts
```

### Step 6: Commit

```bash
git add apps/myk9show/src/hooks/queries/useMyShowStats.ts apps/myk9show/src/hooks/queries/useMyLifetimeStats.ts apps/myk9show/src/hooks/queries/__tests__/ apps/myk9show/src/lib/queryClient.ts
git commit -m "feat(analytics): add useMyShowStats and useMyLifetimeStats data hooks"
```

---

## Task 3: Shared Visualization Components

Build the 5 shared components used by both views. These are presentational — they receive computed data, not raw entries.

**Files:**
- Create: `apps/myk9show/src/components/analytics/StatsSummaryCards.tsx`
- Create: `apps/myk9show/src/components/analytics/ResultDistributionChart.tsx`
- Create: `apps/myk9show/src/components/analytics/DogBreakdownCards.tsx`
- Create: `apps/myk9show/src/components/analytics/FastestTimesTable.tsx`
- Create: `apps/myk9show/src/components/analytics/QualificationTrendChart.tsx`
- Create: `apps/myk9show/src/components/analytics/analytics-formatting.ts`
- Test: `apps/myk9show/src/components/analytics/__tests__/analytics-components.test.tsx`

### Step 1: Create formatting helper

Small file for time formatting shared by multiple components.

```typescript
/** Format seconds as MM:SS.HH */
export function formatTime(seconds: number | null): string {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const wholeSecs = Math.floor(secs);
  const hundredths = Math.round((secs - wholeSecs) * 100);
  return `${mins}:${String(wholeSecs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}
```

### Step 2: Build `StatsSummaryCards`

Props: `stats: SummaryStats`. Renders 4 `StatCard` components from `@myk9/ui` inside a `StatsGrid columns={4}`.

- **Entries**: icon=`ClipboardList`, value=`stats.totalEntries`, subtitle=`"${stats.scoredEntries} of ${stats.totalEntries} scored"`, color=`"primary"`
- **Q Rate**: icon=`Award`, value=`"${stats.qualificationRate}%"`, subtitle=`"${stats.qualifiedCount} of ${stats.scoredEntries} qualified"`, progress=`stats.qualificationRate`, color=`"emerald"`
- **Best Time**: icon=`Timer`, value=`formatTime(stats.bestTime)`, subtitle=`stats.bestTimeDogName`, color=`"amber"`
- **Avg Time**: icon=`Clock`, value=`formatTime(stats.avgTime)`, subtitle=`stats.medianTime ? "Median: " + formatTime(stats.medianTime) : undefined`, color=`"primary"`

### Step 3: Build `ResultDistributionChart`

Props: `data: ResultDistributionItem[]`. Recharts `PieChart` with `ResponsiveContainer`, inner `Pie` with `Cell` per segment using `item.color`. Custom tooltip showing status + count. If data is empty, render nothing.

### Step 4: Build `DogBreakdownCards`

Props: `dogs: DogStats[]`, `onDogClick?: (dogId: string) => void`. Responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`). Each card shows:
- Dog name (bold)
- Entries count, Q rate with progress bar
- Best/avg time
- Gold trophy badge if `isCleanSweep`

Cards are clickable if `onDogClick` is provided.

### Step 5: Build `FastestTimesTable`

Props: `times: FastestTimeEntry[]`, `showShowColumn?: boolean`. Simple table with columns: Rank (medal emoji for 1-3), Dog, Class (element + level), Time, and optionally Show. Uses standard `<table>` with Tailwind classes matching existing table patterns.

### Step 6: Build `QualificationTrendChart`

Props: `data: TrendPoint[]`. Recharts `AreaChart` with `ResponsiveContainer`. X-axis: `showDate` (formatted short). Y-axis: 0-100%. Area fill with green gradient. Custom tooltip: show name, "X of Y qualified (Z%)".

### Step 7: Write component tests

Test that each component renders with mock data and handles empty data gracefully. Key assertions:
- `StatsSummaryCards`: renders 4 stat cards with correct values
- `ResultDistributionChart`: renders nothing with empty data
- `DogBreakdownCards`: renders one card per dog, shows clean sweep badge
- `FastestTimesTable`: renders correct number of rows, medal icons for top 3
- `QualificationTrendChart`: renders with trend data

### Step 8: Run tests

```bash
cd apps/myk9show && npx vitest run src/components/analytics/__tests__/analytics-components.test.tsx
```

### Step 9: Commit

```bash
git add apps/myk9show/src/components/analytics/
git commit -m "feat(analytics): add shared visualization components for exhibitor stats"
```

---

## Task 4: Show-Scoped "My Stats" Tab

Wire the shared components into `ShowDetailsPage` as a new tab.

**Files:**
- Create: `apps/myk9show/src/components/analytics/MyShowStatsTab.tsx`
- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`
- Test: `apps/myk9show/src/components/analytics/__tests__/MyShowStatsTab.test.tsx`

### Step 1: Build `MyShowStatsTab`

Props: `showId: string`. This is the tab content component.

```typescript
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyShowStats } from '@/hooks/queries/useMyShowStats';
import {
  computeSummaryStats,
  computePerDogStats,
  computeResultDistribution,
  computeFastestTimes,
} from './analytics-utils';
import { StatsSummaryCards } from './StatsSummaryCards';
import { ResultDistributionChart } from './ResultDistributionChart';
import { DogBreakdownCards } from './DogBreakdownCards';
import { FastestTimesTable } from './FastestTimesTable';
import { BarChart3 } from 'lucide-react';

export function MyShowStatsTab({ showId }: { showId: string }) {
  const { data: entries = [], isLoading } = useMyShowStats(showId);
  const navigate = useNavigate();

  const summary = useMemo(() => computeSummaryStats(entries), [entries]);
  const dogStats = useMemo(() => computePerDogStats(entries), [entries]);
  const distribution = useMemo(() => computeResultDistribution(entries), [entries]);
  const fastestTimes = useMemo(() => computeFastestTimes(entries, 10), [entries]);

  if (isLoading) {
    return /* StatsGrid with 4 StatCardSkeleton */;
  }

  // No scored entries yet
  if (summary.scoredEntries === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium text-foreground">No Results Yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Results will appear here once scoring begins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StatsSummaryCards stats={summary} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResultDistributionChart data={distribution} />
        <DogBreakdownCards
          dogs={dogStats}
          onDogClick={(dogId) => navigate(`/dogs/${dogId}`)}
        />
      </div>
      {fastestTimes.length > 0 && <FastestTimesTable times={fastestTimes} />}
    </div>
  );
}
```

### Step 2: Add "My Stats" tab to ShowDetailsPage

In `ShowDetailsPage.tsx`:

1. Add import: `import { MyShowStatsTab } from '@/components/analytics/MyShowStatsTab';`
2. Add import: `import { BarChart3 } from 'lucide-react';` (already imported? check — if not, add to existing lucide import)
3. Add to `allowedTabs` memo: include `'my-stats'` alongside `'my-entries'` (only when authenticated)
4. Add to `tabDefs` memo: `{ id: 'my-stats', label: 'My Stats', icon: BarChart3 }` after the "my-entries" tab, conditionally on `isAuthenticated && hasUserEntries`
5. Add `TabsContent`:

```tsx
{isAuthenticated && hasUserEntries && (
  <TabsContent value="my-stats">
    <MyShowStatsTab showId={actualCurrentShow.id} />
  </TabsContent>
)}
```

### Step 3: Write tests for MyShowStatsTab

Test empty state (no scored entries), loading state (skeletons), and populated state (all 4 sections render).

### Step 4: Run tests

```bash
cd apps/myk9show && npx vitest run src/components/analytics/__tests__/MyShowStatsTab.test.tsx
```

### Step 5: Commit

```bash
git add apps/myk9show/src/components/analytics/MyShowStatsTab.tsx apps/myk9show/src/components/analytics/__tests__/MyShowStatsTab.test.tsx apps/myk9show/src/pages/ShowDetailsPage.tsx
git commit -m "feat(analytics): add My Stats tab to ShowDetailsPage"
```

---

## Task 5: Rebuild Lifetime Analytics Page

Replace the mock dashboard with real data.

**Files:**
- Rewrite: `apps/myk9show/src/pages/AnalyticsPage.tsx`
- Delete: `apps/myk9show/src/components/analytics/AnalyticsDashboard.tsx`
- Delete: `apps/myk9show/src/components/analytics/AnalyticsDashboard.data.ts`
- Delete: `apps/myk9show/src/components/analytics/AnalyticsDashboard.types.ts`
- Delete: `apps/myk9show/src/components/analytics/StatCard.tsx` (local copy — using `@myk9/ui`)
- Modify: `apps/myk9show/src/components/analytics/index.ts` (remove deleted exports)
- Test: `apps/myk9show/src/pages/__tests__/AnalyticsPage.test.tsx`

### Step 1: Delete mock files

Remove these files:
- `apps/myk9show/src/components/analytics/AnalyticsDashboard.tsx`
- `apps/myk9show/src/components/analytics/AnalyticsDashboard.data.ts`
- `apps/myk9show/src/components/analytics/AnalyticsDashboard.types.ts`
- `apps/myk9show/src/components/analytics/StatCard.tsx`

### Step 2: Update `index.ts`

Remove `AnalyticsDashboard` export. Keep `PerformanceGraphs`, `UserActivityMonitor`, `EnhancedAnalyticsDashboard` (admin monitoring — unrelated). Check if `EnhancedAnalyticsDashboard` imports from the deleted files; if so, assess whether it should also be deleted or just have its import updated.

### Step 3: Rewrite `AnalyticsPage.tsx`

Remove `FeatureGate` and `useSubscriptionGate`. Build a full page with:

```typescript
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useMyLifetimeStats } from '@/hooks/queries/useMyLifetimeStats';
import {
  computeSummaryStats,
  computePerDogStats,
  computeResultDistribution,
  computeFastestTimes,
  computeQualificationTrend,
} from '@/components/analytics/analytics-utils';
import { StatsSummaryCards } from '@/components/analytics/StatsSummaryCards';
import { ResultDistributionChart } from '@/components/analytics/ResultDistributionChart';
import { DogBreakdownCards } from '@/components/analytics/DogBreakdownCards';
import { FastestTimesTable } from '@/components/analytics/FastestTimesTable';
import { QualificationTrendChart } from '@/components/analytics/QualificationTrendChart';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AnalyticsPage() {
  const { data: allEntries = [], isLoading } = useMyLifetimeStats();
  const navigate = useNavigate();
  const [dogFilter, setDogFilter] = useState<string>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');

  // Derive filter options from data
  const dogs = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of allEntries) map.set(e.dogId, e.dogCallName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allEntries]);

  const orgs = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEntries) if (e.organization) set.add(e.organization);
    return Array.from(set).sort();
  }, [allEntries]);

  // Apply filters
  const filtered = useMemo(() => {
    return allEntries.filter(e => {
      if (dogFilter !== 'all' && e.dogId !== dogFilter) return false;
      if (orgFilter !== 'all' && e.organization !== orgFilter) return false;
      return true;
    });
  }, [allEntries, dogFilter, orgFilter]);

  // Compute stats from filtered entries
  const summary = useMemo(() => computeSummaryStats(filtered), [filtered]);
  const dogStats = useMemo(() => computePerDogStats(filtered), [filtered]);
  const distribution = useMemo(() => computeResultDistribution(filtered), [filtered]);
  const fastestTimes = useMemo(() => computeFastestTimes(filtered, 20), [filtered]);
  const trend = useMemo(() => computeQualificationTrend(filtered), [filtered]);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[{ label: 'My Analytics', href: '/analytics' }]}
        title="My Analytics"
        actions={/* dog filter + org filter Select dropdowns */}
      />

      {isLoading ? (
        /* 4 StatCardSkeletons */
      ) : summary.totalEntries === 0 ? (
        /* Empty state: no entries yet */
      ) : (
        <div className="space-y-6">
          <StatsSummaryCards stats={summary} />
          {trend.length > 1 && <QualificationTrendChart data={trend} />}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResultDistributionChart data={distribution} />
            <DogBreakdownCards
              dogs={dogStats}
              onDogClick={(dogId) => navigate(`/dogs/${dogId}`)}
            />
          </div>
          {fastestTimes.length > 0 && (
            <FastestTimesTable times={fastestTimes} showShowColumn />
          )}
        </div>
      )}
    </PageShell>
  );
}
```

### Step 4: Write tests

Test empty state, loading state, populated state, and that filters work (filtering by dog reduces visible data).

### Step 5: Run tests

```bash
cd apps/myk9show && npx vitest run src/pages/__tests__/AnalyticsPage.test.tsx
```

### Step 6: Commit

```bash
git add -A
git commit -m "feat(analytics): rebuild lifetime analytics page with real data, delete mock dashboard"
```

---

## Task 6: Typecheck, Lint, and Full Test Suite

Verify everything integrates cleanly.

**Files:** None (verification only)

### Step 1: Run typecheck

```bash
pnpm typecheck
```

Fix any type errors. Common issues: import paths, nullable fields, missing exports.

### Step 2: Run lint

```bash
pnpm lint
```

Fix any lint errors (unused imports from deleted files, etc).

### Step 3: Run full myK9Show test suite

```bash
cd apps/myk9show && pnpm test
```

Verify no regressions. Pre-existing failures (PresenceService, PerformanceService) are expected.

### Step 4: Commit any fixes

```bash
git add -A
git commit -m "fix(analytics): address typecheck and lint issues"
```

---

## Task 7: Update TO-DOS.md

Mark the todo item complete and update the tracking doc.

### Step 1: Update TO-DOS.md

Change `- [ ] **Trial statistics / analytics**` to `- [x] **Trial statistics / analytics**` with a summary of what was built.

### Step 2: Commit

```bash
git add TO-DOS.md
git commit -m "docs: mark trial statistics/analytics todo complete"
```
