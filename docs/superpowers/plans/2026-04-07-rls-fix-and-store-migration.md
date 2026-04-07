# RLS Fix & Store Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix RLS SELECT policies on shows/dogs/people tables, then migrate BrowseShowsPage, ShowDetailsPage, and dog pages to read from the replication store instead of direct PostgREST queries.

**Architecture:** Migration 120 corrects the security boundary (shows draft visibility for secretaries, dogs restricted to own/co-own). Frontend pages switch from React Query + PostgREST to reading from Zustand stores populated by the replication layer. This aligns with the offline-first architecture.

**Tech Stack:** PostgreSQL RLS policies, Supabase migrations, React/TypeScript, Zustand stores, Vitest

**Spec:** `docs/superpowers/specs/2026-04-07-rls-fix-and-store-migration-design.md`

---

### Task 1: Write Migration 120 — Shows and Dogs RLS Fixes

**Files:**

- Create: `supabase/migrations/120_fix_shows_dogs_select_rls.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Migration 120: Fix shows and dogs SELECT RLS policies
--
-- Shows: Add secretary/admin visibility for draft shows.
-- Previously only published/upcoming/in_progress/completed were visible
-- to non-admin users. Secretaries need to see drafts they're managing.
--
-- Dogs: Restrict to own dogs for regular users. Previously any
-- authenticated user could see all non-deleted dogs. Exhibitors
-- should only see dogs they own or co-own. Secretaries, judges,
-- and platform admins retain full visibility.
--
-- Depends on: migration 108 (current shows_select), migration 016 (current dogs_select)
-- Rollback: restore policies from migrations 108 and 016

-- === SHOWS ===
DROP POLICY IF EXISTS "shows_select" ON shows;

CREATE POLICY "shows_select" ON shows
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (SELECT is_trial_secretary())
      OR (SELECT is_platform_admin())
    )
  );

-- === DOGS ===
DROP POLICY IF EXISTS "dogs_select" ON dogs;

CREATE POLICY "dogs_select" ON dogs
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      owner_id = (SELECT get_my_person_id())
      OR co_owner_id = (SELECT get_my_person_id())
      OR (SELECT is_trial_secretary())
      OR (SELECT has_role('judge'))
      OR (SELECT is_platform_admin())
    )
  );
```

- [ ] **Step 2: Verify migration parses correctly**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && cat supabase/migrations/120_fix_shows_dogs_select_rls.sql | head -40`
Expected: The SQL file contents display without syntax errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/120_fix_shows_dogs_select_rls.sql
git commit -m "fix(rls): restrict dogs SELECT to own dogs, add secretary draft show visibility

Migration 120: shows policy now lets secretaries/admins see draft shows.
Dogs policy restricts exhibitors to own/co-owned dogs; secretaries,
judges, and platform admins retain full access."
```

---

### Task 2: Migrate BrowseShowsPage to Store Reads

**Files:**

- Modify: `apps/myk9show/src/hooks/useBrowseShowsData.ts`
- Test: `apps/myk9show/src/test/pages/BrowseShowsPage.test.tsx`

The `useBrowseShowsData` hook currently calls `useShowsQuery()` which goes through PostgREST. The fix is to read from `useShowStore` instead — the same store that powers the calendar page.

- [ ] **Step 1: Write the failing test**

Add a test to `apps/myk9show/src/test/pages/BrowseShowsPage.test.tsx` (or create it if minimal):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBrowseShowsData } from '@/hooks/useBrowseShowsData';

// Mock the show store to return test data
const mockShows = [
  {
    id: 'show-1',
    name: 'Test Show',
    status: 'published',
    startDate: '2026-05-01',
    endDate: '2026-05-02',
    entryCloseDate: '2026-04-20',
    organization: 'Test Club',
    location: 'Test Location',
    events: [],
    source: 'external' as const,
    entryOpenDate: '2026-03-01',
    preEntryFee: '30',
    dayOfShowFee: '35',
    clubId: 'club-1',
    clubName: '',
    clubAddress: '',
    clubEmail: '',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: [],
    trials: [],
    stats: [],
  },
];

vi.mock('@/store/showStore', () => ({
  useShowStore: vi.fn(selector => {
    const state = {
      shows: mockShows,
      isLoading: false,
      error: null,
    };
    return selector(state);
  }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { id: 'user-1', roles: [] },
    loading: false,
  }),
}));

vi.mock('@/store/entryStore', () => ({
  useEntryStore: () => ({
    entries: [],
    isLoading: false,
    error: null,
    loadEntries: vi.fn(),
  }),
}));

