# PostgREST-to-Replication Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite SELECT functions in 7 query files to read from the replication store instead of direct PostgREST, plus create 2 new replicated tables (armbands, waitlist_entries).

**Architecture:** Thin query layer pattern — function signatures and return types stay the same, but internals read from IndexedDB-backed replicated table singletons instead of `supabase.from()`. Joins become JS-side lookups across multiple replicated tables. Mutations (INSERT/UPDATE/DELETE/RPC) stay on PostgREST.

**Tech Stack:** TypeScript, Vitest, `@myk9/replication` (IndexedDB via `idb`), Supabase PostgREST (mutations only)

**Spec:** `docs/superpowers/specs/2026-04-07-postgrest-to-replication-migration-design.md`

---

## File Structure

### New Files

| File                                                                                   | Responsibility                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/myk9show/src/services/mappers/showMappers.ts`                                    | Convert `ReplicatedShow` + joined data to snake_case row shape           |
| `apps/myk9show/src/services/mappers/trialMappers.ts`                                   | Convert `ReplicatedTrial` + show join to snake_case row shape            |
| `apps/myk9show/src/services/mappers/classMappers.ts`                                   | Convert `ReplicatedClass` + trial/entry joins to snake_case row shape    |
| `apps/myk9show/src/services/mappers/entryMappers.ts`                                   | Convert `ReplicatedEntry` + dog/class/show joins to snake_case row shape |
| `apps/myk9show/src/services/replication/ReplicatedArmbandsTable.ts`                    | New replicated table for `armbands`                                      |
| `apps/myk9show/src/services/replication/ReplicatedWaitlistEntriesTable.ts`             | New replicated table for `waitlist_entries`                              |
| `apps/myk9show/src/services/mappers/armbandMappers.ts`                                 | Convert replicated armband + joins to row shape                          |
| `apps/myk9show/src/services/mappers/waitlistMappers.ts`                                | Convert replicated waitlist entry + joins to row shape                   |
| `apps/myk9show/src/test/services/database/queries/showQueries.replication.test.ts`     | Tests for migrated show queries                                          |
| `apps/myk9show/src/test/services/database/queries/trialQueries.replication.test.ts`    | Tests for migrated trial queries                                         |
| `apps/myk9show/src/test/services/database/queries/classQueries.replication.test.ts`    | Tests for migrated class queries                                         |
| `apps/myk9show/src/test/services/database/queries/entryQueries.replication.test.ts`    | Tests for migrated entry queries                                         |
| `apps/myk9show/src/test/services/database/queries/dogQueries.replication.test.ts`      | Tests for migrated dog queries                                           |
| `apps/myk9show/src/test/services/database/queries/armbandQueries.replication.test.ts`  | Tests for migrated armband queries                                       |
| `apps/myk9show/src/test/services/database/queries/waitlistQueries.replication.test.ts` | Tests for migrated waitlist queries                                      |

### Modified Files

| File                                                                 | Changes                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/myk9show/src/services/database/queries/showQueries.ts`         | Rewrite ~11 SELECT functions to read from replication |
| `apps/myk9show/src/services/database/queries/trialQueries.ts`        | Rewrite ~8 SELECT functions                           |
| `apps/myk9show/src/services/database/queries/classQueries.ts`        | Rewrite ~6 SELECT functions                           |
| `apps/myk9show/src/services/database/queries/entry-query-lookups.ts` | Rewrite ~8 SELECT functions                           |
| `apps/myk9show/src/services/database/queries/entry-query-search.ts`  | Rewrite ~4 SELECT functions                           |
| `apps/myk9show/src/services/database/queries/dogQueries.ts`          | Rewrite ~7 SELECT functions                           |
| `apps/myk9show/src/services/database/queries/armbandQueries.ts`      | Rewrite ~2 SELECT functions                           |
| `apps/myk9show/src/services/database/queries/waitlistQueries.ts`     | Rewrite ~5 SELECT functions                           |
| `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`            | Register 2 new replicated tables                      |
| `apps/myk9show/src/services/mappers/dogMappers.ts`                   | Already exists — may need minor updates               |

---

## Conventions

### Return Shape

All migrated SELECT functions preserve the existing `{ data, error }` return shape:

```typescript
// Success
return { data: mappedResult, error: null };

// No data found
return { data: null, error: null };

// Empty list
return { data: [], error: null };
```

### Mapper Naming

Each mapper file exports functions named `mapReplicatedXToRow()` that convert camelCase replicated types to the snake_case DB row shape consumers expect. For joined data, the mapper accepts the related records as additional parameters.

### Mocking Pattern for Tests

Tests mock the replicated table singletons:

```typescript
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: {
    get: vi.fn(),
    getAll: vi.fn(),
    queryByField: vi.fn(),
    getAllShows: vi.fn(),
    // ... other methods used
  },
}));
```

