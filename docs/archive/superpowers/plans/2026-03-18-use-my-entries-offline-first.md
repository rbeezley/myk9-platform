# useMyEntries Offline-First Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `useMyEntries` to read from local Zustand stores instead of querying Supabase directly, so entries created during registration appear immediately.

**Architecture:** Replace the Supabase query + React Query wrapper with a synchronous read from `useEntryStore` (entries), `useClassStoreCompat` (class names), and `useDogStoreCompat` (dog names). Filter by role: exhibitors see only entries for their own dogs; admins/secretaries/club_admins see all.

**Tech Stack:** React hooks, Zustand, useMemo, vitest

**Spec:** `docs/superpowers/specs/2026-03-18-use-my-entries-offline-first-design.md`

---

## File Map

| File                                                | Action  | Responsibility                                                              |
| --------------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| `apps/myk9show/src/hooks/useMyEntries.ts`           | Rewrite | Hook: read entries from local stores, filter by role, derive display fields |
| `apps/myk9show/src/test/hooks/useMyEntries.test.ts` | Rewrite | Tests: mock Zustand stores + auth context, verify filtering and derivation  |

---

### Task 1: Write failing tests for the new hook behavior

**Files:**

- Rewrite: `apps/myk9show/src/test/hooks/useMyEntries.test.ts`

- [ ] **Step 1: Rewrite the test file with store mocks**

Replace the Supabase/React Query mocks with Zustand store mocks and auth context mocks. The test no longer needs `QueryClientProvider` since there's no React Query usage.

