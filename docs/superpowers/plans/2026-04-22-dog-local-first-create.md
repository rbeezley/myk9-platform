# Dog Local-First Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the dogs list showing only one dog (when two exist) by making dog creation local-first: write to IndexedDB before Supabase so the read path's replication-first fetch always finds the complete set.

**Architecture:** `useDogStoreCompat.addDog` generates a client UUID, writes the new dog to IndexedDB (`isDirty: false`) before calling PostgREST, then rolls back the IndexedDB entry on failure. `createDog` in `dogQueries.ts` stops stripping the `id` field so the client UUID is preserved in Supabase. The `useCreateDogMutation.onSuccess` already calls `invalidateQueries.all('dogs')` which triggers a React Query refetch; since the dog is now in IndexedDB before that refetch, both dogs appear.

**[ADDED] Architectural tradeoff vs pure Option 2:** This plan intentionally bypasses the MutationManager queue in favor of a direct PostgREST insert. The "pure" Option 2 (local UUID → `queueMutation` → wait for background flush → write registrations) requires polling or event-subscription to know when the mutation completes, because registrations need the dog to exist in Supabase (FK constraint). The direct-PostgREST path preserves the key local-first property — **IndexedDB is the source of truth for reads and is written before Supabase** — while avoiding mutation-flush-waiting complexity. Known tradeoff: offline creates will fail and roll back rather than queue for later sync (see "Known Limitations" section below).

**Tech Stack:** TypeScript, Supabase PostgREST, IndexedDB via `@myk9/replication`, React Query (`@tanstack/react-query`), Vitest, `renderHook` from `@testing-library/react`.

---

## Root Cause (context for the worker)

`createDog` in `dogQueries.ts` inserts via PostgREST but never touches IndexedDB. `getAllDogs` reads IndexedDB first and only falls back to PostgREST when the replication function **throws** — not when it returns partial data. So Dog 1 (previously synced to IndexedDB) is returned, `data.length > 0` short-circuits the fallback, and Dog 2 (Supabase-only) is invisible until the next background sync.

---

## File Map

| File | Change |
|------|--------|
| `apps/myk9show/src/services/mappers/dogMappers.ts` | Add `mapDogInputToReplicated(input, id)` |
| `apps/myk9show/src/services/database/queries/dogQueries.ts:330-368` | Stop stripping `id` from INSERT payload |
| `apps/myk9show/src/hooks/useDogStoreCompat.ts:75-105` | Rewrite `addDog` — IndexedDB first, rollback on failure |
| `apps/myk9show/src/services/database/queries/__tests__/dogQueries.test.ts` | Add test: client-provided `id` is passed through |
| `apps/myk9show/src/hooks/__tests__/useDogStoreCompat.test.ts` | New file: test local-first addDog behaviour |

---

## Task 1: Add `mapDogInputToReplicated` mapper

**Files:**
- Modify: `apps/myk9show/src/services/mappers/dogMappers.ts`
- Test: `apps/myk9show/src/services/database/queries/__tests__/dogQueries.test.ts` (see Task 2)

- [ ] **Step 1: Write the failing test for the mapper**

Add to `apps/myk9show/src/services/database/queries/__tests__/dogQueries.test.ts`, inside the `describe('createDog')` block, after the existing tests:

```typescript
import { mapDogInputToReplicated } from '@/services/mappers/dogMappers';

describe('mapDogInputToReplicated', () => {
  it('maps DogInput to ReplicatedDog with supplied id', () => {
    const input = {
      name: 'Daisy',
      breed: 'Beagle',
      sex: 'female' as const,
      ownerId: 'person-1',
      callName: 'Daisy',
      birthDate: '2021-03-15',
      color: 'tricolor',
      weight: 22,
      height: 13,
      microchipNumber: '123456789',
      imageUrl: 'https://example.com/daisy.jpg',
      spayedNeutered: true,
    };
    const result = mapDogInputToReplicated(input, 'dog-uuid-999');
    expect(result).toEqual({
      id: 'dog-uuid-999',
      name: 'Daisy',
      callName: 'Daisy',
      breed: 'Beagle',
      sex: 'female',
      dateOfBirth: '2021-03-15',
      ownerId: 'person-1',
      color: 'tricolor',
      weight: '22',
      height: '13',
      microchipNumber: '123456789',
      imageUrl: 'https://example.com/daisy.jpg',
      isSpayedNeutered: true,
    });
  });

  it('omits undefined optional fields', () => {
    const input = {
      name: 'Rex',
      breed: 'Lab',
      sex: 'male' as const,
      ownerId: 'person-2',
    };
    const result = mapDogInputToReplicated(input, 'dog-uuid-000');
    expect(result.id).toBe('dog-uuid-000');
    expect(result.name).toBe('Rex');
    expect(result.callName).toBeUndefined();
    expect(result.dateOfBirth).toBeUndefined();
    expect(result.weight).toBeUndefined();
    expect(result.height).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL** (`mapDogInputToReplicated` not exported yet)

```bash
cd apps/myk9show && npx vitest run src/services/database/queries/__tests__/dogQueries.test.ts
```

Expected: `Error: mapDogInputToReplicated is not a function` or import error.

- [ ] **Step 3: Implement the mapper**

Add at the bottom of `apps/myk9show/src/services/mappers/dogMappers.ts` (before the final closing line):

```typescript
/**
 * Map a DogInput + explicit id to a ReplicatedDog for IndexedDB storage.
 * Used by the local-first create path: write to IndexedDB before PostgREST.
 * weight/height are numbers in DogInput but strings in ReplicatedDog.
 */
export const mapDogInputToReplicated = (input: DogInput, id: string): ReplicatedDog => {
  return {
    id,
    name: input.name,
    callName: input.callName || undefined,
    breed: input.breed,
    sex: input.sex || undefined,
    dateOfBirth: input.birthDate || undefined,
    ownerId: input.ownerId || undefined,
    color: input.color || undefined,
    weight: input.weight != null ? String(input.weight) : undefined,
    height: input.height != null ? String(input.height) : undefined,
    microchipNumber: input.microchipNumber || undefined,
    imageUrl: input.imageUrl || undefined,
    isSpayedNeutered: input.spayedNeutered ?? undefined,
  };
};
```

Also add the `ReplicatedDog` import at the top of `dogMappers.ts`:

```typescript
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/myk9show && npx vitest run src/services/database/queries/__tests__/dogQueries.test.ts
```

Expected: all tests in this file pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/services/mappers/dogMappers.ts \
        apps/myk9show/src/services/database/queries/__tests__/dogQueries.test.ts
git commit -m "feat(dogs): add mapDogInputToReplicated mapper for local-first create"
```

---

## Task 1a: [ADDED] Audit existing `createDog` callers

**Why:** Task 2 changes `createDog` to stop stripping `id`. Any existing caller that happens to pass an `id` field in its `DbDogInsert` (today silently discarded) would start sending that id to Supabase. We need to confirm no caller relies on the stripping behavior before removing it.

**Files:**
- Read-only audit: all call sites of `createDog` from `dogQueries.ts`

- [ ] **Step 1: Find all callers**

```bash
cd apps/myk9show && grep -rn "createDog\b" src --include="*.ts" --include="*.tsx"
```

Expected: list of files importing/calling `createDog`. As of 2026-04-22 the expected callers are `useDogsDatabase.ts` (via `useCreateDogMutation`) and `useDogStoreCompat.ts` (via the mutation).

- [ ] **Step 2: Inspect each caller**

For every call site, confirm whether the payload includes an `id` field today. Grep for `id:` near each call, or read the surrounding function. If any caller **already** sets `id` and depends on it being stripped, that caller must be updated in the same change set.