### Soft Delete Filtering

All replicated tables sync non-deleted rows only (sync queries include `.is('deleted_at', null)`). The query functions that filter `deleted_at IS NULL` don't need explicit filtering after migration — the data is already clean. Functions that query deleted records (e.g. `getDeletedShows`) stay on PostgREST since deleted records aren't synced.

### [ADDED] Error Handling and Fallback

Every migrated SELECT function must wrap replicated table reads in a try/catch. If IndexedDB throws (corruption, quota exceeded, circuit breaker tripped), fall back to the original PostgREST query. This ensures the migration is non-breaking even when offline storage fails:

```typescript
export async function getAllShows() {
  try {
    const shows = await replicatedShowsTable.getAllShows();
    // ... join + map
    return { data: mapped, error: null };
  } catch {
    // Fallback to PostgREST if replication store is unavailable
    const { data, error } = await supabase.from('shows').select('...').is('deleted_at', null);
    return { data, error };
  }
}
```

Keep the original PostgREST query code in a `_fallback` suffix function (e.g. `getAllShows_fallback`) or inline in the catch block. This means the `supabase` import stays in each file — it's just no longer the primary path.

### [ADDED] N+1 Join Batching

When joining across replicated tables (e.g. shows + clubs), avoid per-row lookups. Instead, batch-read all related records first, then join in memory via a Map:

```typescript
const shows = await replicatedShowsTable.getAllShows();
const allClubs = await replicatedClubsTable.getAllClubs();
const clubMap = new Map(allClubs.map(c => [c.id, c]));
const mapped = shows.map(s => mapToShowRow(s, clubMap.get(s.clubId)));
```

This converts N+1 reads to 2 reads. Apply this pattern in any function that joins across tables for a list of records. Single-record functions (e.g. `getShowById`) can use direct `.get()` calls.

### [ADDED] Existing Test Updates

When a query file is migrated, its existing test file (e.g. `showQueries.test.ts`) will break because the functions no longer call `supabase.from()`. For each migrated file:

1. Update the existing test to mock replicated table singletons instead of supabase
2. Or delete the existing test if the new `.replication.test.ts` file provides equivalent or better coverage
3. At minimum, run the existing test to confirm it fails, then decide whether to update or replace

---

## Task 1: Migrate showQueries.ts

**Files:**

- Create: `apps/myk9show/src/services/mappers/showMappers.ts`
- Create: `apps/myk9show/src/test/services/database/queries/showQueries.replication.test.ts`
- Modify: `apps/myk9show/src/services/database/queries/showQueries.ts`

**SELECT functions to migrate:** `getAllShows`, `getShowById`, `getUpcomingShows`, `getShowsByDateRange`, `getShowsByClub`, `getShowsWithEntryCounts`, `getShowsByStatus`, `getSecretaryShows`, `searchShows`, `getShowStatistics`

**Functions staying on PostgREST:** `createShow`, `updateShow`, `deleteShow`, `hardDeleteShow`, `restoreShow`, `legacyDeleteShow`, `getDeletedShows` (queries deleted records not in replication)

- [ ] **Step 1: Write showMappers.ts**

Create the mapper that converts `ReplicatedShow` + joined clubs/trials/judge_assignments to the snake_case row shape that consumers expect. Study the current `select(...)` string in `getAllShows` to determine the exact shape returned — the mapper must produce an identical structure.

Read these files first:

- `apps/myk9show/src/services/database/queries/showQueries.ts` — see the exact `.select()` strings and return shapes
- `apps/myk9show/src/services/replication/ReplicatedShowsTable.ts` — see `ReplicatedShow` fields
- `apps/myk9show/src/services/replication/ReplicatedClubsTable.ts` — see `ReplicatedClub` fields
- `apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts` — see `ReplicatedTrial` fields
- `apps/myk9show/src/services/replication/ReplicatedJudgeAssignmentsTable.ts` — see `ReplicatedJudgeAssignment` fields
- `apps/myk9show/src/services/mappers/dogMappers.ts` — see the existing mapper pattern (e.g. `mapReplicatedDogToDbRow`)

The mapper must convert camelCase replicated types to snake_case DB row shape. For joined data (clubs, trials, judge_assignments), nest them under the same alias keys the PostgREST query uses (e.g. `club:`, `trials:`, `judge_assignments:`).

- [ ] **Step 2: Write tests for migrated show query functions**

Create `apps/myk9show/src/test/services/database/queries/showQueries.replication.test.ts`.

Mock the replicated table singletons (`replicatedShowsTable`, `replicatedClubsTable`, `replicatedTrialsTable`, `replicatedJudgeAssignmentsTable`). For each migrated SELECT function, test:

- Returns correct snake_case shape with joined data
- Filters work (status, date range, club, search term)
- Sorting works (start_date ascending/descending)
- Limits work (getUpcomingShows)
- Count queries work (getShowStatistics)
- Returns `{ data: null, error: null }` for missing records
- Returns `{ data: [], error: null }` for empty lists

Read the existing test patterns in `apps/myk9show/src/test/services/database/queries/showQueries.test.ts` (if it exists) or `apps/myk9show/src/services/database/queries/__tests__/dogQueries.test.ts` for mocking conventions.

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/showQueries.replication.test.ts
```

Expected: FAIL — functions still read from PostgREST, mocked replicated tables return nothing.

- [ ] **Step 4: Rewrite SELECT functions in showQueries.ts**

Replace the PostgREST internals of each SELECT function with replicated table reads + mapper calls. Keep function signatures identical. Import the replicated table singletons and the mapper.

Key patterns:

- `getAllShows()`: `replicatedShowsTable.getAllShows()` + join clubs/trials/judge_assignments via `replicatedClubsTable.get()` etc. + sort by start_date + map
- `getShowById(id)`: `replicatedShowsTable.get(id)` + join + `.single()` equivalent (return null if not found)
- `getUpcomingShows(limit)`: `replicatedShowsTable.getUpcomingShows()` + join + `.slice(0, limit)` + map
- `getShowsByDateRange(start, end)`: `replicatedShowsTable.getAllShows()` + filter by date range + join + map
- `getShowsByClub(clubId)`: `replicatedShowsTable.getShowsByClub(clubId)` + join + map
- `getShowsWithEntryCounts()`: same as `getAllShows` but add `entry_count: 0` to each row
- `getShowsByStatus(status)`: `replicatedShowsTable.getAllShows()` + filter by status + join + map
- `getSecretaryShows(_userId)`: `replicatedShowsTable.getAllShows()` + map to `{ id, name, start_date, end_date }` + sort descending
- `searchShows(term)`: `replicatedShowsTable.getAllShows()` + filter by name/location ilike + map
- `getShowStatistics()`: `replicatedShowsTable.getAllShows()` + return `{ data: { total: shows.length }, error: null }`

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/showQueries.replication.test.ts
```

Expected: PASS

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Check that existing tests still pass. If any fail due to the migration, fix them.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/services/mappers/showMappers.ts \
       apps/myk9show/src/services/database/queries/showQueries.ts \
       apps/myk9show/src/test/services/database/queries/showQueries.replication.test.ts
git commit -m "refactor(queries): migrate showQueries SELECTs to replication store"
```

---

## Task 2: Migrate trialQueries.ts

**Files:**

- Create: `apps/myk9show/src/services/mappers/trialMappers.ts`
- Create: `apps/myk9show/src/test/services/database/queries/trialQueries.replication.test.ts`
- Modify: `apps/myk9show/src/services/database/queries/trialQueries.ts`

**SELECT functions to migrate:** `getAllTrials`, `getTrialById`, `getTrialsByShow`, `searchTrials`, `getTrialsByStatus`, `getUpcomingTrials`, `getTrialsByDateRange`, `getTrialStatistics`

**Functions staying on PostgREST:** `createTrial`, `updateTrial`, `deleteTrial`, `hardDeleteTrial`, `restoreTrial`, `getDeletedTrials`

- [ ] **Step 1: Write trialMappers.ts**

Read these files first:

- `apps/myk9show/src/services/database/queries/trialQueries.ts` — see `.select()` strings (trials join `show:shows(id,name,start_date,end_date)`)
- `apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts` — see `ReplicatedTrial` fields

The mapper converts `ReplicatedTrial` + joined show data to the snake_case row shape. The `show` join is nested under the `show` alias key.

- [ ] **Step 2: Write tests for migrated trial query functions**

Create `apps/myk9show/src/test/services/database/queries/trialQueries.replication.test.ts`.

Mock `replicatedTrialsTable` and `replicatedShowsTable`. Test each migrated SELECT function returns correct shape, filters, sorting, limits, and statistics aggregation.

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/trialQueries.replication.test.ts
```

- [ ] **Step 4: Rewrite SELECT functions in trialQueries.ts**

Key patterns:

- `getAllTrials()`: `replicatedTrialsTable.getAll()` + filter `deleted_at` (already clean from sync) + join show via `replicatedShowsTable.get(trial.showId)` + sort by date + map
- `getTrialsByShow(showId)`: `replicatedTrialsTable.getTrialsByShow(showId)` + join show + map
- `searchTrials(term)`: getAll + filter name ilike + join + map
- `getTrialStatistics()`: getAll + count total + aggregate byStatus in JS
- `getUpcomingTrials(limit?)`: getAll + filter date >= today + sort + limit + join + map

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/trialQueries.replication.test.ts
```

- [ ] **Step 6: Run full test suite for regressions**

```bash
cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/services/mappers/trialMappers.ts \
       apps/myk9show/src/services/database/queries/trialQueries.ts \
       apps/myk9show/src/test/services/database/queries/trialQueries.replication.test.ts