```typescript
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMyEntries } from '@/hooks/useMyEntries';
import type { SyncableShowEntry } from '@/store/entry-store-types';

// --- Mock stores ---

const mockEntries: SyncableShowEntry[] = [];
const mockClasses: Array<{ id: string; className?: string }> = [];
const mockDogs: Array<{ id: string; callName?: string; name: string; ownerId: string }> = [];
let mockIsLoading = false;
let mockError: string | null = null;

// Auth mock state
let mockAuthState = {
  userWithRoles: {
    databaseUserId: 'person-1',
    roles: [{ name: 'exhibitor' }],
  } as Record<string, unknown>,
  isAdmin: false,
  isSecretary: false,
  hasRole: (role: string) => role === 'exhibitor',
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthState,
}));

vi.mock('@/store/entryStore', () => ({
  useEntryStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      entries: mockEntries,
      isLoading: mockIsLoading,
      error: mockError,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: mockClasses }),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: mockDogs }),
}));

// --- Helpers ---

function makeEntry(
  overrides: Partial<SyncableShowEntry> & {
    id: string;
    showId: string;
    classId: string;
    dogId: string;
  }
): SyncableShowEntry {
  return {
    status: 'confirmed' as const,
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: '',
      entryFee: 0,
      paymentStatus: 'pending' as const,
      ...overrides.registrationData,
    },
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced' as const,
    ...overrides,
  } as SyncableShowEntry;
}

// --- Tests ---

describe('useMyEntries', () => {
  beforeEach(() => {
    mockEntries.length = 0;
    mockClasses.length = 0;
    mockDogs.length = 0;
    mockIsLoading = false;
    mockError = null;
    mockAuthState = {
      userWithRoles: {
        databaseUserId: 'person-1',
        roles: [{ name: 'exhibitor' }],
      },
      isAdmin: false,
      isSecretary: false,
      hasRole: (role: string) => role === 'exhibitor',
    };
  });

  it('returns empty results when showId is undefined', () => {
    const { result } = renderHook(() => useMyEntries(undefined));
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.entriesByClass).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('returns entries for exhibitor filtered by dog ownership', () => {
    mockDogs.push({ id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'person-1' });
    mockClasses.push({ id: 'c1', className: 'Novice JWW' });
    mockEntries.push(
      makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }),
      makeEntry({ id: 'e2', showId: 'show-1', classId: 'c1', dogId: 'd-other' })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    // Exhibitor only sees entry for their dog (d1), not d-other
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].id).toBe('e1');
    expect(result.current.entriesByClass[0].dogName).toBe('Bella');
    expect(result.current.entriesByClass[0].className).toBe('Novice JWW');
  });

  it('returns all entries for site admin regardless of dog ownership', () => {
    mockAuthState = {
      userWithRoles: { databaseUserId: 'admin-1', roles: [{ name: 'site_admin' }] },
      isAdmin: true,
      isSecretary: false,
      hasRole: (role: string) => role === 'site_admin',
    };
    mockDogs.push({ id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'someone-else' });
    mockClasses.push({ id: 'c1', className: 'Novice JWW' });
    mockEntries.push(
      makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }),
      makeEntry({ id: 'e2', showId: 'show-1', classId: 'c1', dogId: 'd2' })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(2);
  });

  it('returns all entries for secretary', () => {
    mockAuthState = {
      userWithRoles: { databaseUserId: 'sec-1', roles: [{ name: 'secretary' }] },
      isAdmin: false,
      isSecretary: true,
      hasRole: (role: string) => role === 'secretary',
    };
    mockEntries.push(makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }));
    mockClasses.push({ id: 'c1', className: 'Open Standard' });

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(1);
  });

  it('returns all entries for club_admin', () => {
    mockAuthState = {
      userWithRoles: { databaseUserId: 'ca-1', roles: [{ name: 'club_admin' }] },
      isAdmin: false,
      isSecretary: false,
      hasRole: (role: string) => role === 'club_admin',
    };
    mockEntries.push(makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }));
    mockClasses.push({ id: 'c1', className: 'Open Standard' });

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(1);
  });

  it('computes dogsAhead from entries in the same class', () => {
    mockAuthState = {
      ...mockAuthState,
      isAdmin: true,
    };
    mockClasses.push({ id: 'c1', className: 'Novice JWW' });
    mockDogs.push({ id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'person-1' });
    // 3 entries: run orders 1 (scored), 3 (not scored), 5 (our dog, not scored)
    mockEntries.push(
      makeEntry({
        id: 'e1',
        showId: 'show-1',
        classId: 'c1',
        dogId: 'd-other1',
        status: 'completed' as const,
        registrationData: {
          submittedAt: '',
          handler: '',
          entryFee: 0,
          paymentStatus: 'pending' as const,
          runOrder: 1,
        },
      }),
      makeEntry({
        id: 'e2',
        showId: 'show-1',
        classId: 'c1',
        dogId: 'd-other2',
        registrationData: {
          submittedAt: '',
          handler: '',
          entryFee: 0,
          paymentStatus: 'pending' as const,
          runOrder: 3,
        },
      }),
      makeEntry({
        id: 'e3',
        showId: 'show-1',
        classId: 'c1',
        dogId: 'd1',
        registrationData: {
          submittedAt: '',
          handler: '',
          entryFee: 0,
          paymentStatus: 'pending' as const,
          runOrder: 5,
        },
      })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    // For entry e3 (runOrder 5): entries ahead with lower runOrder that are NOT scored
    // e1 (runOrder 1, scored) — doesn't count
    // e2 (runOrder 3, not scored) — counts
    // dogsAhead = 1
    const e3 = result.current.entriesByClass.find(e => e.runOrder === 5);
    expect(e3?.dogsAhead).toBe(1);
  });

  it('marks entry as scored when status is completed', () => {
    mockAuthState = { ...mockAuthState, isAdmin: true };
    mockClasses.push({ id: 'c1', className: 'Novice JWW' });
    mockEntries.push(
      makeEntry({
        id: 'e1',
        showId: 'show-1',
        classId: 'c1',
        dogId: 'd1',
        status: 'completed' as const,
      })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entriesByClass[0].scored).toBe(true);
  });

  it('marks entry as scored when competitionData exists', () => {
    mockAuthState = { ...mockAuthState, isAdmin: true };
    mockClasses.push({ id: 'c1', className: 'Novice JWW' });
    mockEntries.push(
      makeEntry({
        id: 'e1',
        showId: 'show-1',
        classId: 'c1',
        dogId: 'd1',
        competitionData: { recordedBy: 'judge-1', recordedAt: new Date().toISOString() },
      })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entriesByClass[0].scored).toBe(true);
  });

  it('falls back to Unknown Class/Dog when stores have no data', () => {
    mockAuthState = { ...mockAuthState, isAdmin: true };
    // No classes or dogs in stores
    mockEntries.push(
      makeEntry({ id: 'e1', showId: 'show-1', classId: 'c-missing', dogId: 'd-missing' })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entriesByClass[0].className).toBe('Unknown Class');
    expect(result.current.entriesByClass[0].dogName).toBe('Unknown Dog');
  });

  it('reports isError when entry store has an error', () => {
    mockError = 'IndexedDB failed';
    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.isError).toBe(true);
  });

  it('reports isLoading from entry store', () => {
    mockIsLoading = true;
    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.isLoading).toBe(true);
  });

  // [ADDED] Multi-dog exhibitor test
  it('returns entries for all dogs owned by the exhibitor', () => {
    mockDogs.push(
      { id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'person-1' },
      { id: 'd2', callName: 'Max', name: 'Max', ownerId: 'person-1' }
    );
    mockClasses.push(
      { id: 'c1', className: 'Novice JWW' },
      { id: 'c2', className: 'Open Standard' }
    );
    mockEntries.push(
      makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }),
      makeEntry({ id: 'e2', showId: 'show-1', classId: 'c2', dogId: 'd2' }),
      makeEntry({ id: 'e3', showId: 'show-1', classId: 'c1', dogId: 'd-other' })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(2);
    const dogNames = result.current.entriesByClass.map(e => e.dogName).sort();
    expect(dogNames).toEqual(['Bella', 'Max']);
  });

  it('returns empty results when exhibitor databaseUserId is undefined', () => {
    mockAuthState = {
      userWithRoles: { databaseUserId: undefined, roles: [{ name: 'exhibitor' }] },
      isAdmin: false,
      isSecretary: false,
      hasRole: (role: string) => role === 'exhibitor',
    };
    mockDogs.push({ id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'person-1' });
    mockEntries.push(makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }));

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm test -- --run src/test/hooks/useMyEntries.test.ts`

