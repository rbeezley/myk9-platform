# Trial Entries Join Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix trial details page showing 0 entries by querying entries through the class relationship instead of the unused `entries.trial_id` column.

**Architecture:** Rewrite `getEntriesByTrial()` to use PostgREST `!inner` join filter on `class.trial_id`. Extract a shared `useTrialEntries` hook. Update `TrialDetailsPage` to use trial-scoped entries instead of the global `getAllEntries()` fetch.

**Tech Stack:** Supabase PostgREST, React Query, Vitest

---

## File Map

| File                                                                    | Action | Responsibility                                       |
| ----------------------------------------------------------------------- | ------ | ---------------------------------------------------- |
| `apps/myk9show/src/services/database/queries/entry-query-lookups.ts`    | Modify | Rewrite `getEntriesByTrial` select + filter          |
| `apps/myk9show/src/hooks/queries/useTrialEntries.ts`                    | Create | Shared React Query hook wrapping `getEntriesByTrial` |
| `apps/myk9show/src/pages/TrialDetailsPage.tsx`                          | Modify | Use `useTrialEntries` instead of global entries      |
| `apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx` | Modify | Use shared `useTrialEntries` hook                    |
| `apps/myk9show/src/components/secretary/FinancialSummary.tsx`           | Modify | Use shared `useTrialEntries` hook                    |
| `apps/myk9show/src/test/hooks/useTrialEntries.test.ts`                  | Create | Tests for the shared hook                            |
| `apps/myk9show/src/test/services/entries/getEntriesByTrial.test.ts`     | Create | Tests for the rewritten query                        |

---

### Task 1: Rewrite `getEntriesByTrial` Query

**Files:**

- Modify: `apps/myk9show/src/services/database/queries/entry-query-lookups.ts:273-326`
- Test: `apps/myk9show/src/test/services/entries/getEntriesByTrial.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/test/services/entries/getEntriesByTrial.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEntriesByTrial } from '@/services/database/queries/entry-query-lookups';

// Track the chained query builder calls
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIs = vi.fn();
const mockOrder = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

mockSelect.mockReturnValue({ eq: mockEq });
mockEq.mockReturnValue({ is: mockIs });
mockIs.mockReturnValue({ order: mockOrder });

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ is: mockIs });
  mockIs.mockReturnValue({ order: mockOrder });
});

describe('getEntriesByTrial', () => {
  it('queries entries table with inner join on class.trial_id', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getEntriesByTrial('trial-123');

    expect(mockFrom).toHaveBeenCalledWith('entries');

    // Verify select uses !inner join on class_id
    const selectArg = mockSelect.mock.calls[0][0] as string;
    expect(selectArg).toContain('class:class_id!inner');
    expect(selectArg).toContain('trial_id');

    // Verify filter is on class.trial_id, not entries.trial_id
    expect(mockEq).toHaveBeenCalledWith('class.trial_id', 'trial-123');
  });

  it('excludes soft-deleted entries', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getEntriesByTrial('trial-123');

    expect(mockIs).toHaveBeenCalledWith('deleted_at', null);
  });

  it('returns data on success', async () => {
    const mockEntries = [{ id: 'entry-1' }, { id: 'entry-2' }];
    mockOrder.mockResolvedValue({ data: mockEntries, error: null });

    const result = await getEntriesByTrial('trial-123');

    expect(result.data).toEqual(mockEntries);
    expect(result.error).toBeNull();
  });

  it('returns empty array and error on failure', async () => {
    mockOrder.mockResolvedValue({
      data: null,
      error: { message: 'DB error', code: '42P01' },
    });

    const result = await getEntriesByTrial('trial-123');

    expect(result.data).toEqual([]);
    expect(result.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/services/entries/getEntriesByTrial.test.ts`

Expected: FAIL — the current `getEntriesByTrial` uses `.eq('trial_id', trialId)` not `.eq('class.trial_id', trialId)`, and the select doesn't contain `!inner`.

- [ ] **Step 3: Rewrite the query**

In `apps/myk9show/src/services/database/queries/entry-query-lookups.ts`, replace lines 273-326 with:

```typescript
export const getEntriesByTrial = async (trialId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        *,
        dog:dog_id (
          id,
          name,
          call_name,
          breed,
          owner:owner_id (
            id,
            first_name,
            last_name,
            email
          )
        ),
        class:class_id!inner (
          id,
          name,
          class_number,
          entry_fee,
          trial_id
        ),
        promo_code:promo_code_id (
          id,
          code,
          discount_type,
          discount_value
        )
      `
      )
      .eq('class.trial_id', trialId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_trial', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_trial');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_trial');
    logQuery('entries', 'select_by_trial', duration, dbError.message);
    return { data: [], error: dbError };
  }
};
```

Two changes from the original:

1. `class:class_id` → `class:class_id!inner` (inner join so only entries with a matching class are returned)
2. `.eq('trial_id', trialId)` → `.eq('class.trial_id', trialId)` (filter on the joined class's trial_id)
3. Added `trial_id` to the class select fields

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/services/entries/getEntriesByTrial.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/services/database/queries/entry-query-lookups.ts apps/myk9show/src/test/services/entries/getEntriesByTrial.test.ts
git commit -m "fix(entries): rewrite getEntriesByTrial to join through class.trial_id

Instead of filtering on entries.trial_id (never populated by registration
wizard), use PostgREST !inner join on class_id to filter by class.trial_id.
Correct by construction — no write-path changes needed."
```

