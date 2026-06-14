# TV Run Order Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public, real-time TV run order display for myK9Show that shows active class run orders and podium results when classes finish.

**Architecture:** Public route `/tv/:showId` queries Supabase tables directly (classes, entries, dogs) with Realtime subscriptions for live updates. Responsive layout: persistent grid on TV, scrollable list on mobile. Podium takeover overlays the grid for 20 seconds when a class completes scoring.

**Tech Stack:** React 18, TypeScript, Supabase (queries + Realtime), React Query (TanStack Query), Tailwind CSS, qrcode.react, Web Audio API

**Spec:** [`docs/superpowers/specs/2026-04-02-tv-run-order-display-design.md`](../specs/2026-04-02-tv-run-order-display-design.md)

**[ADDED] Deviation from spec:** The spec references Supabase views (`view_combined_classes`, `view_entry_class_join_normalized`, etc.) which exist in the myK9Q migration set but may not exist in the platform database. This plan queries underlying tables directly (`classes`, `entries`, `dogs`, `trials`, `shows`) to avoid a dependency on views that may not be present. When myK9Q is aligned to the platform DB (separate todo), these queries can be migrated to views if desired.

**[ADDED] Breed silhouettes:** The spec defines a three-tier fallback (photo → breed silhouette → paw print). This plan implements photo → paw print. Breed silhouettes require an SVG asset set that doesn't exist yet. The `DogAvatar` component is designed to accept a future `breedSilhouette` prop. Tracked as a follow-up task.

---

## File Structure

```
apps/myk9show/src/pages/TVDisplay/
├── index.tsx                          # Main page: responsive switch, show header, fullscreen
├── types.ts                           # TV-specific types
├── useTVData.ts                       # Hook: show info + active classes + entries
├── useTVResults.ts                    # Hook: completed classes + top 4 placements
├── useTVRealtime.ts                   # Hook: Supabase Realtime subscriptions
├── TVGrid.tsx                         # TV layout: responsive grid of class cards
├── TVClassCard.tsx                    # Single class: header, in-ring, next-up
├── TVPodiumOverlay.tsx                # Full-screen takeover with queue + staggered reveal
├── TVPodiumCard.tsx                   # Single placement: medal, dog info, photo
├── TVConfetti.tsx                     # CSS confetti burst animation
├── TVSoundToggle.tsx                  # Optional chime via Web Audio API
├── TVMobileList.tsx                   # Mobile layout: scrollable list of cards
├── TVMobileClassCard.tsx              # Mobile class card (compact)
├── TVMobileResults.tsx                # Mobile inline results (compact placements)
└── __tests__/
    ├── useTVData.test.ts
    ├── useTVResults.test.ts
    ├── TVClassCard.test.ts
    ├── TVGrid.test.ts
    ├── TVPodiumOverlay.test.ts
    ├── TVMobileList.test.ts
    └── TVDisplay.test.ts

apps/myk9show/src/components/shared/
└── DogAvatar.tsx                      # Dog photo with paw-print fallback (shared)

# Modified files:
apps/myk9show/src/routes/publicRoutes.tsx       # Add /tv/:showId route
apps/myk9show/src/routes/routeRegistry.ts       # Register for preloading
apps/myk9show/src/lib/queryClient.ts            # Add TV query keys
apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx   # Add QR code section (ShowManagementPage was deleted in PR #314)
```

---

## Key Reference Points

**Supabase client import:**

```typescript
import { supabase } from '@/services/database/supabaseClient';
```

**React Query keys factory:** `apps/myk9show/src/lib/queryClient.ts` — add `tvShow`, `tvClasses`, `tvResults` keys.

**Cache strategies:** `cacheStrategies.realtime` (30s stale, 60s gc) for TV data.

**Custom test render:**

```typescript
import { render, userEvent } from '@/test/utils/testUtils';
```

**Database column names (platform):**

- `classes`: `id`, `trial_id`, `name`, `element`, `level`, `section`, `status`, `is_scoring_finalized`, `judge_name`, `total_entries_count`, `scored_count`, `start_time`
- `entries`: `id`, `class_id`, `dog_id`, `armband`, `handler`, `run_order`, `is_in_ring`, `is_scored`, `final_placement`, `search_time_seconds`, `total_score`, `result_status`
- `dogs`: `id`, `name`, `call_name`, `breed`, `image_url`
- `shows`: `id`, `name`, `start_date`, `end_date`, `status`
- `trials`: `id`, `show_id`, `trial_date`, `trial_number`

**Realtime subscription pattern** (from `useCheckInStatusSubscription.ts`):

```typescript
const channel = supabase.channel(`tv:${showId}`);
channel
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'entries', filter: `show_id=eq.${showId}` },
    callback
  )
  .subscribe();
return () => {
  supabase.removeChannel(channel);
};
```

---

### Task 1: Types & Query Keys

**Files:**

- Create: `apps/myk9show/src/pages/TVDisplay/types.ts`
- Modify: `apps/myk9show/src/lib/queryClient.ts`

- [ ] **Step 1: Create TV type definitions**

```typescript
// apps/myk9show/src/pages/TVDisplay/types.ts

/** Status values supported for active class display.
 *  Platform uses 'In Progress', 'Scheduled'. myK9Q uses 'in_progress', 'briefing', 'setup', 'start_time'.
 *  Support both for forward-compatibility when myK9Q aligns to platform DB. */
export const TV_ACTIVE_STATUSES = [
  'In Progress',
  'Scheduled',
  'in_progress',
  'briefing',
  'setup',
  'start_time',
] as const;

export const TV_STATUS_CONFIG = {
  'In Progress': { label: 'IN PROGRESS', color: 'bg-green-500 text-white' },
  in_progress: { label: 'IN PROGRESS', color: 'bg-green-500 text-white' },
  briefing: { label: 'BRIEFING', color: 'bg-amber-500 text-white' },
  setup: { label: 'UPCOMING', color: 'bg-zinc-600 text-zinc-200' },
  Scheduled: { label: 'UPCOMING', color: 'bg-zinc-600 text-zinc-200' },
  start_time: { label: 'UPCOMING', color: 'bg-zinc-600 text-zinc-200' },
} as const;

export interface TVShowInfo {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface TVDogInfo {
  name: string;
  callName: string | null;
  breed: string | null;
  imageUrl: string | null;
}

export interface TVEntry {
  id: string;
  armband: string | null;
  handler: string | null;
  runOrder: number | null;
  isInRing: boolean;
  isScored: boolean;
  dog: TVDogInfo | null;
}

export interface TVClass {
  id: string;
  name: string;
  element: string | null;
  level: string | null;
  status: string | null;
  judgeName: string | null;
  totalEntries: number | null;
  scoredCount: number | null;
  startTime: string | null;
  trialDate: string | null;
  trialNumber: number | null;
  entries: TVEntry[];
}

export interface TVPlacement {
  placement: number;
  armband: string | null;
  handler: string | null;
  searchTime: number | null;
  totalScore: number | null;
  dog: TVDogInfo | null;
}

export interface TVCompletedClass {
  id: string;
  name: string;
  element: string | null;
  level: string | null;
  judgeName: string | null;
  totalEntries: number | null;
  qualifiedCount: number | null;
  fastestTime: number | null;
  placements: TVPlacement[];
}

/** [ADDED] Shared mapper for dog data from Supabase rows. Used by useTVData and useTVResults. */
export function mapDogInfo(
  raw: {
    name: string;
    call_name: string | null;
    breed: string | null;
    image_url: string | null;
  } | null
): TVDogInfo | null {
  if (!raw) return null;
  return { name: raw.name, callName: raw.call_name, breed: raw.breed, imageUrl: raw.image_url };
}
```

- [ ] **Step 2: Add TV query keys to queryClient.ts**

Add these keys to the `queryKeys` object in `apps/myk9show/src/lib/queryClient.ts`:

```typescript
// Add to queryKeys object:
tvShow: (showId: string) => ['tv', 'show', showId] as const,
tvClasses: (showId: string) => ['tv', 'classes', showId] as const,
tvResults: (showId: string) => ['tv', 'results', showId] as const,
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/myk9show && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to TV types or query keys.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/pages/TVDisplay/types.ts apps/myk9show/src/lib/queryClient.ts
git commit -m "feat(tv): add TV display types and query keys"
```

---

### Task 2: useTVData Hook

**Files:**

