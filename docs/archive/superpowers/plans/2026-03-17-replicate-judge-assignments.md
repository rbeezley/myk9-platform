# Replicate Judge Assignments Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate the `judge_assignments` table offline-first so judge dropdowns work in the wizard without online connectivity.

**Architecture:** Create a `ReplicatedJudgeAssignmentsTable` following the `ReplicatedClubsTable` pattern (no licenseKey filter). Register it in the sync provider. Update `showStore` to subscribe to judge assignment changes and populate `assignedJudges` on each show by joining replicated assignments with the people store. Revert the temporary React Query preference hack in the wizard.

**Tech Stack:** TypeScript, Zustand, Supabase, `@myk9/replication` (ReplicatedTable base class), Vitest

**Spec:** `docs/superpowers/specs/2026-03-17-replicate-judge-assignments-design.md`

---

### Task 1: Create `ReplicatedJudgeAssignmentsTable`

**Files:**

- Create: `apps/myk9show/src/services/replication/ReplicatedJudgeAssignmentsTable.ts`

**Pattern reference:** `apps/myk9show/src/services/replication/ReplicatedClubsTable.ts` (syncs without licenseKey filter)

- [ ] **Step 1: Create the interface and converter**

```typescript
// ReplicatedJudgeAssignment interface
export interface ReplicatedJudgeAssignment {
  id: string;
  personId: string;
  showId: string | null;
  trialId: string | null;
  classId: string | null;
  status: string | null;
  invitedAt: string | null;
  confirmedAt: string | null;
  fee: number | null;
  notes: string | null;
  // Sync metadata
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'conflict';
  _localOnly: boolean;
}
```

The `rowToJudgeAssignment(row)` function maps snake_case DB columns to camelCase fields. Follow the `rowToTrial` pattern from `ReplicatedTrialsTable.ts:56-81`.

The `toSupabaseRow(assignment)` method maps back to snake_case for INSERT/UPDATE. Follow the `toSupabaseRow` pattern from `ReplicatedTrialsTable.ts:116-138`.

- [ ] **Step 2: Create the class**

```typescript
export class ReplicatedJudgeAssignmentsTable extends ReplicatedTable<ReplicatedJudgeAssignment> {
  // ...
}
```

- Constructor: `super('judge_assignments', undefined, { logger })`
- `sync(_licenseKey?: string)`: No filter — sync all rows. Follow `ReplicatedClubsTable.ts:135-246` pattern. **Important:** Do NOT add `.is('deleted_at', null)` filter — `judge_assignments` uses hard deletes (`ON DELETE CASCADE`), not soft deletes. **[ADDED]** Hard-deleted rows are cleaned up automatically: the `ReplicatedTable` base class's `sync()` replaces the full local cache with the server response, so deleted rows disappear on the next sync cycle. Between syncs, stale rows may linger in the local cache (accepted trade-off).
- `resolveConflict()`: Server-authoritative (return remote), same as `ReplicatedTrialsTable.ts:231-233`.
- Domain methods: `getByShowId(showId)`, `getByPersonId(personId)` — filter the local cache.
- CRUD: `createAssignment()`, `updateAssignment()`, `deleteAssignment()` — follow `ReplicatedTrialsTable.ts:266-324` pattern.
- Singleton: `export const replicatedJudgeAssignmentsTable = new ReplicatedJudgeAssignmentsTable();`

- [ ] **Step 3: Verify typecheck passes**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/services/replication/ReplicatedJudgeAssignmentsTable.ts
git commit -m "feat: add ReplicatedJudgeAssignmentsTable for offline-first judge data"
```

---

### Task 2: Register in Replication Infrastructure

**Files:**

- Modify: `apps/myk9show/src/services/replication/index.ts`
- Modify: `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`

- [ ] **Step 1: Export from replication barrel**

Add to `apps/myk9show/src/services/replication/index.ts`:

```typescript
export {
  ReplicatedJudgeAssignmentsTable,
  replicatedJudgeAssignmentsTable,
  type ReplicatedJudgeAssignment,
} from './ReplicatedJudgeAssignmentsTable';
```

- [ ] **Step 2: Register in ReplicationSyncProvider**

In `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`:

1. Import `replicatedJudgeAssignmentsTable` from the replication barrel.
2. Add to the `REPLICATED_TABLES` array (after `clubs`, around line 59):
   ```typescript
   { name: 'judge_assignments', table: replicatedJudgeAssignmentsTable },
   ```
3. Add React Query cache invalidation (around line 234-239). Also re-invalidate `['shows']` since the shows query includes a judge_assignments join:
   ```typescript
   queryClient.invalidateQueries({ queryKey: ['judge_assignments'] });
   queryClient.invalidateQueries({ queryKey: ['shows'] }); // refresh shows with updated judge join
   ```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/services/replication/index.ts apps/myk9show/src/providers/ReplicationSyncProvider.tsx
git commit -m "feat: register judge_assignments in replication sync provider"
```

---

### Task 3: Update `showStore` to Populate `assignedJudges`

**Files:**

- Modify: `apps/myk9show/src/store/showStore.ts` (lines 26-61, 67-83, 517-544)