git commit -m "refactor(queries): migrate trialQueries SELECTs to replication store"
```

---

## Task 3: Migrate classQueries.ts

**Files:**

- Create: `apps/myk9show/src/services/mappers/classMappers.ts`
- Create: `apps/myk9show/src/test/services/database/queries/classQueries.replication.test.ts`
- Modify: `apps/myk9show/src/services/database/queries/classQueries.ts`

**SELECT functions to migrate:** `getAllClasses`, `getClassById`, `getClassesByTrialId`, `searchClasses`, `getClassStatistics`

**Functions staying on PostgREST:** `createClass`, `updateClass`, `deleteClass`, `hardDeleteClass`, `restoreClass`, `getDeletedClasses`

- [ ] **Step 1: Write classMappers.ts**

Read these files first:

- `apps/myk9show/src/services/database/queries/classQueries.ts` — see `.select()` strings. `getAllClasses` joins `trial:trials(...)`, `entries(id)` (for count), and `judge_assignments!judge_assignments_class_id_fkey(person_id, people(first_name, last_name))`. `getClassById` has deeper joins including `entries(..., dog:dogs(..., owner:people(...)))`.
- `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts` — see `ReplicatedClass` fields (includes `judgeName`, `judgeId` already denormalized from sync)

The mapper must handle two shapes:

1. List shape (for `getAllClasses`, `getClassesByTrialId`): class + trial + entry count + judge info
2. Detail shape (for `getClassById`): class + trial + full entries with dog/owner joins

- [ ] **Step 2: Write tests**

Create `apps/myk9show/src/test/services/database/queries/classQueries.replication.test.ts`.

Mock `replicatedClassesTable`, `replicatedTrialsTable`, `replicatedEntriesTable`, `replicatedDogsTable`. Test each SELECT function, paying special attention to:

- Entry count calculation (count of entries matching class_id)
- Judge name resolution from `ReplicatedClass.judgeName` or from `replicatedJudgeAssignmentsTable`
- Search across name/level/description fields
- The detail shape with nested entries+dogs for `getClassById`

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/classQueries.replication.test.ts
```

- [ ] **Step 4: Rewrite SELECT functions in classQueries.ts**

Key patterns:

- `getAllClasses()`: `replicatedClassesTable.getAll()` + for each class, count entries via `replicatedEntriesTable.getEntriesByClass(classId)` + join trial + map
- `getClassById(id)`: `replicatedClassesTable.get(id)` + get entries with dog joins + join trial + map to detail shape
- `getClassesByTrialId(trialId)`: `replicatedClassesTable.getClassesByTrial(trialId)` + count entries + map
- `searchClasses(term, limit)`: getAll + filter name/level/description + limit + map
- `getClassStatistics()`: getAll + return count

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/classQueries.replication.test.ts
```

- [ ] **Step 6: Run full test suite for regressions**

```bash
cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/services/mappers/classMappers.ts \
       apps/myk9show/src/services/database/queries/classQueries.ts \
       apps/myk9show/src/test/services/database/queries/classQueries.replication.test.ts