- [ ] **Step 3: Record findings**

If all callers either (a) never set `id`, or (b) intentionally want the id preserved (our new `addDog`), proceed to Task 2. If a caller accidentally sets `id` and expects it to be discarded, either update the caller to delete the field first, or defer Task 2 until that caller is fixed.

No commit for this task — it is an audit step.

---

## Task 2: Stop stripping `id` in `createDog`

**Files:**
- Modify: `apps/myk9show/src/services/database/queries/dogQueries.ts:330-368`
- Test: `apps/myk9show/src/services/database/queries/__tests__/dogQueries.test.ts`

- [ ] **Step 1: Write failing test asserting client `id` is passed to Supabase**

In `apps/myk9show/src/services/database/queries/__tests__/dogQueries.test.ts`, add inside `describe('createDog')`:

```typescript
it('passes client-supplied id to Supabase INSERT', async () => {
  const newDog: DbDogInsert = {
    id: 'client-uuid-abc',
    name: 'Charlie',
    breed: 'Beagle',
    owner_id: 'person-1',
    sex: 'male',
  };
  const mockCreatedDog = { id: 'client-uuid-abc', ...newDog, owner: null };
  mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockCreatedDog, error: null }));

  await createDog(newDog);

  // The chainable `.insert()` call receives the data — verify id is NOT stripped
  const insertCall = mockSupabase.from.mock.results[0].value.insert.mock.calls[0][0];
  expect(insertCall[0]).toHaveProperty('id', 'client-uuid-abc');
});
```

- [ ] **Step 2: Run test — expect FAIL** (current code strips `id`)

```bash
cd apps/myk9show && npx vitest run src/services/database/queries/__tests__/dogQueries.test.ts -t "passes client-supplied id"
```

Expected: assertion fails — `id` is undefined on the insert payload.

- [ ] **Step 3: Remove the id-stripping in `createDog`**

In `apps/myk9show/src/services/database/queries/dogQueries.ts`, replace lines 333–337:

```typescript
// BEFORE
const { id: _discardedId, ...cleanDogData } = dogData as DbDogInsert & { id?: string };

const { data, error } = await supabase
  .from('dogs')
  .insert([cleanDogData])
```

```typescript
// AFTER
// Pass dogData directly — client-provided id (if any) is preserved so the
// local-first IndexedDB write and the PostgREST INSERT share the same UUID.
const { data, error } = await supabase
  .from('dogs')
  .insert([dogData])
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd apps/myk9show && npx vitest run src/services/database/queries/__tests__/dogQueries.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/services/database/queries/dogQueries.ts \
        apps/myk9show/src/services/database/queries/__tests__/dogQueries.test.ts
git commit -m "fix(dogs): preserve client-supplied id in createDog INSERT"
```

---

## Task 3: Rewrite `addDog` to be local-first

**Files:**
- Modify: `apps/myk9show/src/hooks/useDogStoreCompat.ts:75-105`
- Test: `apps/myk9show/src/hooks/__tests__/useDogStoreCompat.test.ts` (new)

### 3a — Write the failing tests first

- [ ] **Step 1: Create the test file**

