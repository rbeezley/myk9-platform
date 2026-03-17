# Replicate `judge_assignments` for Offline-First Judge Data

**Date:** 2026-03-17
**Status:** Draft

## Problem

The `judge_assignments` table is not replicated for offline use. The Zustand `showStore` hardcodes `assignedJudges: []` when hydrating from the replication layer because judge data lives in a separate table that the replication layer doesn't sync. Judge data is only available via React Query (online-only), which breaks the offline-first contract.

This causes the wizard's class selection step to show no judge dropdowns when entering edit mode, because the Zustand show (with empty `assignedJudges`) takes priority over the React Query show (with populated `assignedJudges`).

## Design

### New File: `ReplicatedJudgeAssignmentsTable.ts`

Follow the existing pattern from `ReplicatedTrialsTable.ts`.

**Interface: `ReplicatedJudgeAssignment`**

Maps to the `judge_assignments` DB schema:

| App field     | DB column      | Type                                                                        |
| ------------- | -------------- | --------------------------------------------------------------------------- |
| `id`          | `id`           | `string` (UUID)                                                             |
| `personId`    | `person_id`    | `string` (UUID, FK to people)                                               |
| `showId`      | `show_id`      | `string \| null` (UUID, FK to shows)                                        |
| `trialId`     | `trial_id`     | `string \| null` (UUID, FK to trials)                                       |
| `classId`     | `class_id`     | `string \| null` (UUID, FK to classes)                                      |
| `status`      | `status`       | `string \| null` (`invited`, `confirmed`, `declined`, `cancelled`)          |
| `invitedAt`   | `invited_at`   | `string \| null` (ISO timestamp)                                            |
| `confirmedAt` | `confirmed_at` | `string \| null` (ISO timestamp)                                            |
| `fee`         | `fee`          | `number \| null`                                                            |
| `notes`       | `notes`        | `string \| null`                                                            |
| Sync metadata | —              | `_version`, `_lastModified`, `_lastModifiedBy`, `_syncStatus`, `_localOnly` |

Note: `createdAt`/`updatedAt` are omitted from the interface, following the existing pattern (e.g. `ReplicatedTrialsTable`) which only carries sync metadata, not DB audit timestamps.

**`sync()` method:** No `licenseKey` filter — sync all `judge_assignments` rows. The table is small (tens of rows per show) and scoping by show would require passing a show ID, which the sync provider doesn't have. Same approach as `ReplicatedClubsTable`.

**Methods:**

- `sync()` — incremental download from Supabase, server-authoritative conflict resolution
- `rowToJudgeAssignment(row)` — DB row to app type (snake_case to camelCase)
- `toSupabaseRow(assignment)` — app type to DB row for INSERT/UPDATE
- `getByShowId(showId)` — filter cached assignments by show
- `getByPersonId(personId)` — filter cached assignments by judge
- `createAssignment(data)` — create new assignment
- `updateAssignment(id, data)` — update existing assignment
- `deleteAssignment(id)` — delete assignment

**Singleton export:** `replicatedJudgeAssignmentsTable`

### Register in `ReplicationSyncProvider.tsx`

Add to the `REPLICATED_TABLES` array (after `clubs`):

```typescript
{ name: 'judge_assignments', table: replicatedJudgeAssignmentsTable },
```

Also add React Query cache invalidation for `judge_assignments` in the post-sync callback, consistent with other tables.

### Export from `services/replication/index.ts`

Add the new table and type to the barrel export.

### Mapping: `ReplicatedJudgeAssignment[]` to `ShowJudgeAssignment[]`

Add a helper function `buildAssignedJudges(assignments, people)` that:

1. Filters replicated assignments for a given `showId`
2. Groups by `personId` (one judge may have multiple class-level assignments)
3. Maps each group to a `ShowJudgeAssignment`:
   - `judgeId` = `personId`
   - `judgeName` = look up from `people` array by matching `person.id === personId`, format as `"firstName lastName"`. Fall back to `"Unknown Judge"` if not found.
   - `assignedDate` = `confirmedAt || createdAt` from the first assignment in the group (or today's date as fallback)
   - `assignedClasses` = collect all `classId` values from the group (filter nulls)

This function lives in `showStore.ts` (private helper) since it's only used there.

### Update `showStore.ts`

**Add a second subscription** to `replicatedJudgeAssignmentsTable` inside the existing `initializeSubscription()` method (alongside the `replicatedShowsTable` subscription). When judge assignments change, re-compute `assignedJudges` for all affected shows using `buildAssignedJudges()`.

**Implementation approach:**

1. Store keeps a private `judgeAssignmentsCache: ReplicatedJudgeAssignment[]` populated by the subscription
2. Whenever shows OR judge assignments update, re-run `buildAssignedJudges()` for each show and merge the result into the show's `assignedJudges` field
3. Remove the `assignedJudges: []` hardcode from `replicatedToShow()`
4. In `mergeShowData()`, preserve `assignedJudges` from the replicated source (not empty-override)

**Judge name resolution timing:** The `people` store data comes from `useUserStore`, which persists to localStorage. On a fresh session, people may not be loaded yet when judge assignments sync. This is acceptable — shows will initially display `"Unknown Judge"` and update to real names once people data loads. The subscription approach means any people data update that triggers a re-render will pick up the correct names.

### Update `ShowCreationWizardPage.tsx`

Revert the React Query preference hack added earlier in this session. The Zustand source will now have correct judge data, so the original `allShows.find()` lookup works correctly.

## Scope

- No database migrations needed — the `judge_assignments` table already exists.
- No UI changes — the judge dropdowns in the wizard already work when `availableJudges` is populated. This change ensures the data is available offline.
- No changes to the React Query path — it continues to work as before for online scenarios. Note: the React Query path resolves judge names from the SQL join, while the replicated path resolves from the people store. Both produce the same `ShowJudgeAssignment` shape. Names may differ momentarily if people data is stale in the store, but this is acceptable for offline-first trade-offs.

## Testing

**Unit tests for `ReplicatedJudgeAssignmentsTable`:**

- `rowToJudgeAssignment` correctly maps snake_case DB row to camelCase app type
- `toSupabaseRow` correctly maps back
- `getByShowId` filters correctly
- `getByPersonId` filters correctly
- CRUD operations (create, update, delete) work with the local cache

**Unit tests for `buildAssignedJudges` mapping:**

- Groups multiple assignments by `personId` into one `ShowJudgeAssignment`
- Resolves judge name from people array
- Falls back to `"Unknown Judge"` when person not found
- Collects `classId` values into `assignedClasses`, filtering nulls
- Uses `confirmedAt` for `assignedDate`, falls back to today

**Integration verification:**

- Judge dropdowns appear in the wizard's class selection step when entering via "Add Trial" on show detail page
- `assignedJudges` is populated on shows from the Zustand store after sync
- Sync provider includes `judge_assignments` in its cycle
- Update existing `showStore.test.tsx` to account for `assignedJudges` no longer being hardcoded `[]`