git commit -m "refactor(queries): migrate classQueries SELECTs to replication store"
```

---

## Task 4: Migrate entry-query-lookups.ts and entry-query-search.ts

**Files:**

- Create: `apps/myk9show/src/services/mappers/entryMappers.ts`
- Create: `apps/myk9show/src/test/services/database/queries/entryQueries.replication.test.ts`
- Modify: `apps/myk9show/src/services/database/queries/entry-query-lookups.ts`
- Modify: `apps/myk9show/src/services/database/queries/entry-query-search.ts`

**SELECT functions to migrate (entry-query-lookups.ts):** `getAllEntries`, `getEntryById`, `getEntriesByShow`, `getEntriesByShowForFinancials`, `getEntriesByTrial`, `getEntriesByClass`, `getEntriesByDog`, `getEntriesByStatus`

**SELECT functions to migrate (entry-query-search.ts):** `getEntryStatistics`, `getUserEntries`, `searchEntries`, `canModifyEntry`

**Internal helper to migrate:** `fetchMissingArmbands` — currently queries `armbands` table via PostgREST; after Task 6, this can read from `replicatedArmbandsTable` instead. For now, keep it on PostgREST as a temporary bridge until Task 6 completes.

**Functions staying on PostgREST:** All mutations in `entry-query-mutations.ts`

- [ ] **Step 1: Write entryMappers.ts**

Read these files first:

- `apps/myk9show/src/services/database/queries/entry-query-lookups.ts` — see `.select()` strings. Entries join `dog:dog_id(...)`, `class:class_id(...)`, `show:show_id(...)`. The financial query also joins `promo_code:promo_code_id(...)` and `trial:trial_id(...)`.
- `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts` — see `ReplicatedEntry` fields (includes both camelCase and snake_case aliases)

The mapper must handle multiple join shapes:

1. Standard: entry + dog + class + show
2. Financial: entry + dog + class + promo_code + trial. [ADDED] `promo_codes` is not replicated — use a targeted PostgREST batch query: collect unique `promo_code_id` values from entries, then `supabase.from('promo_codes').select('id, code, discount_type, discount_value').in('id', promoCodeIds)`. Attach results to entries via Map lookup. This keeps the function's return shape identical.
3. By-class: entry + dog (plus armband backfill)
4. By-dog: entry + class + show

For `getEntriesByShowForFinancials` which joins `promo_codes` (not replicated): use a hybrid approach — read entries from replication, but keep the promo_code join as a PostgREST lookup or omit it (check if consumers actually use the promo_code data).

- [ ] **Step 2: Write tests**

Create `apps/myk9show/src/test/services/database/queries/entryQueries.replication.test.ts`.

Mock `replicatedEntriesTable`, `replicatedDogsTable`, `replicatedClassesTable`, `replicatedShowsTable`, `replicatedTrialsTable`. Test:

- Each SELECT function returns correct shape with joins
- `getEntriesByTrial` filters entries where class.trial_id matches (inner join behavior)
- `getEntriesByClass` sorts by run_order (nulls last)
- `getEntryStatistics` aggregates correctly (byStatus counts, revenue calculations)
- `getUserEntries` filters by handler_id
- `searchEntries` searches armband/handler fields
- `canModifyEntry` reads show status from replication

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/entryQueries.replication.test.ts
```

- [ ] **Step 4: Rewrite SELECT functions**

Key patterns for entry-query-lookups.ts:

- `getAllEntries()`: `replicatedEntriesTable.getAll()` + join dog/class/show from respective replicated tables + sort by created_at desc + map
- `getEntriesByShow(showId)`: `replicatedEntriesTable.getEntriesByShow(showId)` + join dog/class + map
- `getEntriesByTrial(trialId)`: get all entries + get classes for trial via `replicatedClassesTable.getClassesByTrial(trialId)` + filter entries by class_id in that set + join + map
- `getEntriesByClass(classId)`: `replicatedEntriesTable.getEntriesByClass(classId)` + join dog + sort by runOrder (nulls last) + map. Keep `fetchMissingArmbands` on PostgREST for now.
- `getEntriesByDog(dogId)`: getAll + filter by dogId + join class/show + map
- `getEntriesByStatus(status)`: getAll + filter by entryStatus + join + map
- `getEntriesByShowForFinancials(showId)`: same as getEntriesByShow but include trial join. For promo_code data, keep a targeted PostgREST query or omit if unused.

Key patterns for entry-query-search.ts:

- `getEntryStatistics(showId?)`: get entries (optionally filtered by show) + aggregate in JS: count by status, sum fees, calculate completion rate
- `getUserEntries(userId)`: getAll + filter by handlerId + join + map
- `searchEntries(term)`: getAll + filter armband/handler ilike + limit 50 + join + map
- `canModifyEntry(showId)`: `replicatedShowsTable.get(showId)` + check entryCloseDate and status

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/entryQueries.replication.test.ts
```

- [ ] **Step 6: Run full test suite for regressions**

```bash
cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/services/mappers/entryMappers.ts \
       apps/myk9show/src/services/database/queries/entry-query-lookups.ts \
       apps/myk9show/src/services/database/queries/entry-query-search.ts \
       apps/myk9show/src/test/services/database/queries/entryQueries.replication.test.ts