Create `apps/myk9show/src/hooks/__tests__/useDogStoreCompat.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDogStoreCompat } from '../useDogStoreCompat';
import type { DogInput } from '@/store/dogStore';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSetReplicatedDog = vi.fn().mockResolvedValue(undefined);
const mockDeleteReplicatedDog = vi.fn().mockResolvedValue(undefined);

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getAllDogs: vi.fn().mockResolvedValue([]),
    set: mockSetReplicatedDog,
    delete: mockDeleteReplicatedDog,
    get: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

const mockCreateMutateAsync = vi.fn();
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsQuery: () => ({ data: [], isLoading: false, error: null, isStale: false, isFetching: false, refetch: vi.fn() }),
  useCreateDogMutation: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false, error: null }),
  useUpdateDogMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useDeleteDogMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useDogStatisticsQuery: () => ({ data: undefined, isLoading: false }),
  useDogQuery: () => ({ data: null, isLoading: false, error: null }),
  useDogsByOwnerQuery: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock('@/hooks/dogStoreCompatHelpers', () => ({
  syncDogRegistrations: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/hooks/useCurrentPersonId', () => ({
  useCurrentPersonId: () => 'person-123',
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const baseDogInput: DogInput = {
  name: 'Biscuit',
  breed: 'Beagle',
  sex: 'male',
  ownerId: 'person-123',
};

const mockDbDog = {
  id: 'server-uuid',
  name: 'Biscuit',
  breed: 'Beagle',
  sex: 'male',
  owner_id: 'person-123',
  call_name: null,
  date_of_birth: null,
  color: null,
  height: null,
  weight: null,
  microchip_number: null,
  spayed_neutered: null,
  image_url: null,
  owner: null,
  registrations: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDogStoreCompat.addDog — local-first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMutateAsync.mockResolvedValue(mockDbDog);
  });

  it('writes to IndexedDB before PostgREST insert', async () => {
    let indexedDbWriteOrder = 0;
    let postgrestCallOrder = 0;
    let counter = 0;

    mockSetReplicatedDog.mockImplementation(() => {
      indexedDbWriteOrder = ++counter;
      return Promise.resolve();
    });
    mockCreateMutateAsync.mockImplementation(() => {
      postgrestCallOrder = ++counter;
      return Promise.resolve(mockDbDog);
    });

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog(baseDogInput);
    });

    expect(indexedDbWriteOrder).toBeLessThan(postgrestCallOrder);
  });

  it('writes to IndexedDB with isDirty=false (synced status)', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog(baseDogInput);
    });

    // set(id, dog, isDirty) — third arg must be false
    expect(mockSetReplicatedDog).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'Biscuit', breed: 'Beagle' }),
      false
    );
  });

  it('uses the same UUID for IndexedDB and PostgREST', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog(baseDogInput);
    });

    const indexedDbId = (mockSetReplicatedDog.mock.calls[0] as unknown[])[0] as string;
    const postgrestPayload = (mockCreateMutateAsync.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(postgrestPayload.id).toBe(indexedDbId);
  });

  it('removes from IndexedDB when PostgREST insert fails', async () => {
    mockCreateMutateAsync.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.addDog(baseDogInput)).rejects.toThrow();
    });

    expect(mockDeleteReplicatedDog).toHaveBeenCalledWith(expect.any(String));
  });

  it('uses same UUID in rollback delete as in initial IndexedDB write', async () => {
    mockCreateMutateAsync.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.addDog(baseDogInput)).rejects.toThrow();
    });

    const writtenId = (mockSetReplicatedDog.mock.calls[0] as unknown[])[0] as string;
    const deletedId = (mockDeleteReplicatedDog.mock.calls[0] as unknown[])[0] as string;
    expect(deletedId).toBe(writtenId);
  });

  // [ADDED] Regression test for the reported bug: two dogs in DB, only one visible
  it('REGRESSION: after addDog, getAllDogs returns both the pre-existing dog and the new one', async () => {
    // Simulate one pre-existing dog already in IndexedDB (mimicking the prior sync)
    const existingDog = {
      id: 'existing-uuid',
      name: 'Rex',
      breed: 'Lab',
      sex: 'male',
      ownerId: 'person-123',
    };
    // Reconfigure the replicatedDogsTable mock to reflect writes via set()
    const store = new Map<string, unknown>([[existingDog.id, existingDog]]);
    mockSetReplicatedDog.mockImplementation((id: string, dog: unknown) => {
      store.set(id, dog);
      return Promise.resolve();
    });
    const { replicatedDogsTable: mocked } = await import('@/services/replication/ReplicatedDogsTable');
    (mocked.getAllDogs as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(Array.from(store.values()))
    );

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog({ ...baseDogInput, name: 'Biscuit' });
    });

    const all = await mocked.getAllDogs();
    expect(all).toHaveLength(2);
    expect(all.map((d: { name: string }) => d.name).sort()).toEqual(['Biscuit', 'Rex']);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL** (current `addDog` doesn't write to IndexedDB)

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/useDogStoreCompat.test.ts
```