---

### Task 2: Extract Shared `useTrialEntries` Hook

**Files:**

- Create: `apps/myk9show/src/hooks/queries/useTrialEntries.ts`
- Test: `apps/myk9show/src/test/hooks/useTrialEntries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/test/hooks/useTrialEntries.test.ts`:

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
import { createTestQueryClient } from '@/test/utils/testUtils';

vi.mock('@/services/database/queries/entry-query-lookups', () => ({
  getEntriesByTrial: vi.fn(),
}));

import { getEntriesByTrial } from '@/services/database/queries/entry-query-lookups';
const mockGetEntriesByTrial = vi.mocked(getEntriesByTrial);

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useTrialEntries', () => {
  it('returns entries for the given trial', async () => {
    const mockEntries = [
      { id: 'e1', class_id: 'c1', entry_status: 'confirmed' },
      { id: 'e2', class_id: 'c2', entry_status: 'pending' },
    ];
    mockGetEntriesByTrial.mockResolvedValue({ data: mockEntries, error: null });

    const { result } = renderHook(() => useTrialEntries('trial-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockEntries);
    expect(mockGetEntriesByTrial).toHaveBeenCalledWith('trial-1');
  });

  it('is disabled when trialId is empty', () => {
    const { result } = renderHook(() => useTrialEntries(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetEntriesByTrial).not.toHaveBeenCalled();
  });

  it('throws on query error', async () => {
    const dbError = { message: 'DB error', code: '500', details: '' };
    mockGetEntriesByTrial.mockResolvedValue({ data: [], error: dbError as never });

    const { result } = renderHook(() => useTrialEntries('trial-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useTrialEntries.test.ts`

Expected: FAIL — module `@/hooks/queries/useTrialEntries` does not exist yet.

- [ ] **Step 3: Create the hook**

Create `apps/myk9show/src/hooks/queries/useTrialEntries.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { cacheStrategies } from '@/lib/queryClient';
import { getEntriesByTrial } from '@/services/database/queries/entry-query-lookups';

/**
 * Shared hook for fetching entries by trial via class join.
 * Used by TrialDetailsPage, TrialEntriesTable, and FinancialSummary.
 * React Query deduplicates calls with the same trialId.
 */
export const useTrialEntries = (trialId: string) => {
  return useQuery({
    queryKey: ['trials', trialId, 'entries'],
    queryFn: async () => {
      const { data, error } = await getEntriesByTrial(trialId);
      if (error) throw error;
      return data;
    },
    enabled: !!trialId,
    ...cacheStrategies.dynamic,
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useTrialEntries.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useTrialEntries.ts apps/myk9show/src/test/hooks/useTrialEntries.test.ts
git commit -m "feat(hooks): extract shared useTrialEntries hook

Wraps getEntriesByTrial with React Query caching. Shared query key
['trials', trialId, 'entries'] deduplicates across TrialDetailsPage,
TrialEntriesTable, and FinancialSummary."
```

---

### Task 3: Migrate `TrialEntriesTable` to Shared Hook

**Files:**

- Modify: `apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx:114-128`

- [ ] **Step 1: Replace inline useQuery with useTrialEntries**

In `apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx`, replace the imports and query block:

Replace the imports at the top — remove:

```typescript
import { useQuery } from '@tanstack/react-query';
import { cacheStrategies } from '@/lib/queryClient';
import { getEntriesByTrial } from '@/services/database/queries/entry-query-lookups';
```

Add:

```typescript
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
```

Replace lines 114-128 (the component's query block):

```typescript
export const TrialEntriesTable = ({ trialId }: TrialEntriesTableProps) => {
  const {
    data: rawEntries = [],
    isLoading,
    isError,
  } = useTrialEntries(trialId);
```

Everything else in the component stays the same.

- [ ] **Step 2: Run full test suite to verify nothing breaks**

Run: `cd apps/myk9show && npx vitest run`

Expected: All tests pass. No existing tests reference `TrialEntriesTable` directly.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx
git commit -m "refactor(TrialEntriesTable): use shared useTrialEntries hook

Replaces inline useQuery with the shared hook. Same query key ensures
React Query deduplication with other consumers."
```

---

### Task 4: Migrate `FinancialSummary` to Shared Hook

**Files:**

- Modify: `apps/myk9show/src/components/secretary/FinancialSummary.tsx`

- [ ] **Step 1: Replace inline useQuery with useTrialEntries**

In `apps/myk9show/src/components/secretary/FinancialSummary.tsx`:

Remove the import:

```typescript
import { getEntriesByTrial } from '@/services/database/queries/entry-query-lookups';
```

Add the import:

```typescript
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
```

Replace the query block (around lines 51-59):

```typescript
const { data: rawEntries = [], isLoading } = useQuery({
  queryKey: queryKeys.trialFinancialSummary(trialId),
  queryFn: async () => {
    const { data, error } = await getEntriesByTrial(trialId);
    if (error) throw error;
    return data;
  },
  enabled: !!trialId,
  ...cacheStrategies.dynamic,
});
```

With:

```typescript
const { data: rawEntries = [], isLoading } = useTrialEntries(trialId);
```

Note: This changes the query key from `queryKeys.trialFinancialSummary(trialId)` to `['trials', trialId, 'entries']`. This is intentional — the data is the same, so sharing the cache is correct. The old key was a separate cache entry for identical data.

Also remove unused imports: `queryKeys` (if no longer used), `cacheStrategies` (if no longer used), `useQuery` (if no longer used). Check the file for other usages before removing.

- [ ] **Step 2: Run full test suite**

Run: `cd apps/myk9show && npx vitest run`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/secretary/FinancialSummary.tsx
git commit -m "refactor(FinancialSummary): use shared useTrialEntries hook

Shares cache with TrialEntriesTable and TrialDetailsPage via common
query key. Removes duplicate query configuration."
```

---

### Task 5: Update `TrialDetailsPage` to Use Trial-Scoped Entries

**Files:**

- Modify: `apps/myk9show/src/pages/TrialDetailsPage.tsx`

- [ ] **Step 1: Add useTrialEntries import**

Add to the imports in `TrialDetailsPage.tsx`:

```typescript
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
```

- [ ] **Step 2: Remove `entries: allEntries` from useClassStoreCompat destructure**

Replace lines 92-99:

```typescript
const { addClass, classes, entries: allEntries, updateClass, deleteClass } = useClassStoreCompat();
```

With:

```typescript
const { addClass, classes, updateClass, deleteClass } = useClassStoreCompat();
```

- [ ] **Step 3: Add useTrialEntries call**

After the `useClassStoreCompat()` call, add:

```typescript
// Fetch entries scoped to this trial via class join
// [EXPANDED] Destructure isLoading for entry counts — shows "--" while loading instead of silent 0
const { data: trialEntries = [], isLoading: entriesLoading } = useTrialEntries(trialId || '');
```

- [ ] **Step 4: Update trialWithClasses memo to use trialEntries**

Replace line 141:

```typescript
const classEntryCount = allEntries.filter(e => e.classId === classData.id).length;
```

With:

```typescript
// [EXPANDED] Use -1 while loading so downstream can show "--" instead of misleading "0"
const classEntryCount = entriesLoading
  ? -1
  : trialEntries.filter((e: Record<string, unknown>) => e.class_id === classData.id).length;
```

Note: `trialEntries` comes from the database (snake_case `class_id`), while the old `allEntries` came from the compat layer (camelCase `classId`). Verify the actual field name by checking what `getEntriesByTrial` returns — it returns raw Supabase rows with `class_id`.

Update the memo's dependency array (line 164) — replace `allEntries` with `trialEntries`:

```typescript
  }, [currentTrial, classes, trialEntries]);
```

- [ ] **Step 5: Update useTrialStats call**

Replace line 167:

```typescript
const trialStatistics = useTrialStats(trialWithClasses, allEntries);
```

With:

```typescript
const trialEntriesForStats = useMemo(
  () =>
    trialEntries.map((e: Record<string, unknown>) => ({
      classId: e.class_id as string,
      status: e.entry_status as string | undefined,
    })),
  [trialEntries]
);
const trialStatistics = useTrialStats(trialWithClasses, trialEntriesForStats);
```

This maps the raw DB entries (snake_case) to the `EntryForStats` shape that `useTrialStats` expects (`classId`, `status`).

- [ ] **Step 6: Run full test suite**

Run: `cd apps/myk9show && npx vitest run`

Expected: All tests pass. The `useTrialStats` tests are unaffected (they test the hook in isolation with mock data). No `TrialDetailsPage` unit tests exist.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/TrialDetailsPage.tsx
git commit -m "fix(TrialDetailsPage): use trial-scoped entries instead of global fetch

Replace getAllEntries() from useClassStoreCompat with useTrialEntries hook
that fetches only entries for the current trial via class join. Fixes
entry counts showing 0 in the classes table and stats."
```

---

### Task 6: Verify End-to-End and Run Full Suite

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`

Expected: 0 errors.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: 0 errors (or only pre-existing warnings).

- [ ] **Step 3: Run full myK9Show test suite**

Run: `cd apps/myk9show && npx vitest run`

Expected: All tests pass.

- [ ] **Step 4: Run useTrialStats tests specifically**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useTrialStats.test.ts`

Expected: All 8 tests pass unchanged — the hook's interface didn't change.

- [ ] **Step 5: Verify no stale imports**

Search for any remaining references to the old pattern:

```bash
grep -r "entries: allEntries" apps/myk9show/src/pages/TrialDetailsPage.tsx
grep -r "\.eq('trial_id'" apps/myk9show/src/services/database/queries/entry-query-lookups.ts
```

Expected: No matches for either.