git commit -m "refactor(queries): migrate entry query SELECTs to replication store"
```

---

## Task 5: Migrate dogQueries.ts

**Files:**

- Modify: `apps/myk9show/src/services/mappers/dogMappers.ts` (already exists — add new mapper functions)
- Create: `apps/myk9show/src/test/services/database/queries/dogQueries.replication.test.ts`
- Modify: `apps/myk9show/src/services/database/queries/dogQueries.ts`

**SELECT functions to migrate:** `getAllDogs`, `getDogById`, `getDogsByOwner`, `searchDogs`, `getDogsWithUpcomingShows`, `getDogStatistics`

**Functions staying on PostgREST:** `createDog`, `updateDog`, `deleteDog` (RPC `soft_delete_dog`), `hardDeleteDog`, `restoreDog`, `getDeletedDogs`

**People joins:** `getAllDogs` and `getDogById` join `owner:people(...)`. Strategy:

- `getAllDogs`: use `mapReplicatedDogToDbRow` (already exists in `dogMappers.ts`) — owner data is minimal, can be omitted or fetched via PostgREST fallback if consumers need it
- `getDogById`: deep joins to owner, registrations, health_records, entries. Keep a PostgREST fallback for the owner/registrations/health_records joins since those tables aren't replicated. Read from replication for the base dog + entries data.

- [ ] **Step 1: Update dogMappers.ts**

Read `apps/myk9show/src/services/mappers/dogMappers.ts` first — the `mapReplicatedDogToDbRow` function already exists. Determine if it needs updates to support the full `getAllDogs` return shape (which includes nested `owner` and `registrations` objects).

Add any missing mapper functions. For `getDogById` which joins health_records and entries, create a `mapReplicatedDogToDetailRow()` that combines replicated dog data with entry data from `replicatedEntriesTable`.

- [ ] **Step 2: Write tests**

Create `apps/myk9show/src/test/services/database/queries/dogQueries.replication.test.ts`.

Mock `replicatedDogsTable` and `replicatedEntriesTable`. Test:

- `getAllDogs(personId)` filters by ownerId OR coOwnerId, sorts by name
- `getDogsByOwner(ownerId)` filters by ownerId only
- `searchDogs(term, personId)` searches name/breed/callName + ownership filter
- `getDogStatistics(personId)` returns correct count
- `getDogsWithUpcomingShows(personId)` returns dogs with ownership filter
- People join handling — verify the shape includes owner data (from PostgREST fallback or mapped)

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/dogQueries.replication.test.ts
```

- [ ] **Step 4: Rewrite SELECT functions in dogQueries.ts**

Key patterns:

- `getAllDogs(personId)`: `replicatedDogsTable.getAllDogs()` + filter where ownerId === personId OR coOwnerId === personId + sort by name + map. For owner join: use PostgREST `supabase.from('people').select('id, first_name, last_name, email, phone').in('id', ownerIds)` as fallback.
- `getDogsByOwner(ownerId)`: `replicatedDogsTable.getDogsByOwner(ownerId)` + map (no joins needed — minimal query)
- `searchDogs(term, personId)`: `replicatedDogsTable.searchDogs(term)` + filter by ownership + map
- `getDogsWithUpcomingShows(personId)`: `replicatedDogsTable.getAllDogs()` + ownership filter + map (owner name from PostgREST fallback)
- `getDogStatistics(personId)`: `replicatedDogsTable.getAllDogs()` + ownership filter + return `{ data: { total: count }, error: null }`
- `getDogById(id)`: Hybrid — read base dog from `replicatedDogsTable.get(id)`, read entries from `replicatedEntriesTable`, but keep PostgREST for owner details, registrations, and health_records (not replicated)

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/dogQueries.replication.test.ts
```

- [ ] **Step 6: Run full test suite for regressions**

```bash
cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/services/mappers/dogMappers.ts \
       apps/myk9show/src/services/database/queries/dogQueries.ts \
       apps/myk9show/src/test/services/database/queries/dogQueries.replication.test.ts