This is the core integration. The store needs to:

1. Subscribe to `replicatedJudgeAssignmentsTable`
2. Build `assignedJudges` by joining replicated assignments with people data

- [ ] **Step 1: Add the `buildAssignedJudges` helper**

Add a private helper function near the top of `showStore.ts` (after imports, before the store definition):

```typescript
import {
  replicatedJudgeAssignmentsTable,
  type ReplicatedJudgeAssignment,
} from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import type { ShowJudgeAssignment } from '@/types/judge-types';

function buildAssignedJudges(
  assignments: ReplicatedJudgeAssignment[],
  showId: string,
  people: Array<{ id: string; firstName: string; lastName: string }>
): ShowJudgeAssignment[] {
  const showAssignments = assignments.filter(a => a.showId === showId);

  // Group by personId
  const byPerson = new Map<string, ReplicatedJudgeAssignment[]>();
  for (const a of showAssignments) {
    const group = byPerson.get(a.personId) || [];
    group.push(a);
    byPerson.set(a.personId, group);
  }

  return Array.from(byPerson.entries()).map(([personId, group]) => {
    const person = people.find(p => p.id === personId);
    const judgeName = person ? `${person.firstName} ${person.lastName}`.trim() : 'Unknown Judge';
    const firstAssignment = group[0];

    return {
      judgeId: personId,
      judgeName,
      assignedDate:
        firstAssignment.confirmedAt ||
        firstAssignment.invitedAt ||
        new Date().toISOString().split('T')[0],
      assignedClasses: group.map(a => a.classId).filter((id): id is string => id !== null),
    };
  });
}
```

- [ ] **Step 2: Update `replicatedToShow` and `mergeShowData`**

At line 51 of `showStore.ts`, change the comment:

```typescript
assignedJudges: [], // Populated by judge_assignments subscription
```

This stays `[]` initially — the subscription callback will populate it.

In `mergeShowData()` (around line 79), do NOT preserve `existing.assignedJudges`. The subscription is the source of truth for judge data. Remove or update the `assignedJudges` line so the subscription-populated values take precedence over stale local state.

- [ ] **Step 3: Add judge assignments subscription to `initializeSubscription`**

In the `initializeSubscription()` method (around line 517), add a subscription to `replicatedJudgeAssignmentsTable` alongside the existing `replicatedShowsTable` subscription.

When judge assignments change:

1. Get all judge assignments from the replicated table
2. Get people from `useUserStore.getState().people`
3. For each show in the store, call `buildAssignedJudges()` and update `assignedJudges`

**Important:** `ReplicatedTable.subscribe()` passes the data array directly to the callback (e.g., `subscribe((assignments) => { ... })`). Do NOT call `getAll()` inside the callback — use the data parameter.

```typescript
// Inside initializeSubscription(), after the shows subscription:
const unsubJudgeAssignments = replicatedJudgeAssignmentsTable.subscribe(
  (assignments: ReplicatedJudgeAssignment[]) => {
    const { people } = useUserStore.getState();
    const currentShows = get().shows;

    const updatedShows = currentShows.map(show => ({
      ...show,
      assignedJudges: buildAssignedJudges(assignments, show.id, people),
    }));

    set({ shows: updatedShows });
  }
);
```

**[EXPANDED]** Also update the existing shows subscription callback to populate `assignedJudges` when shows are loaded/updated:

```typescript
const unsubShows = replicatedShowsTable.subscribe(async replicatedShows => {
  // existing merge logic...
  const allAssignments = await replicatedJudgeAssignmentsTable.getAll();
  const { people } = useUserStore.getState();

  const mergedShows = replicatedShows.map(rs => {
    const show = replicatedToShow(rs);
    // ... existing merge logic ...
    show.assignedJudges = buildAssignedJudges(allAssignments, show.id, people);
    return show;
  });

  set({ shows: mergedShows });
});
```

Note: The shows callback uses `getAll()` (not the data parameter) because it needs judge assignments, not shows, and the callback only receives show data.

**Compose cleanup for both subscriptions.** The store currently has a single `_unsubscribe` field. Compose both cleanup functions into one:

```typescript
const unsubShows = replicatedShowsTable.subscribe(shows => {
  /* existing logic + assignedJudges */
});
const unsubJudgeAssignments = replicatedJudgeAssignmentsTable.subscribe(/* as above */);
set({
  _unsubscribe: () => {
    unsubShows();
    unsubJudgeAssignments();
  },
});
```

Note: `useStoreSubscriptions.ts` calls `showStore.initializeSubscription()` — no changes needed there since both subscriptions are wired up inside the same method.

- [ ] **Step 4: Import `useUserStore`**

Add import at top of `showStore.ts`:

```typescript
import { useUserStore } from '@/store/userStore';
```

Verify the import path is correct by checking existing imports in the file.

- [ ] **Step 5: Verify typecheck passes**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/store/showStore.ts
git commit -m "feat: populate assignedJudges from replicated judge_assignments table"
```

---

### Task 4: Revert Wizard React Query Hack

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx` (lines 138-141, 230)

- [ ] **Step 1: Revert the `existingShow` lookup**