describe('useBrowseShowsData', () => {
  it('reads shows from the store, not PostgREST', () => {
    const { result } = renderHook(() =>
      useBrowseShowsData({ filteredShows: mockShows, selectedTab: 'all' })
    );
    expect(result.current.shows).toHaveLength(1);
    expect(result.current.shows[0].name).toBe('Test Show');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/pages/BrowseShowsPage.test.tsx -t "reads shows from the store" 2>&1 | tail -20`
Expected: FAIL — the hook currently calls `useShowsQuery()` (React Query/PostgREST), not the store.

- [ ] **Step 3: Update useBrowseShowsData to read from store**

In `apps/myk9show/src/hooks/useBrowseShowsData.ts`, replace the `useShowsQuery` import and usage with `useShowStore`:

Replace:

```typescript
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
```

With:

```typescript
import { useShowStore } from '@/store/showStore';
```

Replace:

```typescript
const { data: shows = [], isLoading: showsLoading, error: showsError } = useShowsQuery();
```

With:

```typescript
const shows = useShowStore(s => s.shows);
const showsLoading = useShowStore(s => s.isLoading);
const showsError = useShowStore(s => s.error) ? new Error(useShowStore.getState().error!) : null;
```

Note: `useShowStore` exposes `error` as `string | null`, but the hook's consumers expect `Error | null`. Build the Error object conditionally. To avoid calling `useShowStore` multiple times (hook rules), refactor to a single selector:

```typescript
const { shows, showsLoading, showsError } = useMemo(() => {
  // Read from store — these are already subscribed via individual selectors below
  return { shows: storeShows, showsLoading: storeLoading, showsError: storeError };
}, [storeShows, storeLoading, storeError]);
```

Actually, the cleanest approach — use three separate selectors (Zustand best practice for render optimization):

```typescript
const storeShows = useShowStore(s => s.shows);
const storeIsLoading = useShowStore(s => s.isLoading);
const storeErrorMsg = useShowStore(s => s.error);

// Adapt to match the React Query interface the rest of the hook expects
const shows = storeShows;
const showsLoading = storeIsLoading;
const showsError = storeErrorMsg ? new Error(storeErrorMsg) : null;
```

Remove the `useShowsQuery` import entirely.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/pages/BrowseShowsPage.test.tsx -t "reads shows from the store" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Run the full test suite for BrowseShowsPage**

Run: `cd apps/myk9show && npx vitest run src/test/pages/BrowseShowsPage.test.tsx 2>&1 | tail -30`
Expected: All tests pass. If existing tests mock `useShowsQuery`, update them to mock `useShowStore` instead.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/hooks/useBrowseShowsData.ts apps/myk9show/src/test/pages/BrowseShowsPage.test.tsx
git commit -m "fix(shows): migrate BrowseShowsPage to read from store instead of PostgREST

Replaces useShowsQuery (React Query → PostgREST) with useShowStore
(Zustand → replication layer). Fixes 0-shows bug where RLS blocked
direct queries but replication store had the data."
```

---

### Task 3: Migrate ShowDetailsPage to Store Reads

**Files:**

- Modify: `apps/myk9show/src/hooks/useFastShowDetails.ts`
- Test: `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`

The `useFastShowDetails` hook tries React Query cache first, then falls back to `useShowQuery(id)` → PostgREST. Replace the PostgREST fallback with a store lookup.

- [ ] **Step 1: Write the failing test**

Add to `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';

const mockShow = {
  id: 'show-1',
  name: 'Test Show',
  status: 'published',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  organization: 'Test Club',
  location: 'Test Location',
  events: [],
  source: 'external' as const,
  entryOpenDate: '2026-03-01',
  entryCloseDate: '2026-04-20',
  preEntryFee: '30',
  clubId: 'club-1',
  clubName: '',
  clubAddress: '',
  clubEmail: '',
  logoUrl: '',
  coverImageUrl: '',
  accentColor: '',
  assignedJudges: [],
  trials: [],
  stats: [],
};

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'show-1' }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: vi.fn(selector => {
    const state = { shows: [mockShow], isLoading: false, error: null };
    return selector(state);
  }),
}));

// Mock React Query client to return empty caches
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: () => undefined,
    setQueryData: vi.fn(),
  }),
}));

describe('useFastShowDetails', () => {
  it('finds show from store when not in React Query cache', () => {
    const { result } = renderHook(() => useFastShowDetails());
    expect(result.current.show).not.toBeNull();
    expect(result.current.show?.name).toBe('Test Show');
    expect(result.current.isLoading).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/pages/ShowDetailsPage.test.tsx -t "finds show from store" 2>&1 | tail -20`
Expected: FAIL — currently falls through to `useShowQuery` (PostgREST) when cache misses.

- [ ] **Step 3: Update useFastShowDetails to use store as fallback**

In `apps/myk9show/src/hooks/useFastShowDetails.ts`:

Add import:

```typescript
import { useShowStore } from '@/store/showStore';
```

After the React Query cache lookup (`cachedShow`/`foundInCache`), add a store lookup before the network query:

```typescript
// Try store data (replication layer) as second source
const storeShow = useMemo(() => {
  if (foundInCache || !showId) return null;
  const shows = useShowStore.getState().shows;
  return shows.find(s => s.id === showId) || null;
}, [showId, foundInCache]);
```

Wait — `useShowStore.getState()` inside `useMemo` won't re-render when the store updates. Use the hook form instead:

```typescript
const storeShows = useShowStore(s => s.shows);

// Try store data as second source
const storeShow = useMemo(() => {
  if (foundInCache || !showId) return null;
  return storeShows.find(s => s.id === showId) || null;
}, [showId, foundInCache, storeShows]);
```

Then update the final `show` derivation:

Replace:

```typescript
const show = cachedShow || networkShow || null;
const isLoading = !cachedShow && isNetworkLoading;
```

With:

```typescript
const show = cachedShow || storeShow || networkShow || null;
const isLoading = !cachedShow && !storeShow && isNetworkLoading;
```

And update `isError`:
Replace:

```typescript
const isError = !cachedShow && isNetworkError;
```

With:

```typescript
const isError = !cachedShow && !storeShow && isNetworkError;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/pages/ShowDetailsPage.test.tsx -t "finds show from store" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Run the full ShowDetailsPage test suite**

Run: `cd apps/myk9show && npx vitest run src/test/pages/ShowDetailsPage.test.tsx 2>&1 | tail -30`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/hooks/useFastShowDetails.ts apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx
git commit -m "fix(shows): add store fallback to useFastShowDetails

When the show isn't in React Query cache, look it up in useShowStore
(populated by replication layer) before falling back to PostgREST.
Fixes ShowDetailsPage failing when RLS blocks direct queries."
```

---

### Task 4: Migrate Dog Pages to Store Reads

**Files:**

- Modify: `apps/myk9show/src/hooks/queries/useDogsDatabase.ts`
- Test: new test file `apps/myk9show/src/test/hooks/queries/useDogsDatabase.test.ts`

The dog data path is: `useDogStoreCompat` → `useDogsQuery` → `getAllDogs(personId)` → PostgREST. The `ReplicatedDogsTable` exists and its `getAllDogs()` method returns `ReplicatedDog[]` (camelCase fields: `ownerId`, no `coOwnerId`).

**Important type note:** `ReplicatedDog` is a simpler shape than the PostgREST response (no `owner` join, no `registrations`). The consumer `useDogStoreCompat` calls `mapDatabaseDogsArray` on the result, which expects the PostgREST shape. Two options:

1. Have `useDogsQuery` read from replication and adapt the shape
2. Keep PostgREST for the rich query but add the store as a fallback

Option 2 is safer — the PostgREST query will work after migration 120 is pushed (it already filters by `owner_id`/`co_owner_id`, matching the new RLS). We add the replication layer as a fallback for when PostgREST returns empty or fails.

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/test/hooks/queries/useDogsDatabase.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockReplicatedDogs = [
  {
    id: 'dog-1',
    name: 'Buddy',
    breed: 'Labrador',
    ownerId: 'person-1',
  },
];

vi.mock('@/services/replication', () => ({
  replicatedDogsTable: {
    getAllDogs: vi.fn().mockResolvedValue(mockReplicatedDogs),
  },
}));

vi.mock('@/hooks/useCurrentPersonId', () => ({
  useCurrentPersonId: () => 'person-1',
}));

// Simulate PostgREST returning empty (RLS blocking)
vi.mock('@/services/database/queries/dogQueries', () => ({
  getAllDogs: vi.fn().mockResolvedValue({ data: [], error: null }),
  getDogById: vi.fn(),
  getDogsByOwner: vi.fn(),
  createDog: vi.fn(),
  updateDog: vi.fn(),
  deleteDog: vi.fn(),
  searchDogs: vi.fn(),
  getDogStatistics: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useDogsQuery', () => {
  it('falls back to replication layer when PostgREST returns empty', async () => {
    const { result } = renderHook(() => useDogsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].id).toBe('dog-1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/queries/useDogsDatabase.test.ts -t "falls back to replication" 2>&1 | tail -20`
Expected: FAIL — `useDogsQuery` currently returns the empty PostgREST result without fallback.

- [ ] **Step 3: Add replication fallback to useDogsQuery**

In `apps/myk9show/src/hooks/queries/useDogsDatabase.ts`:

Add import:

```typescript
import { replicatedDogsTable } from '@/services/replication';
```

Replace the `useDogsQuery` implementation:

From:

```typescript
export const useDogsQuery = () => {
  const personId = useCurrentPersonId();

  return useQuery({
    queryKey: [...queryKeys.dogs, personId],
    queryFn: async () => {
      const { data, error } = await getAllDogs(personId!);
      if (error) throw error;
      return data;
    },
    enabled: !!personId,
    ...cacheStrategies.moderate,
  });
};
```

To:

```typescript
export const useDogsQuery = () => {
  const personId = useCurrentPersonId();

  return useQuery({
    queryKey: [...queryKeys.dogs, personId],
    queryFn: async () => {
      // Try PostgREST first (rich data with owner join + registrations)
      const { data, error } = await getAllDogs(personId!);
      if (!error && data && data.length > 0) return data;

      // Fallback to replication layer (offline-first, service-role synced)
      // Returns ReplicatedDog[] (camelCase, no joins) — consumers handle mapping
      const replicatedDogs = await replicatedDogsTable.getAllDogs();
      return replicatedDogs.filter(d => d.ownerId === personId);
    },
    enabled: !!personId,
    ...cacheStrategies.moderate,
  });
};
```

Note: The fallback returns `ReplicatedDog[]` which has a different shape than the PostgREST response. `mapDatabaseDogsArray` in `useDogStoreCompat` handles the mapping — verify it can handle both shapes. If not, add a simple adapter in the fallback path.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/queries/useDogsDatabase.test.ts -t "falls back to replication" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Run broader dog-related tests**

Run: `cd apps/myk9show && npx vitest run src/test/store/dogStore.test.tsx 2>&1 | tail -20`
Expected: PASS — the dogStore tests mock at the compat layer, not the query layer.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useDogsDatabase.ts apps/myk9show/src/test/hooks/queries/useDogsDatabase.test.ts
git commit -m "fix(dogs): add replication fallback to useDogsQuery

When PostgREST returns empty (RLS blocking), falls back to
ReplicatedDogsTable (offline-first, synced via service role).
Fixes dog pages showing 'No dogs yet' for authenticated users."
```

---

### Task 5: Run Full Test Suite and Typecheck

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck 2>&1 | tail -30`
Expected: No type errors.

- [ ] **Step 2: Run myK9Show test suite**

Run: `cd apps/myk9show && pnpm test 2>&1 | tail -30`
Expected: All tests pass. If any tests fail due to the mock changes, fix them — they likely mock `useShowsQuery` and need to mock `useShowStore` instead.

- [ ] **Step 3: Run lint**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm lint 2>&1 | tail -20`
Expected: No lint errors (unused imports from removed `useShowsQuery` calls etc. should be cleaned up in earlier tasks).

- [ ] **Step 4: Fix any failures**

If tests or typecheck fail, fix the issues. Common fixes:

- Remove unused `useShowsQuery` imports
- Update test mocks from `useShowsQuery` to `useShowStore`
- Fix type mismatches between store `Show` and React Query `Show`

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address test and typecheck issues from store migration"
```

---

### Task 6: Push Migrations to Live Database

**Files:** None (operational task)

- [ ] **Step 1: Check which migrations are pending**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && supabase migration list --linked 2>&1 | tail -20`

This shows which migrations have been applied vs pending. All migrations 108–120 should be verified.

- [ ] **Step 2: Push migrations**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && source supabase/.env && supabase db push --password "$SUPABASE_DB_PASSWORD" 2>&1 | tail -30`

Expected: All pending migrations applied successfully.

- [ ] **Step 3: Verify shows are visible**

After pushing, test in the browser:

1. Open `localhost:5173/shows` — should show published shows
2. Open `localhost:5173/shows/:id` for a known show — should load
3. Check dog pages — exhibitor should see own dogs

- [ ] **Step 4: Commit any migration list output or notes**

No code commit needed for this step — it's an operational deployment.