git commit -m "refactor(queries): migrate dogQueries SELECTs to replication store"
```

---

## Task 6: Create ReplicatedArmbandsTable and Migrate armbandQueries.ts

**Files:**

- Create: `apps/myk9show/src/services/replication/ReplicatedArmbandsTable.ts`
- Create: `apps/myk9show/src/services/mappers/armbandMappers.ts`
- Create: `apps/myk9show/src/test/services/database/queries/armbandQueries.replication.test.ts`
- Modify: `apps/myk9show/src/services/database/queries/armbandQueries.ts`
- Modify: `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`

**SELECT functions to migrate:** `getArmbandCountForShow`, `lookupDogByArmband`

**Functions staying on PostgREST:** `assignArmband` (RPC call)

- [ ] **Step 0: [ADDED] Verify `updated_at` columns and bump IndexedDB schema version**

Before creating new replicated tables, verify the prerequisite columns exist:

1. Check `armbands` table has an `updated_at` column: `grep -r 'armbands' supabase/migrations/ | grep updated_at`. If missing, create a migration adding `updated_at timestamptz DEFAULT now()` with a trigger to auto-update on row change. Same for `waitlist_entries`.
2. Bump `DB_VERSION` in `packages/replication/src/constants.ts` (currently 5, increment to 6).
3. Update `DatabaseManager.ts` to create the new IndexedDB object stores for `armbands` and `waitlist_entries` in the version upgrade handler. Add compound indexes for `showId` and `dogId` (armbands) and `classId` and `dogId` (waitlist_entries).
4. Update `TOTAL_REPLICATED_TABLES` constant from current value to +2.

Run: `cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20` to verify nothing breaks.

Commit: `git commit -m "chore(replication): bump DB_VERSION and add stores for armbands/waitlist"`

- [ ] **Step 1: Create ReplicatedArmbandsTable**

Read an existing replicated table as a template — `apps/myk9show/src/services/replication/ReplicatedClubsTable.ts` is the simplest.

Create `ReplicatedArmbandsTable` extending `ReplicatedTable<ReplicatedArmband>`:

```typescript
export interface ReplicatedArmband {
  id: string;
  showId: string;
  dogId: string;
  armbandNumber: string;
  assignedAt?: string;
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}
```

- Table name: `armbands`
- Indexes: `showId`, `dogId`
- Sync query: `supabase.from('armbands').select('*').gt('updated_at', lastSync)` — no licenseKey filter (small table per show)
- Conflict resolution: server-authoritative (`return remote`)
- Custom methods: `getByShow(showId)`, `getByDog(dogId)`, `lookupByArmbandNumber(showId, armbandNumber)`
- Export singleton: `replicatedArmbandsTable`

- [ ] **Step 2: Register in ReplicationSyncProvider**

Read `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`. Add `replicatedArmbandsTable` to the `REPLICATED_TABLES` array. Import from the new file.

- [ ] **Step 3: Write armbandMappers.ts**

Read `apps/myk9show/src/services/database/queries/armbandQueries.ts` to see the exact return shapes of `lookupDogByArmband` — it returns a composite object with armband info, dog info, owner info, and entries with class names.

Create mapper that assembles this shape from `ReplicatedArmband` + `ReplicatedDog` + `ReplicatedEntry[]` + people data (PostgREST fallback for owner).

- [ ] **Step 4: Write tests**

Create `apps/myk9show/src/test/services/database/queries/armbandQueries.replication.test.ts`.

Mock `replicatedArmbandsTable`, `replicatedDogsTable`, `replicatedEntriesTable`, `replicatedClassesTable`. Test:

- `getArmbandCountForShow(showId)` returns correct count
- `lookupDogByArmband(showId, armbandNumber)` returns composite shape with dog/owner/entries
- Missing armband returns null

- [ ] **Step 5: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/armbandQueries.replication.test.ts
```

- [ ] **Step 6: Rewrite SELECT functions in armbandQueries.ts**

Key patterns:

- `getArmbandCountForShow(showId)`: `replicatedArmbandsTable.getByShow(showId)` + return `{ count: results.length, error: null }`
- `lookupDogByArmband(showId, armbandNumber)`: `replicatedArmbandsTable.lookupByArmbandNumber(showId, armbandNumber)` + join dog via `replicatedDogsTable.get(armband.dogId)` + join entries via `replicatedEntriesTable.getEntriesByShow(showId)` filtered to dogId + join class names via `replicatedClassesTable` + owner via PostgREST fallback + map

- [ ] **Step 7: Update fetchMissingArmbands in entry-query-lookups.ts**

Now that `ReplicatedArmbandsTable` exists, update the `fetchMissingArmbands` helper in `entry-query-lookups.ts` to read from `replicatedArmbandsTable.getByShow(showId)` instead of PostgREST.

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/armbandQueries.replication.test.ts
```

- [ ] **Step 9: Run full test suite for regressions**

```bash
cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20
```

- [ ] **Step 10: Commit**

```bash
git add apps/myk9show/src/services/replication/ReplicatedArmbandsTable.ts \
       apps/myk9show/src/services/mappers/armbandMappers.ts \
       apps/myk9show/src/services/database/queries/armbandQueries.ts \
       apps/myk9show/src/services/database/queries/entry-query-lookups.ts \
       apps/myk9show/src/providers/ReplicationSyncProvider.tsx \
       apps/myk9show/src/test/services/database/queries/armbandQueries.replication.test.ts
git commit -m "feat(replication): add ReplicatedArmbandsTable and migrate armbandQueries"
```

---

## Task 7: Create ReplicatedWaitlistEntriesTable and Migrate waitlistQueries.ts

**Files:**

- Create: `apps/myk9show/src/services/replication/ReplicatedWaitlistEntriesTable.ts`
- Create: `apps/myk9show/src/services/mappers/waitlistMappers.ts`
- Create: `apps/myk9show/src/test/services/database/queries/waitlistQueries.replication.test.ts`
- Modify: `apps/myk9show/src/services/database/queries/waitlistQueries.ts`
- Modify: `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`

**SELECT functions to migrate:** `getWaitlistByShow`, `getWaitlistByClass`, `getClassesWithWaitlistCounts`, `getWaitlistPosition`

**Functions staying on PostgREST:** `offerWaitlistSpot` (UPDATE), `removeFromWaitlist` (DELETE), `joinWaitlist` (INSERT), `acceptWaitlistOffer` (SELECT + INSERT + DELETE — complex mutation)

- [ ] **Step 1: Create ReplicatedWaitlistEntriesTable**

```typescript
export interface ReplicatedWaitlistEntry {
  id: string;
  classId: string;
  dogId: string;
  exhibitorId?: string;
  handlerId?: string;
  position: number;
  status: string; // 'waiting' | 'offered' | 'accepted' | 'expired' | 'declined'
  offeredAt?: string;
  offerExpiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}