Expected: All tests FAIL because `useMyEntries` still imports Supabase/React Query and doesn't use the mocked stores.

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/myk9show/src/test/hooks/useMyEntries.test.ts
git commit -m "test(entries): rewrite useMyEntries tests for offline-first store-based hook"
```

---

### Task 2: Rewrite useMyEntries to read from local stores

**Files:**

- Rewrite: `apps/myk9show/src/hooks/useMyEntries.ts`

- [ ] **Step 1: Rewrite the hook**

```typescript
import { useMemo } from 'react';
import { useEntryStore } from '@/store/entryStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { SyncableShowEntry } from '@/store/entry-store-types';

interface MyEntryByClass {
  classId: string;
  className: string;
  dogName: string;
  armband: string;
  runOrder: number;
  dogsAhead: number;
  scored: boolean;
}

export interface UseMyEntriesResult {
  entries: Array<{ id: string; showId: string }>;
  entriesByClass: MyEntryByClass[];
  isLoading: boolean;
  isError: boolean;
}

const EMPTY_RESULT: UseMyEntriesResult = {
  entries: [],
  entriesByClass: [],
  isLoading: false,
  isError: false,
};

function isScored(entry: Pick<SyncableShowEntry, 'status' | 'competitionData'>): boolean {
  return entry.status === 'completed' || !!entry.competitionData;
}