At lines 138-141, change:

```typescript
// Prefer React Query show (has assignedJudges from DB join) over Zustand (always [])
const existingShow =
  queryShows.find(s => s.id === editMode.showId) || allShows.find(s => s.id === editMode.showId);
```

back to:

```typescript
const existingShow = allShows.find(s => s.id === editMode.showId);
```

- [ ] **Step 2: Remove `queryShows` from dependency array**

At line 230, change:

```typescript
}, [editMode, allShows, queryShows, existingTrials, loadDraft, people, existingClasses]);
```

to:

```typescript
}, [editMode, allShows, existingTrials, loadDraft, people, existingClasses]);
```

Note: Keep the `allShows` memo and `queryShows` variable — the memo intentionally merges both Zustand and React Query sources for completeness. We're only removing the _preference_ hack that bypassed `allShows` to use `queryShows` directly.

- [ ] **Step 3: Verify typecheck passes**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx
git commit -m "fix: revert wizard React Query hack, judge data now available from replicated store"
```

---

### Task 5: Unit Tests for `ReplicatedJudgeAssignmentsTable`

**Files:**

- Create: `apps/myk9show/src/services/replication/__tests__/ReplicatedJudgeAssignmentsTable.test.ts`

**Pattern reference:** `apps/myk9show/src/services/replication/__tests__/ReplicatedTrialsTable.test.ts`

- [ ] **Step 1: Write tests**

Test the following:

- `rowToJudgeAssignment`: snake_case DB row maps to camelCase interface correctly (including null fields)
- `toSupabaseRow`: camelCase maps back to snake_case for DB insert
- `getByShowId`: returns only assignments matching the given showId
- `getByPersonId`: returns only assignments matching the given personId
- Constructor sets table name to `'judge_assignments'`

Follow the mock setup pattern from `ReplicatedTrialsTable.test.ts` (mock Supabase client, mock logger).

- [ ] **Step 2: Run tests**

Run: `cd apps/myk9show && pnpm test -- --run ReplicatedJudgeAssignmentsTable`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/services/replication/__tests__/ReplicatedJudgeAssignmentsTable.test.ts
git commit -m "test: add unit tests for ReplicatedJudgeAssignmentsTable"
```

---

### Task 6: Unit Tests for `buildAssignedJudges`

**Files:**

- Create: `apps/myk9show/src/utils/buildAssignedJudges.ts` (extract from `showStore.ts` — store is already 554 lines, near 500-line guideline)
- Create: `apps/myk9show/src/test/utils/buildAssignedJudges.test.ts`

- [ ] **Step 1: Extract `buildAssignedJudges` to its own file**

Move the function from `showStore.ts` to `apps/myk9show/src/utils/buildAssignedJudges.ts`. Export it. Update `showStore.ts` to import from the new location.

Test cases:

- Groups multiple assignments by `personId` into one `ShowJudgeAssignment`
- Resolves judge name from people array (`"FirstName LastName"`)
- Falls back to `"Unknown Judge"` when person not found in array
- Collects non-null `classId` values into `assignedClasses`
- Filters null `classId` values from `assignedClasses`
- Uses `confirmedAt` for `assignedDate`, falls back to `invitedAt`, then to today
- Returns empty array when no assignments match the showId
- Handles empty people array gracefully (all judges show as "Unknown Judge")

- [ ] **Step 2: Run tests**

Run: `cd apps/myk9show && pnpm test -- --run buildAssignedJudges`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/utils/buildAssignedJudges.ts apps/myk9show/src/test/utils/buildAssignedJudges.test.ts apps/myk9show/src/store/showStore.ts
git commit -m "test: extract buildAssignedJudges utility and add unit tests"
```

---

### Task 7: Update Existing `showStore` Tests

**Files:**

- Modify: `apps/myk9show/src/test/store/showStore.test.tsx`

- [ ] **Step 1: Update mock show data**

The existing test at line 11-40 has `assignedJudges: []`. Update any tests that verify `replicatedToShow()` output to account for the new subscription-based population of `assignedJudges`. The mock for `replicatedJudgeAssignmentsTable` should return an empty array by default.

Add mock for the new import:

```typescript
vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: {
    getAll: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
}));
```

- [ ] **Step 2: Run all store tests**

Run: `cd apps/myk9show && pnpm test -- --run showStore`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/test/store/showStore.test.tsx
git commit -m "test: update showStore tests for judge_assignments subscription"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 2: Run full lint**

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 3: Run all myk9show tests**

Run: `cd apps/myk9show && pnpm test -- --run`
Expected: All tests PASS

- [ ] **Step 4: Manual verification**

1. Start dev server: `pnpm dev:show`
2. Navigate to a show with assigned judges
3. Click "Add Trial" button on the Trials tab
4. Verify wizard opens at Trial step
5. Add a trial, proceed to Classes step
6. Verify judge dropdowns appear with the show's judges
7. Assign a judge to classes, proceed to Review, verify judges shown

- [ ] **Step 5: Final commit (if any cleanup needed)**

```bash
git commit -m "chore: final cleanup for judge_assignments replication"
```