```

- Table name: `waitlist_entries`
- Indexes: `classId`, `dogId`
- Sync query: `supabase.from('waitlist_entries').select('*').gt('updated_at', lastSync)`
- Conflict resolution: server-authoritative
- Custom methods: `getByClass(classId)`, `getByDog(dogId)`, `getById(id)`
- Export singleton: `replicatedWaitlistEntriesTable`

- [ ] **Step 2: Register in ReplicationSyncProvider**

Add `replicatedWaitlistEntriesTable` to the `REPLICATED_TABLES` array in `ReplicationSyncProvider.tsx`.

- [ ] **Step 3: Write waitlistMappers.ts**

Read `apps/myk9show/src/services/database/queries/waitlistQueries.ts` for return shapes. Waitlist entries join `dog:dog_id(id, name, call_name)` and `class:class_id(id, name, class_number, max_entries)`.

Create mapper that assembles from `ReplicatedWaitlistEntry` + `ReplicatedDog` + `ReplicatedClass`.

- [ ] **Step 4: Write tests**

Create `apps/myk9show/src/test/services/database/queries/waitlistQueries.replication.test.ts`.

Mock `replicatedWaitlistEntriesTable`, `replicatedDogsTable`, `replicatedClassesTable`, `replicatedTrialsTable`, `replicatedEntriesTable`. Test:

- `getWaitlistByShow(showId)` chains through trials → classes → waitlist entries, sorted by position
- `getWaitlistByClass(classId)` returns sorted entries with dog/class joins
- `getClassesWithWaitlistCounts(showId)` returns classes with computed `accepted_count` and `waitlist_count`
- `getWaitlistPosition(id)` returns position number

- [ ] **Step 5: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/waitlistQueries.replication.test.ts
```

- [ ] **Step 6: Rewrite SELECT functions in waitlistQueries.ts**

Key patterns:

- `getWaitlistByShow(showId)`: `replicatedTrialsTable.getTrialsByShow(showId)` → collect trialIds → `replicatedClassesTable.getAll()` filtered by trialIds → collect classIds → `replicatedWaitlistEntriesTable.getAll()` filtered by classIds → join dog/class → sort by position → map
- `getWaitlistByClass(classId)`: `replicatedWaitlistEntriesTable.getByClass(classId)` → join dog/class → sort by position → map
- `getClassesWithWaitlistCounts(showId)`: get trials → get classes → for each class, count entries from `replicatedEntriesTable.getEntriesByClass()` where status=accepted + count from `replicatedWaitlistEntriesTable.getByClass()` → map with counts
- `getWaitlistPosition(id)`: `replicatedWaitlistEntriesTable.getById(id)` → return position

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/waitlistQueries.replication.test.ts
```

- [ ] **Step 8: Run full test suite for regressions**

```bash
cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20
```

- [ ] **Step 9: Commit**

```bash
git add apps/myk9show/src/services/replication/ReplicatedWaitlistEntriesTable.ts \
       apps/myk9show/src/services/mappers/waitlistMappers.ts \
       apps/myk9show/src/services/database/queries/waitlistQueries.ts \
       apps/myk9show/src/providers/ReplicationSyncProvider.tsx \
       apps/myk9show/src/test/services/database/queries/waitlistQueries.replication.test.ts
git commit -m "feat(replication): add ReplicatedWaitlistEntriesTable and migrate waitlistQueries"
```

---

## Task 8: Integration Verification

**Files:** None created or modified — verification only.

- [ ] **Step 1: Run full test suite**

```bash
cd apps/myk9show && pnpm test
```

All tests should pass. If any fail, investigate and fix.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

No type errors should be introduced.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

- [ ] **Step 4: Build**

```bash
pnpm build
```

Verify both apps build successfully.

- [ ] **Step 5: Verify dev server starts**

```bash
pnpm dev:show &
# Wait for "ready" message, then kill
```

Quick smoke check that the app boots without runtime errors.

- [ ] **Step 6: Final commit (if any fixes needed)**

If any fixes were needed during verification, commit them:

```bash
git add -A
git commit -m "fix: address integration issues from PostgREST-to-replication migration"
```