- Create: `apps/myk9show/src/pages/TVDisplay/useTVData.ts`
- Test: `apps/myk9show/src/pages/TVDisplay/__tests__/useTVData.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/TVDisplay/__tests__/useTVData.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTVData } from '../useTVData';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@/services/database/supabaseClient');

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const mockShow = {
  id: 'show-1',
  name: 'Spring Trial 2026',
  start_date: '2026-04-01',
  end_date: '2026-04-02',
};

const mockClassRow = {
  id: 'class-1',
  name: 'Novice A',
  element: 'Container',
  level: 'Novice',
  status: 'In Progress',
  judge_name: 'Smith',
  total_entries_count: 10,
  scored_count: 3,
  start_time: '09:00',
  trials: { show_id: 'show-1', trial_date: '2026-04-01', trial_number: 1 },
};

const mockEntryRow = {
  id: 'entry-1',
  class_id: 'class-1',
  armband: '42',
  handler: 'J. Martinez',
  run_order: 1,
  is_in_ring: true,
  is_scored: false,
  dogs: { name: 'Luna Star', call_name: 'Luna', breed: 'Labrador', image_url: null },
};

describe('useTVData', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'shows') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockShow, error: null }),
        } as never;
      }
      if (table === 'classes') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [mockClassRow], error: null }),
        } as never;
      }
      if (table === 'entries') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [mockEntryRow], error: null }),
        } as never;
      }
      return { select: vi.fn().mockReturnThis() } as never;
    });
  });

  it('fetches show info and active classes with entries', async () => {
    const { result } = renderHook(() => useTVData('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.show).toEqual({
      id: 'show-1',
      name: 'Spring Trial 2026',
      startDate: '2026-04-01',
      endDate: '2026-04-02',
    });
    expect(result.current.classes).toHaveLength(1);
    expect(result.current.classes[0].name).toBe('Novice A');
    expect(result.current.classes[0].entries).toHaveLength(1);
    expect(result.current.classes[0].entries[0].armband).toBe('42');
    expect(result.current.classes[0].entries[0].isInRing).toBe(true);
    expect(result.current.classes[0].entries[0].dog?.callName).toBe('Luna');
  });

  it('returns empty classes when show not found', async () => {
    vi.mocked(supabase.from).mockImplementation(() => {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      } as never;
    });

    const { result } = renderHook(() => useTVData('bad-id'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.show).toBeNull();
    expect(result.current.classes).toEqual([]);
  });

  it('filters by trial ID when provided', async () => {
    const selectMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockReturnThis();
    const inMock = vi.fn().mockResolvedValue({ data: [], error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'shows') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockShow, error: null }),
        } as never;
      }
      if (table === 'classes') {
        return { select: selectMock, eq: eqMock, in: inMock } as never;
      }
      return { select: vi.fn().mockReturnThis() } as never;
    });

    renderHook(() => useTVData('show-1', 'trial-1'), { wrapper });

    await waitFor(() => expect(eqMock).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/useTVData.test.ts 2>&1 | tail -20`
Expected: FAIL — `useTVData` module not found.

- [ ] **Step 3: Implement useTVData hook**

```typescript
// apps/myk9show/src/pages/TVDisplay/useTVData.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { TV_ACTIVE_STATUSES, TVShowInfo, TVClass, TVEntry, mapDogInfo } from './types'; // [CHANGED] use shared mapDogInfo

interface TVDataResult {
  show: TVShowInfo | null;
  classes: TVClass[];
  isLoading: boolean;
  error: Error | null;
}

// [CHANGED] Removed local mapDog — use shared mapDogInfo from types.ts

function mapEntry(raw: Record<string, unknown>): TVEntry {
  return {
    id: raw.id as string,
    armband: raw.armband as string | null,
    handler: raw.handler as string | null,
    runOrder: raw.run_order as number | null,
    isInRing: (raw.is_in_ring as boolean) ?? false,
    isScored: (raw.is_scored as boolean) ?? false,
    dog: mapDogInfo(
      raw.dogs as {
        name: string;
        call_name: string | null;
        breed: string | null;
        image_url: string | null;
      } | null
    ),
  };
}

async function fetchTVData(
  showId: string,
  trialId?: string
): Promise<{ show: TVShowInfo | null; classes: TVClass[] }> {
  // Fetch show info
  const { data: showData, error: showError } = await supabase
    .from('shows')
    .select('id, name, start_date, end_date')
    .eq('id', showId)
    .single();

  if (showError || !showData) {
    return { show: null, classes: [] };
  }

  const show: TVShowInfo = {
    id: showData.id,
    name: showData.name,
    startDate: showData.start_date,
    endDate: showData.end_date,
  };

  // Fetch active classes (joined with trials to filter by show)
  let classQuery = supabase
    .from('classes')
    .select(
      'id, name, element, level, status, judge_name, total_entries_count, scored_count, start_time, trials!inner(show_id, trial_date, trial_number)'
    )
    .eq('trials.show_id', showId)
    .in('status', [...TV_ACTIVE_STATUSES]);

  if (trialId) {
    classQuery = classQuery.eq('trial_id', trialId);
  }

  const { data: classData, error: classError } = await classQuery;

  if (classError || !classData || classData.length === 0) {
    return { show, classes: [] };
  }

  // Fetch entries for all active classes
  const classIds = classData.map(c => c.id);
  const { data: entryData } = await supabase
    .from('entries')
    .select(
      'id, class_id, armband, handler, run_order, is_in_ring, is_scored, dogs(name, call_name, breed, image_url)'
    )
    .in('class_id', classIds)
    .eq('is_scored', false)
    .order('run_order', { ascending: true });

  // Also fetch the in-ring entry (which may be scored already)
  const { data: inRingData } = await supabase
    .from('entries')
    .select(
      'id, class_id, armband, handler, run_order, is_in_ring, is_scored, dogs(name, call_name, breed, image_url)'
    )
    .in('class_id', classIds)
    .eq('is_in_ring', true);

  // Combine and deduplicate
  const allEntries = [...(entryData ?? []), ...(inRingData ?? [])];
  const uniqueEntries = Array.from(new Map(allEntries.map(e => [e.id, e])).values());

  // Group entries by class
  const entriesByClass = new Map<string, TVEntry[]>();
  for (const entry of uniqueEntries) {
    const classId = entry.class_id as string;
    if (!entriesByClass.has(classId)) {
      entriesByClass.set(classId, []);
    }
    entriesByClass.get(classId)!.push(mapEntry(entry as Record<string, unknown>));
  }

  // Sort entries: in-ring first, then by run_order
  for (const [, entries] of entriesByClass) {
    entries.sort((a, b) => {
      if (a.isInRing && !b.isInRing) return -1;
      if (!a.isInRing && b.isInRing) return 1;
      return (a.runOrder ?? 999) - (b.runOrder ?? 999);
    });
  }

  // Map classes
  const classes: TVClass[] = classData.map(c => {
    const trial = c.trials as unknown as {
      show_id: string;
      trial_date: string;
      trial_number: number;
    };
    return {
      id: c.id,
      name: c.name,
      element: c.element,
      level: c.level,
      status: c.status,
      judgeName: c.judge_name,
      totalEntries: c.total_entries_count,
      scoredCount: c.scored_count,
      startTime: c.start_time,
      trialDate: trial?.trial_date ?? null,
      trialNumber: trial?.trial_number ?? null,
      entries: entriesByClass.get(c.id) ?? [],
    };
  });

  return { show, classes };
}

export function useTVData(showId: string, trialId?: string): TVDataResult {
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.tvClasses(showId), trialId],
    queryFn: () => fetchTVData(showId, trialId),
    ...cacheStrategies.realtime,
    enabled: !!showId,
  });

  return {
    show: data?.show ?? null,
    classes: data?.classes ?? [],
    isLoading,
    error: error as Error | null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/useTVData.test.ts 2>&1 | tail -20`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/TVDisplay/useTVData.ts apps/myk9show/src/pages/TVDisplay/__tests__/useTVData.test.ts
git commit -m "feat(tv): add useTVData hook for active classes and entries"
```

---

### Task 3: useTVResults Hook

**Files:**

- Create: `apps/myk9show/src/pages/TVDisplay/useTVResults.ts`
- Test: `apps/myk9show/src/pages/TVDisplay/__tests__/useTVResults.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/TVDisplay/__tests__/useTVResults.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTVResults } from '../useTVResults';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@/services/database/supabaseClient');

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const mockFinalizedClass = {
  id: 'class-done',
  name: 'Advanced',
  element: 'Interior',
  level: 'Advanced',
  judge_name: 'Lee',
  total_entries_count: 20,
  is_scoring_finalized: true,
  trials: { show_id: 'show-1', trial_date: '2026-04-01' },
};