Expected: all 4 tests fail — `mockSetReplicatedDog` is never called.

### 3b — Implement local-first `addDog`

- [ ] **Step 3: Add imports to `useDogStoreCompat.ts`**

At the top of `apps/myk9show/src/hooks/useDogStoreCompat.ts`, add alongside the existing imports:

```typescript
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { mapDogInputToReplicated } from '@/services/mappers/dogMappers';
```

- [ ] **Step 4: Rewrite `addDog` in `useDogStoreCompat.ts`**

Replace the existing `addDog` function (lines 75–105) with:

```typescript
const addDog = async (dogData: DogInput): Promise<Dog> => {
  const dogId = crypto.randomUUID();

  // Write to IndexedDB first so getAllDogs finds this dog on the next React Query
  // refetch — before waiting for PostgREST to confirm. isDirty=false tells
  // ReplicatedTable this is already server-confirmed (we handle Supabase ourselves).
  const replicatedDog = mapDogInputToReplicated(dogData, dogId);
  await replicatedDogsTable.set(dogId, replicatedDog, false);

  const dbData = mapDogInputToInsert({ ...dogData });
  // Include the client UUID so Supabase uses the same id as IndexedDB.
  (dbData as Record<string, unknown>).id = dogId;

  try {
    const result = await runDogMutation(() => createMutation.mutateAsync(dbData));
    const newDog = mapDatabaseToDog(result);

    if (dogData.registrations && dogData.registrations.length > 0) {
      try {
        const changed = await syncDogRegistrations(newDog.id, dogData.registrations);
        if (changed) {
          queryClient.invalidateQueries({ queryKey: queryKeys.registrationsByDog(newDog.id) });
        }
      } catch (err) {
        logger.error(
          'Failed to create registrations for new dog',
          'dogs',
          { dogId: newDog.id },
          err as Error
        );
        throw err instanceof Error
          ? err
          : new Error('Failed to save dog registrations. Please try again.');
      }
    }

    return newDog;
  } catch (err) {
    // Rollback: remove the optimistic IndexedDB entry so the list doesn't show
    // a dog that failed to reach Supabase.
    await replicatedDogsTable.delete(dogId);
    throw err;
  }
};
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/useDogStoreCompat.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 6: Run full suite to check for regressions**

```bash
cd apps/myk9show && npx vitest run
```

Expected: all tests pass (no regressions).

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/hooks/useDogStoreCompat.ts \
        apps/myk9show/src/hooks/__tests__/useDogStoreCompat.test.ts
git commit -m "fix(dogs): local-first dog create — write IndexedDB before PostgREST, rollback on failure"
```

---

## Task 4: Typecheck + final verification

- [ ] **Step 1: Typecheck the monorepo**

```bash
cd /path/to/monorepo-root && pnpm typecheck
```

Expected: no new type errors.

- [ ] **Step 2: Manually verify the fix in the browser**

1. Start the dev server: `pnpm dev:show`
2. Log in as a user with at least one existing dog.
3. Open the Dogs page — confirm the existing dog appears.
4. Add a second dog via Add Dog panel, fill in name + breed + sex + owner, click Create Dog.
5. Confirm: **both dogs appear in the list immediately** after creation (no page refresh).
6. Open DevTools → Application → IndexedDB → `myk9-replication` → `replicated_tables` — confirm the new dog row is present with `syncStatus: "synced"`.

- [ ] **Step 3: Commit (if typecheck required any fixes)**