export function useMyEntries(showId: string | undefined): UseMyEntriesResult {
  const { userWithRoles, isAdmin, isSecretary, hasRole } = useAuthContext();
  // Use a selector so the component re-renders when entries change
  const storeEntries = useEntryStore(s => s.entries);
  const isLoading = useEntryStore(s => s.isLoading);
  const error = useEntryStore(s => s.error);
  const { classes } = useClassStoreCompat();
  const { dogs } = useDogStoreCompat();

  const databaseUserId = userWithRoles?.databaseUserId;
  const canSeeAll = isAdmin || isSecretary || hasRole('club_admin');

  return useMemo(() => {
    if (!showId) return EMPTY_RESULT;

    // Get ALL entries for the show (needed for dogsAhead computation)
    const allShowEntries = storeEntries.filter(e => e.showId === showId);

    // Build lookup maps
    const classMap = new Map(classes.map(c => [c.id, c.className || '']));
    const dogMap = new Map(
      dogs.map(d => [d.id, { callName: d.callName, name: d.name, ownerId: d.ownerId }])
    );

    // Role-based filtering
    let filteredEntries = allShowEntries;
    if (!canSeeAll) {
      if (!databaseUserId) {
        return { ...EMPTY_RESULT, isLoading, isError: !!error };
      }
      const myDogIds = new Set(dogs.filter(d => d.ownerId === databaseUserId).map(d => d.id));
      filteredEntries = allShowEntries.filter(e => myDogIds.has(e.dogId));
    }

    // Build entries list
    const entries = filteredEntries.map(e => ({ id: e.id, showId: e.showId }));

    // Build enriched per-class data
    const entriesByClass: MyEntryByClass[] = filteredEntries.map(entry => {
      const runOrder = entry.registrationData.runOrder ?? 0;

      // dogsAhead: count entries in same class with lower runOrder that are not scored
      const dogsAhead =
        runOrder > 0
          ? allShowEntries.filter(
              e =>
                e.classId === entry.classId &&
                (e.registrationData.runOrder ?? 0) > 0 &&
                (e.registrationData.runOrder ?? 0) < runOrder &&
                !isScored(e)
            ).length
          : 0;

      const dogInfo = dogMap.get(entry.dogId);

      return {
        classId: entry.classId,
        className: classMap.get(entry.classId) || 'Unknown Class',
        dogName: dogInfo?.callName || dogInfo?.name || 'Unknown Dog',
        armband: entry.registrationData.armband ?? '',
        runOrder,
        dogsAhead,
        scored: isScored(entry),
      };
    });

    return {
      entries,
      entriesByClass,
      isLoading,
      isError: !!error,
    };
  }, [showId, storeEntries, classes, dogs, canSeeAll, databaseUserId, isLoading, error]);
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm test -- --run src/test/hooks/useMyEntries.test.ts`

Expected: All tests PASS.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/useMyEntries.ts
git commit -m "fix(entries): rewrite useMyEntries to read from local stores (offline-first)

useMyEntries was querying Supabase directly, so entries created via the
registration wizard (stored locally via replication layer) never appeared
in the My Entries tab. Now reads from Zustand entry store, class store,
and dog store. Filters by dog ownership for exhibitors; admins/secretaries
see all entries."
```

---

### Task 3: Verify no regressions in consumers

**Files:**

- Read-only check: `apps/myk9show/src/components/shows/tabs/MyEntriesTab.tsx`
- Read-only check: `apps/myk9show/src/pages/ShowDetailsPage.tsx`

- [ ] **Step 1: Run the full myK9Show test suite**

Run: `cd apps/myk9show && pnpm test -- --run`

Expected: All tests pass. If any tests in other files imported `useMyEntries` and relied on the Supabase mock, they will need updating.

- [ ] **Step 2: Run typecheck across the monorepo**

Run: `pnpm typecheck`

Expected: Zero errors.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

Expected: Clean. The old imports (`@tanstack/react-query`, `@/lib/supabase`, `@/lib/queryClient`) are removed, so no unused-import warnings.