const mockPlacements = [
  {
    id: 'e1', class_id: 'class-done', armband: '42', handler: 'J. Martinez',
    final_placement: 1, search_time_seconds: 35.1, total_score: null, result_status: 'qualified',
    dogs: { name: 'Luna Star', call_name: 'Luna', breed: 'Labrador', image_url: null },
  },
  {
    id: 'e2', class_id: 'class-done', armband: '18', handler: 'S. Johnson',
    final_placement: 2, search_time_seconds: 38.2, total_score: null, result_status: 'qualified',
    dogs: { name: 'Rex', call_name: 'Rex', breed: 'GSD', image_url: null },
  },
];

describe('useTVResults', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'classes') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        } as never;
      }
      if (table === 'entries') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockPlacements, error: null }),
        } as never;
      }
      return { select: vi.fn().mockReturnThis() } as never;
    });

    // Override classes query to return finalized classes
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'classes') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: [mockFinalizedClass], error: null }),
          })),
        } as never;
      }
      if (table === 'entries') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockPlacements, error: null }),
        } as never;
      }
      return { select: vi.fn().mockReturnThis() } as never;
    });
  });

  it('fetches completed classes with top 4 placements', async () => {
    const { result } = renderHook(() => useTVResults('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.completedClasses).toHaveLength(1);
    expect(result.current.completedClasses[0].name).toBe('Advanced');
    expect(result.current.completedClasses[0].placements).toHaveLength(2);
    expect(result.current.completedClasses[0].placements[0].placement).toBe(1);
    expect(result.current.completedClasses[0].placements[0].dog?.callName).toBe('Luna');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/useTVResults.test.ts 2>&1 | tail -20`
Expected: FAIL — `useTVResults` module not found.

- [ ] **Step 3: Implement useTVResults hook**

```typescript
// apps/myk9show/src/pages/TVDisplay/useTVResults.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { TVCompletedClass, TVPlacement, mapDogInfo } from './types'; // [CHANGED] use shared mapDogInfo

interface TVResultsResult {
  completedClasses: TVCompletedClass[];
  isLoading: boolean;
}

// [CHANGED] Removed local mapDog — use shared mapDogInfo from types.ts

async function fetchTVResults(showId: string, trialId?: string): Promise<TVCompletedClass[]> {
  // Fetch finalized classes for this show
  let classQuery = supabase
    .from('classes')
    .select('id, name, element, level, judge_name, total_entries_count, trials!inner(show_id)')
    .eq('trials.show_id', showId)
    .eq('is_scoring_finalized', true);

  if (trialId) {
    classQuery = classQuery.eq('trial_id', trialId);
  }

  const { data: classData, error: classError } = await classQuery;

  if (classError || !classData || classData.length === 0) {
    return [];
  }

  const classIds = classData.map(c => c.id);

  // Fetch top 4 placements for all completed classes
  const { data: placementData } = await supabase
    .from('entries')
    .select(
      'id, class_id, armband, handler, final_placement, search_time_seconds, total_score, result_status, dogs(name, call_name, breed, image_url)'
    )
    .in('class_id', classIds)
    .gte('final_placement', 1)
    .lte('final_placement', 4)
    .order('final_placement', { ascending: true });

  // Group placements by class
  const placementsByClass = new Map<string, TVPlacement[]>();
  for (const p of placementData ?? []) {
    const classId = p.class_id as string;
    if (!placementsByClass.has(classId)) {
      placementsByClass.set(classId, []);
    }
    placementsByClass.get(classId)!.push({
      placement: p.final_placement!,
      armband: p.armband,
      handler: p.handler,
      searchTime: p.search_time_seconds,
      totalScore: p.total_score,
      dog: mapDogInfo(
        p.dogs as {
          name: string;
          call_name: string | null;
          breed: string | null;
          image_url: string | null;
        } | null
      ),
    });
  }

  // Fetch qualified counts per class
  const { data: qualifiedData } = await supabase
    .from('entries')
    .select('class_id, search_time_seconds')
    .in('class_id', classIds)
    .eq('result_status', 'qualified');

  const qualifiedByClass = new Map<string, { count: number; fastest: number | null }>();
  for (const q of qualifiedData ?? []) {
    const classId = q.class_id as string;
    const current = qualifiedByClass.get(classId) ?? { count: 0, fastest: null };
    current.count++;
    if (q.search_time_seconds != null) {
      current.fastest =
        current.fastest == null
          ? q.search_time_seconds
          : Math.min(current.fastest, q.search_time_seconds);
    }
    qualifiedByClass.set(classId, current);
  }

  return classData.map(c => {
    const stats = qualifiedByClass.get(c.id);
    return {
      id: c.id,
      name: c.name,
      element: c.element,
      level: c.level,
      judgeName: c.judge_name,
      totalEntries: c.total_entries_count,
      qualifiedCount: stats?.count ?? 0,
      fastestTime: stats?.fastest ?? null,
      placements: placementsByClass.get(c.id) ?? [],
    };
  });
}

export function useTVResults(showId: string, trialId?: string): TVResultsResult {
  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.tvResults(showId), trialId],
    queryFn: () => fetchTVResults(showId, trialId),
    ...cacheStrategies.realtime,
    enabled: !!showId,
  });

  return {
    completedClasses: data ?? [],
    isLoading,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/useTVResults.test.ts 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/TVDisplay/useTVResults.ts apps/myk9show/src/pages/TVDisplay/__tests__/useTVResults.test.ts
git commit -m "feat(tv): add useTVResults hook for completed class placements"
```

---

### Task 4: useTVRealtime Hook

**Files:**

- Create: `apps/myk9show/src/pages/TVDisplay/useTVRealtime.ts`

- [ ] **Step 1: Implement realtime subscription hook**

This hook subscribes to Supabase Realtime for live entry/class updates and invalidates React Query cache. It also provides a polling fallback when the realtime connection drops.

```typescript
// apps/myk9show/src/pages/TVDisplay/useTVRealtime.ts
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';

const POLL_INTERVAL_MS = 30_000;

interface TVRealtimeState {
  isConnected: boolean;
}

export function useTVRealtime(showId: string): TVRealtimeState {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!showId) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tvClasses(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tvResults(showId) });
    };

    // Realtime subscription
    const channel = supabase.channel(`tv:${showId}`);

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries', filter: `show_id=eq.${showId}` },
        invalidate
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classes' }, invalidate)
      .subscribe(status => {
        const connected = status === 'SUBSCRIBED';
        setIsConnected(connected);

        // Start polling fallback when disconnected
        if (!connected && !pollRef.current) {
          pollRef.current = setInterval(invalidate, POLL_INTERVAL_MS);
        }
        // Stop polling when reconnected
        if (connected && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          invalidate(); // Refresh immediately on reconnect
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [showId, queryClient]);

  return { isConnected };
}
```

- [ ] **Step 2: [ADDED] Verify RLS allows anon SELECT on required tables**

Run this SQL in the Supabase dashboard SQL editor (or via `supabase` CLI) to confirm anon key can read from all tables the TV display queries:

```sql
-- Check RLS policies that allow anon SELECT
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('shows', 'classes', 'entries', 'dogs', 'trials')
  AND cmd = 'SELECT'
ORDER BY tablename;
```

If any table is missing a SELECT policy for `anon`, create a migration to add one. The TV display is read-only and public — anon SELECT is required.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/myk9show && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/pages/TVDisplay/useTVRealtime.ts
git commit -m "feat(tv): add useTVRealtime hook with polling fallback"
```

---

### Task 5: DogAvatar Shared Component

**Files:**

- Create: `apps/myk9show/src/components/shared/DogAvatar.tsx`
- Test: `apps/myk9show/src/components/shared/__tests__/DogAvatar.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/components/shared/__tests__/DogAvatar.test.tsx
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { DogAvatar } from '../DogAvatar';

describe('DogAvatar', () => {
  it('renders dog photo when imageUrl is provided', () => {
    render(<DogAvatar imageUrl="https://example.com/dog.jpg" name="Luna" size="md" />);
    const img = screen.getByRole('img', { name: 'Luna' });
    expect(img).toHaveAttribute('src', 'https://example.com/dog.jpg');
  });

  it('renders paw print fallback when no image', () => {
    render(<DogAvatar imageUrl={null} name="Rex" size="md" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Rex')).toBeInTheDocument();
  });

  it('applies border color class', () => {
    const { container } = render(
      <DogAvatar imageUrl={null} name="Rex" size="md" borderColor="border-amber-400" />
    );
    expect(container.firstChild).toHaveClass('border-amber-400');
  });

  it('renders correct size', () => {
    const { container } = render(<DogAvatar imageUrl={null} name="Rex" size="lg" />);
    expect(container.firstChild).toHaveClass('h-16', 'w-16');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/shared/__tests__/DogAvatar.test.tsx 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DogAvatar**

```typescript
// apps/myk9show/src/components/shared/DogAvatar.tsx
import { cn } from '@/lib/utils';
import { PawPrint } from 'lucide-react';

const SIZES = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
} as const;

const ICON_SIZES = {
  sm: 14,
  md: 20,
  lg: 28,
} as const;

interface DogAvatarProps {
  imageUrl: string | null;
  name: string;
  size: keyof typeof SIZES;
  borderColor?: string;
  className?: string;
}

export function DogAvatar({ imageUrl, name, size, borderColor, className }: DogAvatarProps) {
  return (
    <div
      className={cn(
        'rounded-full border-2 overflow-hidden flex items-center justify-center bg-zinc-800',
        SIZES[size],
        borderColor ?? 'border-zinc-600',
        className
      )}
      aria-label={imageUrl ? undefined : name}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <PawPrint size={ICON_SIZES[size]} className="text-zinc-500" />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/shared/__tests__/DogAvatar.test.tsx 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shared/DogAvatar.tsx apps/myk9show/src/components/shared/__tests__/DogAvatar.test.tsx
git commit -m "feat: add DogAvatar shared component with photo and paw-print fallback"
```

---

### Task 6: TVClassCard Component

**Files:**

- Create: `apps/myk9show/src/pages/TVDisplay/TVClassCard.tsx`
- Test: `apps/myk9show/src/pages/TVDisplay/__tests__/TVClassCard.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/TVDisplay/__tests__/TVClassCard.test.tsx
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { TVClassCard } from '../TVClassCard';
import type { TVClass } from '../types';

const mockClass: TVClass = {
  id: 'class-1',
  name: 'Novice A',
  element: 'Container',
  level: 'Novice',
  status: 'In Progress',
  judgeName: 'Smith',
  totalEntries: 28,
  scoredCount: 12,
  startTime: '09:00',
  trialDate: '2026-04-01',
  trialNumber: 1,
  entries: [
    {
      id: 'e1', armband: '42', handler: 'J. Martinez', runOrder: 4,
      isInRing: true, isScored: false,
      dog: { name: 'Luna Star', callName: 'Luna', breed: 'Labrador', imageUrl: null },
    },
    {
      id: 'e2', armband: '18', handler: 'S. Johnson', runOrder: 5,
      isInRing: false, isScored: false,
      dog: { name: 'Rex', callName: 'Rex', breed: 'GSD', imageUrl: null },
    },
    {
      id: 'e3', armband: '07', handler: 'T. Williams', runOrder: 6,
      isInRing: false, isScored: false,
      dog: { name: 'Bella', callName: 'Bella', breed: 'Golden', imageUrl: null },
    },
  ],
};

describe('TVClassCard', () => {
  it('renders class name and judge', () => {
    render(<TVClassCard tvClass={mockClass} />);
    expect(screen.getByText('Novice A')).toBeInTheDocument();
    expect(screen.getByText(/Smith/)).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<TVClassCard tvClass={mockClass} />);
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
  });

  it('renders progress count', () => {
    render(<TVClassCard tvClass={mockClass} />);
    expect(screen.getByText('12 / 28')).toBeInTheDocument();
  });

  it('highlights the in-ring dog', () => {
    render(<TVClassCard tvClass={mockClass} />);
    expect(screen.getByText('IN RING')).toBeInTheDocument();
    expect(screen.getByText('#42 Luna')).toBeInTheDocument();
    expect(screen.getByText(/J\. Martinez/)).toBeInTheDocument();
  });

  it('shows NEXT label on the first pending entry', () => {
    render(<TVClassCard tvClass={mockClass} />);
    expect(screen.getByText('NEXT')).toBeInTheDocument();
    expect(screen.getByText(/#18 Rex/)).toBeInTheDocument();
  });

  it('renders start_time status with time', () => {
    const classWithTime = { ...mockClass, status: 'start_time', startTime: '10:30' };
    render(<TVClassCard tvClass={classWithTime} />);
    expect(screen.getByText('STARTS 10:30')).toBeInTheDocument();
  });

  it('applies highlight animation when highlighted prop is true', () => {
    const { container } = render(<TVClassCard tvClass={mockClass} highlighted />);
    expect(container.firstChild).toHaveClass('animate-pulse-border');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/TVClassCard.test.tsx 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TVClassCard**

```typescript
// apps/myk9show/src/pages/TVDisplay/TVClassCard.tsx
import { cn } from '@/lib/utils';
import { TV_STATUS_CONFIG, TVClass, TVEntry } from './types';

interface TVClassCardProps {
  tvClass: TVClass;
  highlighted?: boolean;
  maxNextUp?: number;
}

function getStatusBadge(status: string | null, startTime: string | null) {
  if (status === 'start_time' && startTime) {
    return { label: `STARTS ${startTime}`, color: 'bg-zinc-600 text-zinc-200' };
  }
  const config = TV_STATUS_CONFIG[status as keyof typeof TV_STATUS_CONFIG];
  return config ?? { label: status ?? 'UNKNOWN', color: 'bg-zinc-600 text-zinc-200' };
}

function InRingEntry({ entry }: { entry: TVEntry }) {
  const displayName = entry.dog?.callName ?? entry.dog?.name ?? 'Unknown';
  return (
    <div className="bg-blue-950 border border-blue-600 rounded-md p-2 mb-2">
      <span className="text-blue-400 text-xs font-semibold">IN RING</span>
      <div className="mt-0.5">
        <span className="text-white font-semibold">#{entry.armband} {displayName}</span>
        {entry.handler && <span className="text-zinc-400 text-sm ml-1">— {entry.handler}</span>}
      </div>
    </div>
  );
}

function NextUpEntry({ entry, isNext }: { entry: TVEntry; isNext: boolean }) {
  const displayName = entry.dog?.callName ?? entry.dog?.name ?? 'Unknown';
  return (
    <div className={cn('px-3 py-1 text-sm border-b border-zinc-800', isNext ? 'text-zinc-200' : 'text-zinc-500')}>
      {isNext && <span className="text-amber-500 text-xs font-semibold mr-1.5">NEXT</span>}
      #{entry.armband} {displayName}
      {entry.handler && <span className="text-zinc-600"> — {entry.handler}</span>}
    </div>
  );
}

export function TVClassCard({ tvClass, highlighted, maxNextUp = 5 }: TVClassCardProps) {
  const { label, color } = getStatusBadge(tvClass.status, tvClass.startTime);

  const inRingEntry = tvClass.entries.find((e) => e.isInRing);
  const pendingEntries = tvClass.entries
    .filter((e) => !e.isInRing && !e.isScored)
    .slice(0, maxNextUp);

  return (
    <div
      className={cn(
        'bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden transition-all',
        highlighted && 'animate-pulse-border'
      )}
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-700">
        <div>
          <span className="font-bold text-zinc-100 text-sm">{tvClass.name}</span>
          {tvClass.judgeName && (
            <span className="text-zinc-500 text-xs ml-2">Judge: {tvClass.judgeName}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tvClass.totalEntries != null && tvClass.scoredCount != null && (
            <span className="text-xs text-zinc-500">{tvClass.scoredCount} / {tvClass.totalEntries}</span>
          )}
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-semibold', color)}>
            {label}
          </span>
        </div>
      </div>

      {/* Entries */}
      <div className="p-3">
        {inRingEntry && <InRingEntry entry={inRingEntry} />}
        {pendingEntries.map((entry, i) => (
          <NextUpEntry key={entry.id} entry={entry} isNext={i === 0} />
        ))}
        {!inRingEntry && pendingEntries.length === 0 && (
          <div className="text-zinc-600 text-sm text-center py-2">No entries in queue</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/TVClassCard.test.tsx 2>&1 | tail -10`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/TVDisplay/TVClassCard.tsx apps/myk9show/src/pages/TVDisplay/__tests__/TVClassCard.test.tsx
git commit -m "feat(tv): add TVClassCard component with in-ring and next-up display"
```

---

### Task 7: TVGrid Component

**Files:**

- Create: `apps/myk9show/src/pages/TVDisplay/TVGrid.tsx`
- Test: `apps/myk9show/src/pages/TVDisplay/__tests__/TVGrid.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/TVDisplay/__tests__/TVGrid.test.tsx
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { TVGrid } from '../TVGrid';
import type { TVClass } from '../types';

const makeClass = (id: string, name: string): TVClass => ({
  id, name, element: null, level: null, status: 'In Progress',
  judgeName: 'Smith', totalEntries: 10, scoredCount: 3,
  startTime: null, trialDate: null, trialNumber: null,
  entries: [],
});

describe('TVGrid', () => {
  it('renders all class cards in a grid', () => {
    const classes = [makeClass('1', 'Novice A'), makeClass('2', 'Open'), makeClass('3', 'Excellent')];
    render(<TVGrid classes={classes} />);

    expect(screen.getByText('Novice A')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });

  it('renders empty state when no classes', () => {
    render(<TVGrid classes={[]} />);
    expect(screen.getByText(/no classes currently in progress/i)).toBeInTheDocument();
  });

  it('highlights recently updated class', () => {
    const classes = [makeClass('1', 'Novice A')];
    render(<TVGrid classes={classes} highlightedClassId="1" />);
    // The highlighted class card should exist (exact animation class tested in TVClassCard)
    expect(screen.getByText('Novice A')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/TVGrid.test.tsx 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Implement TVGrid**

```typescript
// apps/myk9show/src/pages/TVDisplay/TVGrid.tsx
import { cn } from '@/lib/utils'; // [ADDED]
import { TVClassCard } from './TVClassCard';
import type { TVClass } from './types';

interface TVGridProps {
  classes: TVClass[];
  highlightedClassId?: string | null;
  nextClassName?: string | null; // [ADDED] next scheduled class name for empty state
  nextClassTime?: string | null; // [ADDED] next scheduled start time
}

export function TVGrid({ classes, highlightedClassId, nextClassName, nextClassTime }: TVGridProps) {
  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-zinc-500">
        <div className="text-lg">No classes currently in progress</div>
        {/* [ADDED] Show next scheduled class if available */}
        {nextClassName && (
          <div className="text-sm mt-2">
            Next up: {nextClassName}{nextClassTime && ` at ${nextClassTime}`}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "grid gap-4 p-4",
      classes.length === 1 ? "grid-cols-1 max-w-lg mx-auto" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" // [ADDED] center single class card
    )}>
      {classes.map((tvClass) => (
        <TVClassCard
          key={tvClass.id}
          tvClass={tvClass}
          highlighted={tvClass.id === highlightedClassId}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/TVGrid.test.tsx 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/TVDisplay/TVGrid.tsx apps/myk9show/src/pages/TVDisplay/__tests__/TVGrid.test.tsx
git commit -m "feat(tv): add TVGrid responsive layout component"
```

---

### Task 8: TVPodiumCard & TVConfetti Components

**Files:**

- Create: `apps/myk9show/src/pages/TVDisplay/TVPodiumCard.tsx`
- Create: `apps/myk9show/src/pages/TVDisplay/TVConfetti.tsx`

- [ ] **Step 1: Implement TVPodiumCard**

```typescript
// apps/myk9show/src/pages/TVDisplay/TVPodiumCard.tsx
import { cn } from '@/lib/utils';
import { DogAvatar } from '@/components/shared/DogAvatar';
import type { TVPlacement } from './types';

const MEDAL_CONFIG = {
  1: { emoji: '🥇', label: '1st Place', border: 'border-amber-400', podiumHeight: 'h-24', textColor: 'text-amber-400', bg: 'from-amber-700 to-amber-500' },
  2: { emoji: '🥈', label: '2nd Place', border: 'border-zinc-400', podiumHeight: 'h-[72px]', textColor: 'text-zinc-400', bg: 'from-zinc-600 to-zinc-400' },
  3: { emoji: '🥉', label: '3rd Place', border: 'border-orange-600', podiumHeight: 'h-14', textColor: 'text-orange-600', bg: 'from-orange-800 to-orange-600' },
  4: { emoji: '', label: '4th Place', border: 'border-zinc-600', podiumHeight: 'h-10', textColor: 'text-zinc-500', bg: 'from-zinc-700 to-zinc-600' },
} as const;

interface TVPodiumCardProps {
  placement: TVPlacement;
  animationDelay: number;
  showShimmer?: boolean;
}

export function TVPodiumCard({ placement, animationDelay, showShimmer }: TVPodiumCardProps) {
  const config = MEDAL_CONFIG[placement.placement as keyof typeof MEDAL_CONFIG] ?? MEDAL_CONFIG[4];
  const displayName = placement.dog?.callName ?? placement.dog?.name ?? 'Unknown';
  const displayTime = placement.searchTime != null ? `${placement.searchTime.toFixed(1)}s` : placement.totalScore != null ? `${placement.totalScore}` : '';

  return (
    <div
      className="text-center animate-slide-up" // [CHANGED] removed invalid fill-mode-forwards; forwards baked into animation definition
      style={{ animationDelay: `${animationDelay}s` }}
    >
      {config.emoji && <div className={cn('text-sm mb-1', config.textColor)}>{config.emoji} {config.label}</div>}
      {!config.emoji && <div className="text-xs text-zinc-600 mb-1">{config.label}</div>}

      <DogAvatar
        imageUrl={placement.dog?.imageUrl ?? null}
        name={displayName}
        size="lg"
        borderColor={config.border}
        className="mx-auto mb-2"
      />

      <div className="font-bold text-zinc-100 text-base">#{placement.armband} {displayName}</div>
      {placement.handler && <div className="text-zinc-400 text-sm">{placement.handler}</div>}
      {displayTime && <div className={cn('text-sm mt-1', config.textColor)}>{displayTime}</div>}

      <div
        className={cn(
          'mt-2 rounded-t-md bg-gradient-to-b',
          config.bg,
          config.podiumHeight,
          showShimmer && 'relative overflow-hidden'
        )}
      >
        {showShimmer && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement TVConfetti**

```typescript
// apps/myk9show/src/pages/TVDisplay/TVConfetti.tsx
import { useEffect, useState } from 'react';

const PARTICLE_COUNT = 40;
const COLORS = ['#d4af37', '#f5d060', '#ffffff', '#fbbf24', '#f59e0b'];

interface Particle {
  id: number;
  x: number;
  color: string;
  delay: number;
  duration: number;
  size: number;
  rotation: number;
}

function createParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: 30 + Math.random() * 40, // Cluster around center (30%-70%)
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 1,
    size: 4 + Math.random() * 6,
    rotation: Math.random() * 360,
  }));
}

export function TVConfetti() {
  const [particles] = useState(createParticles);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${p.x}%`,
            top: '-5%',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            transform: `rotate(${p.rotation}deg)`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add TV animations to Tailwind config**

Find the Tailwind config in `apps/myk9show/tailwind.config.ts` (or `.js`) and add these keyframes and animations to the `theme.extend` section:

```typescript
// Add to theme.extend.keyframes:
'slide-up': {
  '0%': { transform: 'translateY(40px)', opacity: '0' },
  '100%': { transform: 'translateY(0)', opacity: '1' },
},
'shimmer': {
  '0%': { transform: 'translateX(-100%)' },
  '100%': { transform: 'translateX(100%)' },
},
'confetti-fall': {
  '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
  '100%': { transform: 'translateY(400px) rotate(720deg)', opacity: '0' },
},
'pulse-border': {
  '0%, 100%': { borderColor: 'rgb(63 63 70)' },
  '50%': { borderColor: 'rgb(59 130 246)' },
},

// Add to theme.extend.animation:
'slide-up': 'slide-up 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
'shimmer': 'shimmer 3s ease-in-out infinite',
'confetti-fall': 'confetti-fall 2s ease-out forwards',
'pulse-border': 'pulse-border 1s ease-in-out',
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd apps/myk9show && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/TVDisplay/TVPodiumCard.tsx apps/myk9show/src/pages/TVDisplay/TVConfetti.tsx apps/myk9show/tailwind.config.*
git commit -m "feat(tv): add TVPodiumCard, TVConfetti, and TV animations"
```

---

### Task 9: TVPodiumOverlay Component

**Files:**

- Create: `apps/myk9show/src/pages/TVDisplay/TVPodiumOverlay.tsx`
- Test: `apps/myk9show/src/pages/TVDisplay/__tests__/TVPodiumOverlay.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/TVDisplay/__tests__/TVPodiumOverlay.test.tsx
import { render } from '@/test/utils/testUtils';
import { screen, act } from '@testing-library/react';
import { TVPodiumOverlay } from '../TVPodiumOverlay';
import type { TVCompletedClass } from '../types';

const mockCompleted: TVCompletedClass = {
  id: 'class-1',
  name: 'Novice A',
  element: 'Container',
  level: 'Novice',
  judgeName: 'Smith',
  totalEntries: 28,
  qualifiedCount: 22,
  fastestTime: 35.1,
  placements: [
    { placement: 1, armband: '42', handler: 'J. Martinez', searchTime: 35.1, totalScore: null, dog: { name: 'Luna', callName: 'Luna', breed: 'Lab', imageUrl: null } },
    { placement: 2, armband: '18', handler: 'S. Johnson', searchTime: 38.2, totalScore: null, dog: { name: 'Rex', callName: 'Rex', breed: 'GSD', imageUrl: null } },
    { placement: 3, armband: '07', handler: 'T. Williams', searchTime: 41.7, totalScore: null, dog: { name: 'Bella', callName: 'Bella', breed: 'Golden', imageUrl: null } },
    { placement: 4, armband: '31', handler: 'R. Chen', searchTime: 44.0, totalScore: null, dog: { name: 'Max', callName: 'Max', breed: 'Beagle', imageUrl: null } },
  ],
};

describe('TVPodiumOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders class name and placements', () => {
    render(<TVPodiumOverlay queue={[mockCompleted]} onComplete={vi.fn()} />);

    expect(screen.getByText('Novice A')).toBeInTheDocument();
    expect(screen.getByText('1st Place')).toBeInTheDocument();
    expect(screen.getByText(/#42 Luna/)).toBeInTheDocument();
  });

  it('renders class summary stats', () => {
    render(<TVPodiumOverlay queue={[mockCompleted]} onComplete={vi.fn()} />);
    expect(screen.getByText(/28 entries/)).toBeInTheDocument();
    expect(screen.getByText(/22 qualified/)).toBeInTheDocument();
    expect(screen.getByText(/35\.1s/)).toBeInTheDocument();
  });

  it('calls onComplete after 20 seconds', () => {
    const onComplete = vi.fn();
    render(<TVPodiumOverlay queue={[mockCompleted]} onComplete={onComplete} />);

    act(() => { vi.advanceTimersByTime(20000); });
    expect(onComplete).toHaveBeenCalledWith('class-1');
  });

  it('renders nothing when queue is empty', () => {
    const { container } = render(<TVPodiumOverlay queue={[]} onComplete={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/TVPodiumOverlay.test.tsx 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Implement TVPodiumOverlay**

```typescript
// apps/myk9show/src/pages/TVDisplay/TVPodiumOverlay.tsx
import { useEffect, useCallback } from 'react';
import { TVPodiumCard } from './TVPodiumCard';
import { TVConfetti } from './TVConfetti';
import type { TVCompletedClass } from './types';

const DISPLAY_DURATION_MS = 20_000;

// Staggered reveal: 4th → 3rd → 2nd → 1st (reversed order, ~1s between each)
const REVEAL_DELAYS = { 1: 3.6, 2: 2.4, 3: 1.2, 4: 0 };

interface TVPodiumOverlayProps {
  queue: TVCompletedClass[];
  onComplete: (classId: string) => void;
  soundEnabled?: boolean;
}

export function TVPodiumOverlay({ queue, onComplete, soundEnabled }: TVPodiumOverlayProps) {
  const current = queue[0];

  const handleComplete = useCallback(() => {
    if (current) {
      onComplete(current.id);
    }
  }, [current, onComplete]);

  // Auto-dismiss after 20 seconds
  useEffect(() => {
    if (!current) return;

    const timer = setTimeout(handleComplete, DISPLAY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [current, handleComplete]);

  // Play chime on mount if enabled
  useEffect(() => {
    if (!current || !soundEnabled) return;

    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 523.25; // C5
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      osc.start();
      osc.stop(ctx.currentTime + 1.5);
    } catch {
      // Web Audio not available — silently skip
    }
  }, [current, soundEnabled]);

  if (!current) return null;

  // Sort placements for podium order: 2nd, 1st, 3rd, 4th
  const sorted = [...current.placements].sort((a, b) => {
    const order = [2, 1, 3, 4];
    return order.indexOf(a.placement) - order.indexOf(b.placement);
  });

  return (
    <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col items-center justify-center">
      <TVConfetti />

      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-xs text-zinc-500 uppercase tracking-[0.2em]">Final Results</div>
        <div className="text-2xl font-bold text-zinc-100 mt-1">{current.name}</div>
        <div className="text-sm text-zinc-600 mt-1">
          Judge: {current.judgeName} • {current.totalEntries} entries
        </div>
      </div>

      {/* Podium */}
      <div className="flex items-end justify-center gap-6 px-10">
        {sorted.map((p) => (
          <TVPodiumCard
            key={p.placement}
            placement={p}
            animationDelay={REVEAL_DELAYS[p.placement as keyof typeof REVEAL_DELAYS] ?? 0}
            showShimmer={p.placement === 1}
          />
        ))}
      </div>

      {/* Stats */}
      <div className="text-center mt-6 text-xs text-zinc-600 tracking-wider">
        {current.totalEntries} entries &nbsp;•&nbsp; {current.qualifiedCount} qualified
        {current.fastestTime != null && <> &nbsp;•&nbsp; Fastest time: {current.fastestTime.toFixed(1)}s</>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/TVPodiumOverlay.test.tsx 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/TVDisplay/TVPodiumOverlay.tsx apps/myk9show/src/pages/TVDisplay/__tests__/TVPodiumOverlay.test.tsx
git commit -m "feat(tv): add TVPodiumOverlay with staggered reveal, confetti, and sound"
```

---

### Task 10: Mobile Components

**Files:**

- Create: `apps/myk9show/src/pages/TVDisplay/TVMobileClassCard.tsx`
- Create: `apps/myk9show/src/pages/TVDisplay/TVMobileResults.tsx`
- Create: `apps/myk9show/src/pages/TVDisplay/TVMobileList.tsx`
- Test: `apps/myk9show/src/pages/TVDisplay/__tests__/TVMobileList.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/TVDisplay/__tests__/TVMobileList.test.tsx
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { TVMobileList } from '../TVMobileList';
import type { TVClass, TVCompletedClass } from '../types';

const mockClass: TVClass = {
  id: 'c1', name: 'Novice A', element: null, level: null, status: 'In Progress',
  judgeName: 'Smith', totalEntries: 10, scoredCount: 3, startTime: null,
  trialDate: null, trialNumber: null,
  entries: [
    { id: 'e1', armband: '42', handler: 'J. Martinez', runOrder: 1, isInRing: true, isScored: false,
      dog: { name: 'Luna', callName: 'Luna', breed: 'Lab', imageUrl: null } },
  ],
};

const mockCompleted: TVCompletedClass = {
  id: 'c2', name: 'Advanced', element: null, level: null, judgeName: 'Lee',
  totalEntries: 15, qualifiedCount: 12, fastestTime: 30.0,
  placements: [
    { placement: 1, armband: '10', handler: 'A. Smith', searchTime: 30.0, totalScore: null,
      dog: { name: 'Scout', callName: 'Scout', breed: 'GSD', imageUrl: null } },
  ],
};

describe('TVMobileList', () => {
  it('renders active classes', () => {
    render(<TVMobileList classes={[mockClass]} completedClasses={[]} />);
    expect(screen.getByText('Novice A')).toBeInTheDocument();
    expect(screen.getByText('IN RING')).toBeInTheDocument();
    expect(screen.getByText(/#42 Luna/)).toBeInTheDocument();
  });

  it('renders completed classes with inline results', () => {
    render(<TVMobileList classes={[]} completedClasses={[mockCompleted]} />);
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText(/Scout/)).toBeInTheDocument();
  });

  it('shows active classes before completed classes', () => {
    const { container } = render(
      <TVMobileList classes={[mockClass]} completedClasses={[mockCompleted]} />
    );
    const headings = container.querySelectorAll('[data-testid]');
    // Active should come first in DOM order
    const allText = container.textContent ?? '';
    expect(allText.indexOf('Novice A')).toBeLessThan(allText.indexOf('Advanced'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/TVMobileList.test.tsx 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Implement TVMobileClassCard**

```typescript
// apps/myk9show/src/pages/TVDisplay/TVMobileClassCard.tsx
import { cn } from '@/lib/utils';
import { TV_STATUS_CONFIG, TVClass, TVEntry } from './types';

interface TVMobileClassCardProps {
  tvClass: TVClass;
}

function getStatusBadge(status: string | null) {
  const config = TV_STATUS_CONFIG[status as keyof typeof TV_STATUS_CONFIG];
  return config ?? { label: status ?? 'UNKNOWN', color: 'bg-zinc-600 text-zinc-200' };
}

function MobileEntry({ entry, isInRing, isNext }: { entry: TVEntry; isInRing: boolean; isNext: boolean }) {
  const displayName = entry.dog?.callName ?? entry.dog?.name ?? 'Unknown';

  if (isInRing) {
    return (
      <div className="bg-blue-950 border border-blue-600 rounded px-2.5 py-1.5 mb-1">
        <span className="text-blue-400 text-[9px] font-semibold">IN RING</span>
        <span className="text-white text-sm font-semibold ml-1.5">#{entry.armband} {displayName}</span>
        {entry.handler && <span className="text-zinc-400 text-xs"> — {entry.handler}</span>}
      </div>
    );
  }

  return (
    <div className="px-2.5 py-0.5 text-xs text-zinc-500">
      {isNext && <span className="text-amber-500 text-[9px] font-semibold mr-1">NEXT</span>}
      #{entry.armband} {displayName}
      {entry.handler && <span className="text-zinc-600"> — {entry.handler}</span>}
    </div>
  );
}

export function TVMobileClassCard({ tvClass }: TVMobileClassCardProps) {
  const { label, color } = getStatusBadge(tvClass.status);
  const inRingEntry = tvClass.entries.find((e) => e.isInRing);
  const pendingEntries = tvClass.entries.filter((e) => !e.isInRing && !e.isScored).slice(0, 3);

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-700 mx-2 mb-2">
      <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-800">
        <div>
          <span className="font-semibold text-zinc-100 text-sm">{tvClass.name}</span>
          {tvClass.judgeName && <span className="text-zinc-600 text-[11px] ml-1.5">Judge: {tvClass.judgeName}</span>}
        </div>
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-semibold', color)}>{label}</span>
      </div>
      <div className="p-2">
        {inRingEntry && <MobileEntry entry={inRingEntry} isInRing isNext={false} />}
        {pendingEntries.map((e, i) => (
          <MobileEntry key={e.id} entry={e} isInRing={false} isNext={i === 0} />
        ))}
        {tvClass.totalEntries != null && tvClass.scoredCount != null && (
          <div className="px-2.5 pt-1 pb-1 text-[11px] text-zinc-600">
            {tvClass.scoredCount} of {tvClass.totalEntries} scored
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement TVMobileResults**

```typescript
// apps/myk9show/src/pages/TVDisplay/TVMobileResults.tsx
import { cn } from '@/lib/utils';
import type { TVCompletedClass } from './types';

const MEDAL_EMOJI: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
const MEDAL_BORDER: Record<number, string> = { 1: 'border-amber-800', 2: 'border-zinc-700', 3: 'border-zinc-700', 4: 'border-zinc-700' };

interface TVMobileResultsProps {
  completedClass: TVCompletedClass;
}

export function TVMobileResults({ completedClass }: TVMobileResultsProps) {
  return (
    <div className="bg-zinc-900 rounded-lg border border-amber-900/50 mx-2 mb-2">
      <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-800">
        <span className="font-semibold text-zinc-100 text-sm">{completedClass.name}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-300 font-semibold">COMPLETED</span>
      </div>
      <div className="p-2 grid grid-cols-2 gap-1.5">
        {completedClass.placements.map((p) => {
          const displayName = p.dog?.callName ?? p.dog?.name ?? 'Unknown';
          const displayTime = p.searchTime != null ? `${p.searchTime.toFixed(1)}s` : p.totalScore != null ? `${p.totalScore}` : '';
          return (
            <div
              key={p.placement}
              className={cn('bg-zinc-950 border rounded px-2 py-1.5 text-[11px]', MEDAL_BORDER[p.placement] ?? 'border-zinc-700')}
            >
              <span>{MEDAL_EMOJI[p.placement] ?? `${p.placement}th`}</span>
              <span className="text-zinc-100 font-semibold ml-1">#{p.armband} {displayName}</span>
              <br />
              <span className="text-zinc-500">{p.handler}{displayTime && ` • ${displayTime}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement TVMobileList**

```typescript
// apps/myk9show/src/pages/TVDisplay/TVMobileList.tsx
import { TVMobileClassCard } from './TVMobileClassCard';
import { TVMobileResults } from './TVMobileResults';
import type { TVClass, TVCompletedClass } from './types';

interface TVMobileListProps {
  classes: TVClass[];
  completedClasses: TVCompletedClass[];
}

export function TVMobileList({ classes, completedClasses }: TVMobileListProps) {
  if (classes.length === 0 && completedClasses.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-zinc-500 text-sm">
        No classes currently in progress
      </div>
    );
  }

  return (
    <div className="pb-4 pt-2">
      {classes.map((c) => (
        <TVMobileClassCard key={c.id} tvClass={c} />
      ))}
      {completedClasses.map((c) => (
        <TVMobileResults key={c.id} completedClass={c} />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/TVMobileList.test.tsx 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/TVDisplay/TVMobileClassCard.tsx apps/myk9show/src/pages/TVDisplay/TVMobileResults.tsx apps/myk9show/src/pages/TVDisplay/TVMobileList.tsx apps/myk9show/src/pages/TVDisplay/__tests__/TVMobileList.test.tsx
git commit -m "feat(tv): add mobile layout components — class cards, inline results, scrollable list"
```

---

### Task 11: TVSoundToggle Component

**Files:**

- Create: `apps/myk9show/src/pages/TVDisplay/TVSoundToggle.tsx`

- [ ] **Step 1: Implement TVSoundToggle**

```typescript
// apps/myk9show/src/pages/TVDisplay/TVSoundToggle.tsx
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TVSoundToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function TVSoundToggle({ enabled, onToggle }: TVSoundToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        enabled ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-400'
      )}
      title={enabled ? 'Sound on' : 'Sound off'}
      aria-label={enabled ? 'Disable sound' : 'Enable sound'}
    >
      {enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
    </button>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/myk9show && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/TVDisplay/TVSoundToggle.tsx
git commit -m "feat(tv): add TVSoundToggle component"
```

---

### Task 12: TVDisplay Main Page

**Files:**

- Create: `apps/myk9show/src/pages/TVDisplay/index.tsx`
- Test: `apps/myk9show/src/pages/TVDisplay/__tests__/TVDisplay.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/TVDisplay/__tests__/TVDisplay.test.tsx
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import TVDisplay from '../index';
import { useTVData } from '../useTVData';
import { useTVResults } from '../useTVResults';
import { useTVRealtime } from '../useTVRealtime';

vi.mock('../useTVData');
vi.mock('../useTVResults');
vi.mock('../useTVRealtime');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ showId: 'show-1' }), useSearchParams: () => [new URLSearchParams()] };
});

const mockShow = { id: 'show-1', name: 'Spring Trial 2026', startDate: '2026-04-01', endDate: '2026-04-02' };

describe('TVDisplay', () => {
  beforeEach(() => {
    vi.mocked(useTVRealtime).mockReturnValue({ isConnected: true });
  });

  it('renders show name in header', () => {
    vi.mocked(useTVData).mockReturnValue({ show: mockShow, classes: [], isLoading: false, error: null });
    vi.mocked(useTVResults).mockReturnValue({ completedClasses: [], isLoading: false });

    render(<TVDisplay />);
    expect(screen.getByText('Spring Trial 2026')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    vi.mocked(useTVData).mockReturnValue({ show: null, classes: [], isLoading: true, error: null });
    vi.mocked(useTVResults).mockReturnValue({ completedClasses: [], isLoading: true });

    render(<TVDisplay />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows error state when show not found', () => {
    vi.mocked(useTVData).mockReturnValue({ show: null, classes: [], isLoading: false, error: null });
    vi.mocked(useTVResults).mockReturnValue({ completedClasses: [], isLoading: false });

    render(<TVDisplay />);
    expect(screen.getByText(/show not found/i)).toBeInTheDocument();
  });

  it('renders live indicator when connected', () => {
    vi.mocked(useTVData).mockReturnValue({ show: mockShow, classes: [], isLoading: false, error: null });
    vi.mocked(useTVResults).mockReturnValue({ completedClasses: [], isLoading: false });

    render(<TVDisplay />);
    expect(screen.getByText(/live/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/TVDisplay.test.tsx 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Implement TVDisplay page**

```typescript
// apps/myk9show/src/pages/TVDisplay/index.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize, Minimize } from 'lucide-react';
import { useTVData } from './useTVData';
import { useTVResults } from './useTVResults';
import { useTVRealtime } from './useTVRealtime';
import { TVGrid } from './TVGrid';
import { TVPodiumOverlay } from './TVPodiumOverlay';
import { TVMobileList } from './TVMobileList';
import { TVSoundToggle } from './TVSoundToggle';
import type { TVCompletedClass } from './types';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export default function TVDisplay() {
  const { showId } = useParams<{ showId: string }>();
  const [searchParams] = useSearchParams();
  const trialId = searchParams.get('trial') ?? undefined;

  const { show, classes, isLoading, error } = useTVData(showId ?? '', trialId);
  const { completedClasses } = useTVResults(showId ?? '', trialId);
  const { isConnected } = useTVRealtime(showId ?? '');

  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [podiumQueue, setPodiumQueue] = useState<TVCompletedClass[]>([]);
  const [shownPodiums, setShownPodiums] = useState<Set<string>>(new Set());
  const [highlightedClassId, setHighlightedClassId] = useState<string | null>(null);
  const prevClassesRef = useRef<string>('');

  // Detect newly completed classes and queue podium takeover
  useEffect(() => {
    for (const completed of completedClasses) {
      if (!shownPodiums.has(completed.id)) {
        setPodiumQueue((prev) => {
          if (prev.some((p) => p.id === completed.id)) return prev;
          return [...prev, completed];
        });
      }
    }
  }, [completedClasses, shownPodiums]);

  // Detect class card updates for highlight animation
  useEffect(() => {
    const key = classes.map((c) => `${c.id}:${c.scoredCount}`).join(',');
    if (prevClassesRef.current && prevClassesRef.current !== key) {
      // Find which class changed
      const prevMap = new Map(prevClassesRef.current.split(',').map((s) => {
        const [id, count] = s.split(':');
        return [id, count];
      }));
      for (const c of classes) {
        if (prevMap.get(c.id) !== String(c.scoredCount)) {
          setHighlightedClassId(c.id);
          setTimeout(() => setHighlightedClassId(null), 1200);
          break;
        }
      }
    }
    prevClassesRef.current = key;
  }, [classes]);

  const handlePodiumComplete = useCallback((classId: string) => {
    setShownPodiums((prev) => new Set(prev).add(classId));
    setPodiumQueue((prev) => prev.filter((p) => p.id !== classId));
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    }
  }, []);

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-lg">Loading TV display...</div>
      </div>
    );
  }

  // Show not found
  if (!show) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-lg">Show not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Podium overlay */}
      {isDesktop && podiumQueue.length > 0 && (
        <TVPodiumOverlay queue={podiumQueue} onComplete={handlePodiumComplete} soundEnabled={soundEnabled} />
      )}

      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">{show.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-zinc-500">
              {isConnected ? 'Live' : 'Reconnecting...'}
              {classes.length > 0 && ` • ${classes.length} class${classes.length !== 1 ? 'es' : ''} active`}
            </span>
          </div>
          <TVSoundToggle enabled={soundEnabled} onToggle={() => setSoundEnabled((s) => !s)} />
          {isDesktop && (
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      {isDesktop ? (
        <TVGrid classes={classes} highlightedClassId={highlightedClassId} />
      ) : (
        <TVMobileList classes={classes} completedClasses={completedClasses} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/TVDisplay.test.tsx 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/TVDisplay/index.tsx apps/myk9show/src/pages/TVDisplay/__tests__/TVDisplay.test.tsx
git commit -m "feat(tv): add TVDisplay main page with responsive layout and podium queue"
```

---

### Task 13: Route Registration

**Files:**

- Modify: `apps/myk9show/src/routes/publicRoutes.tsx`
- Modify: `apps/myk9show/src/routes/routeRegistry.ts`

- [ ] **Step 1: Add lazy import and route to publicRoutes.tsx**

Add at the top with other lazy imports:

```typescript
const TVDisplay = lazy(() => import('@/pages/TVDisplay'));
```

Add the route inside the `<Routes>` block (or wherever public routes are defined):

```typescript
<Route
  path="/tv/:showId"
  element={
    <SuspenseWrapper>
      <PageTransition>
        <TVDisplay />
      </PageTransition>
    </SuspenseWrapper>
  }
/>
```

- [ ] **Step 2: Register in routeRegistry.ts**

Add to the `publicRouteComponents` object:

```typescript
'/tv/:showId': () => import('@/pages/TVDisplay'),
```

- [ ] **Step 3: Verify dev server loads the route**

Run: `cd apps/myk9show && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/routes/publicRoutes.tsx apps/myk9show/src/routes/routeRegistry.ts
git commit -m "feat(tv): register /tv/:showId public route"
```

---

### Task 14: Secretary Dashboard QR Code

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx` (ShowManagementPage was deleted in PR #314)

- [ ] **Step 1: Add TV Display section with QR code**

Import QRCode and add a section to `ShowWorkbenchPage` (or a new `TvDisplayCard` in the Setup tab tools). The QR code links to `/tv/${showId}`.

Add to imports:

```typescript
import { QRCodeSVG } from 'qrcode.react';
import { Tv, Copy, Check } from 'lucide-react';
```

Add a new card/section in the page (adapt to the existing layout pattern):

```typescript
function TVDisplaySection({ showId }: { showId: string }) {
  const [copied, setCopied] = useState(false);
  const tvUrl = `${window.location.origin}/tv/${showId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(tvUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Tv className="h-4 w-4" />
          TV Display
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <QRCodeSVG value={tvUrl} size={160} level="H" includeMargin />
        <p className="text-sm text-muted-foreground text-center">
          Scan or share this link to show live run order on a venue TV or phone.
        </p>
        <div className="flex items-center gap-2 w-full">
          <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded truncate">{tvUrl}</code>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <Button variant="outline" size="sm" asChild className="w-full">
          <Link to={`/tv/${showId}`} target="_blank">
            Open TV Display
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
```

Add `<TVDisplaySection showId={showId} />` to the appropriate location in the page layout.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/myk9show && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx
git commit -m "feat(tv): add QR code and TV display link to secretary workbench"
```

---

### Task 15: Integration Test & Final Verification

**Files:**

- All TVDisplay files

- [ ] **Step 1: Run all TV display tests**

Run: `cd apps/myk9show && npx vitest run src/pages/TVDisplay/__tests__/ 2>&1 | tail -30`
Expected: All tests PASS.

- [ ] **Step 2: Run full typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit --pretty 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 3: Run lint**

Run: `cd apps/myk9show && npx eslint src/pages/TVDisplay/ --ext .ts,.tsx 2>&1 | tail -20`
Expected: No errors (or only pre-existing ones).

- [ ] **Step 4: Run full test suite**

Run: `cd apps/myk9show && pnpm test 2>&1 | tail -20`
Expected: All existing tests still pass, plus new TV tests.

- [ ] **Step 5: Verify dev server renders the page**

Run: `cd apps/myk9show && pnpm dev &` then navigate to `http://localhost:5173/tv/any-show-id`. Verify:

- Dark background renders
- "Show not found" message appears (expected with fake ID)
- No console errors

- [ ] **Step 6: Final commit (if any lint/type fixes needed)**

```bash
git add -A
git commit -m "fix(tv): address lint and type issues from integration testing"
```