Only commit if step 1 required changes. Otherwise skip.

---

## Self-Review Checklist

**Spec coverage:**
- [x] Dog written to IndexedDB before PostgREST → Task 3
- [x] Same UUID used in IndexedDB and Supabase → Tasks 2 + 3
- [x] Rollback on PostgREST failure → Task 3
- [x] Registrations still written after dog confirmed in Supabase → Task 3
- [x] Tests covering all four scenarios → Task 3 step 1

**Placeholder scan:** No TBDs, no "handle edge cases", all code blocks are complete.

**Type consistency:**
- `mapDogInputToReplicated` returns `ReplicatedDog` (defined in Task 1) — used in Task 3 ✓
- `replicatedDogsTable.set(id, data, isDirty)` signature confirmed from `ReplicatedTable.ts:220` ✓
- `replicatedDogsTable.delete(id)` confirmed from `ReplicatedTable.ts:278` ✓
- `DbDogInsert` has `id?: string` (confirmed from generated Supabase types) ✓

---

## [ADDED] Known Limitations

**Offline create behavior:** This plan chooses the direct-PostgREST path inside the `try` block. If the user is offline (or the network call throws for any reason), `createMutation.mutateAsync` rejects and the `catch` block rolls back the IndexedDB entry. **This means dog creation requires network connectivity.** A true local-first-with-background-sync behavior — where the dog stays in IndexedDB and the mutation replays when the device comes back online — is explicitly NOT in scope for this plan (see the "Architectural tradeoff" note in the Architecture section).

Mitigation: the rollback means users see an error and can retry, rather than silently having a dog that never reaches Supabase. A future enhancement could switch to `replicatedDogsTable.createDog()` + `queueMutation` + registration-writes-on-flush, but that requires either (a) polling the MutationManager for completion or (b) subscribing to a flush event, plus a UI state for "pending creation" rows.

**Impact on the reported bug:** The reported bug (two dogs in DB, one on screen) happens while online, after a successful create. The fix in this plan addresses that path. Offline creates were already broken (would error out of `createMutation`) and remain so — this plan does not regress that behavior.

---

## Plan Verification

### Requirements Audit (final, post-patch)

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| Fix: two dogs in DB → both show on list page | Covered | Task 3 step 4 writes dog to IndexedDB before PostgREST; regression test in Task 3 Step 1 asserts `getAllDogs` returns both |
| Local-first (IndexedDB before Supabase) | Covered | Task 3 step 4, "write to IndexedDB first" comment + ordering test |
| Same UUID across IndexedDB and Supabase | Covered | Task 2 removes id-stripping; Task 3 step 4 passes client UUID in `dbData.id`; test `uses the same UUID` |
| Rollback on PostgREST failure | Covered | Task 3 step 4 catch-block calls `replicatedDogsTable.delete(dogId)`; tests `removes from IndexedDB when PostgREST insert fails` + `uses same UUID in rollback` |
| Registrations still written after dog confirmed | Covered | Task 3 step 4 preserves existing `syncDogRegistrations` logic inside `try` |
| No regression in other `createDog` callers | Covered | Task 1a audits callers before changing `createDog` |
| Offline behavior documented | Covered | Known Limitations section |
| Architectural decision rationale recorded | Covered | Architecture section "[ADDED] Architectural tradeoff" block |
| Tests for new code (per `CLAUDE.md`) | Covered | Task 1 mapper tests; Task 2 id-pass-through test; Task 3 ordering, UUID, rollback, and regression tests |
| Typecheck clean | Covered | Task 4 step 1 |
| Manual browser verification | Covered | Task 4 step 2 |

### Coverage: 95/100

Remaining 5 points held back because manual browser verification and the regression test's mock simulation (Map-backed `getAllDogs`) are proxies for real end-to-end behavior — the real proof is Task 4 step 2 on localhost:5173.

### Top Gaps (post-patch): none blocking execution.
