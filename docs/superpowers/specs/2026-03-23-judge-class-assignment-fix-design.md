# Fix Judge-to-Class Assignment

## Problem

Assigning a judge to a class does not persist. Three independent failures compound:

1. **Write path broken.** The class edit form saves `judge` (a name string) to `ClassData`, but `mapClassInputToUpdate()` has no mapping for it — the value is silently dropped. The `classes` table has no `judge` or `judge_name` column anyway.
2. **Read path broken.** `mapDatabaseToClass()` hardcodes `judge: 'TBD'`. The replication layer tries to read a `judge_name` column from the `classes` table, but that column does not exist — always returns `undefined`.
3. **Show creation wizard broken.** `classDataToReplicatedClass()` captures `judgeName` locally, but `toSupabaseRow()` never writes it to the database. The wizard calls `persistShowJudgeAssignments()` for the show-level pool but never creates class-level records.

The `judge_assignments` table already has a `class_id` FK column that supports per-class assignments, but the application never populates it.

## Goals

- Selecting a judge for a class persists correctly and survives page reload.
- The show details Classes tab, class edit form, and trial timeline all display the assigned judge.
- The show creation wizard's per-class judge assignments also persist.
- No database migration required — the schema already supports this.

## Non-Goals

- Changing the show-level judge pool management (Edit Show > Judges tab). That flow works correctly.
- Multi-judge per class. One judge per class is sufficient.
- Bulk judge assignment UI. Out of scope.

## Design

### Data Model

**Single source of truth:** `judge_assignments` table.

| Record type            | `show_id` | `class_id` | Purpose                                 |
| ---------------------- | --------- | ---------- | --------------------------------------- |
| Show-level pool        | set       | `null`     | "This judge is available for this show" |
| Class-level assignment | set       | set        | "This judge is assigned to this class"  |

A judge can have both: one pool record (existing) and multiple class records (new). No migration needed.

### Write Path

#### Class Edit Form Save

When the user saves a class with a judge selected:

1. `ClassDetailsPage.handleSaveClassEdit` extracts `judgeId` from the saved form data.
2. Calls a new function `upsertClassJudgeAssignment(showId, classId, judgeId)` in `judgeQueries.ts`.
3. That function:
   - Deletes any existing `judge_assignments` rows where `class_id = classId`.
   - If `judgeId` is not empty/TBD, inserts: `{ person_id: judgeId, show_id: showId, class_id: classId, status: 'confirmed', confirmed_at: now() }`.
4. The normal class field update continues unchanged — `mapClassInputToUpdate` handles non-judge fields only.
5. After saving, invalidate the replication layer cache so the UI updates immediately (trigger a sync or manually update the local `ReplicatedClass`).

The `showId` for the save handler comes from `parentShow.id` (already resolved via `useClassDetailsData`), not from URL params which may be undefined.

#### Show Creation Wizard

After `createClasses()` completes in `saveShow()`:

1. Access the original wizard trial data (available via `trials` in the callback scope), which contains `cls.judgeId` on each wizard class.
2. Build a mapping from the wizard class data to the real class IDs created by `createClasses()`. The `createClassDataFromWizard()` transformer produces `ClassData[]` with deterministic IDs (via `crypto.randomUUID()` in `classDataToReplicatedClass`). The wizard trial's `classes[].judgeId` field (from `showCreationWizardValidation.ts`) carries the judge's person ID.
3. For each class that has a non-empty `judgeId`, call `upsertClassJudgeAssignment(realShowId, classId, judgeId)`.
4. This happens alongside the existing `persistShowJudgeAssignments()` call for show-level pool records.

Note: Between class creation and the first sync, the local `ReplicatedClass` will have `judgeName` set from `classDataToReplicatedClass()` (line 54), so the UI shows the name immediately. The sync will then overwrite with the joined data from the database, which should match.

#### Protect Class-Level Assignments from Show-Level Deletes

**Critical:** `persistShowJudgeAssignments()` currently deletes ALL `judge_assignments` for a show:

```typescript
await assignmentsTable().delete().eq('show_id', showId);
```

This will destroy class-level assignments when a user edits the show's judge pool. Scope the delete to pool-level records only:

```typescript
await assignmentsTable().delete().eq('show_id', showId).is('class_id', null);
```

### Read Path

#### Replication Layer (feeds Classes tab and class cards)

**`ReplicatedClassesTable.sync()`:** Change the query from `select('*')` to include a join:

```
select('*, judge_assignments!judge_assignments_class_id_fkey(person_id, people!inner(first_name, last_name))')
```

This is the same pattern `useTrialTimeline` already uses. The FK name `judge_assignments_class_id_fkey` is confirmed in the generated Supabase types.

The joined data won't match the `ClassRow` TypeScript type. Use `as` casting on the raw response to access the nested `judge_assignments` array, consistent with how `rowToClass()` already casts `dbRow` to `Record<string, unknown>`.

**`rowToClass()`:** Extract judge name and ID from the joined data instead of reading a nonexistent `judge_name` column:

```typescript
const assignments =
  (dbRow.judge_assignments as Array<{
    person_id: string;
    people: { first_name: string; last_name: string };
  }>) || [];
const judgeAssignment = assignments[0];
const judgeName = judgeAssignment
  ? `${judgeAssignment.people.first_name} ${judgeAssignment.people.last_name}`.trim()
  : undefined;
const judgeId = judgeAssignment?.person_id;
```

Add `judgeId` to the `ReplicatedClass` interface. This populates both `judgeName` and `judgeId`, which flow through:

- `replicatedToTrialClass()` → `SyncableTrialClass.judgeName` + `SyncableTrialClass.judgeId`
- `ShowDetailsPage.showClasses` → `ClassInfo.judgeName`
- `ClassesTab` table/cards → display

#### Class Edit Form (pre-populating the dropdown)

The `judgeId` will be available on `ReplicatedClass` → `SyncableTrialClass` → the class data passed to `ClassEditPanel`. The `classToFormData()` helper maps it to `ClassEditFormData.judgeId`, which pre-selects the dropdown.

### Form Changes

#### `ClassEditFormData` type (`ClassEditPanel.types.ts`)

Add `judgeId?: string` field.

#### `ClassEditForm` component

- Change the judge `<Select>` value from `data.judge` (name string) to `data.judgeId` (UUID).
- Dropdown items: `value={judge.judgeId}`, display text: `{judge.judgeName}`.
- Keep the TBD option with value `'TBD'` or empty string.

#### `ClassEditPanel.helpers.ts`

- `classToFormData()`: populate `judgeId` from the class data (available once the replication layer provides it).
- `formDataToClass()`: include `judgeId` in the output so the save handler can read it.

#### `TrialClassEditForm` (simple mode)

Already uses `judgeId` correctly. No changes needed.

#### `OfficialsSection.tsx` (used by `EditClassDialog`)

This component also has a judge select using name strings (`classData.judge` as value, `judge.judgeName` as item value). `EditClassDialog` is currently only used by `AddClassDialog`, which is not imported anywhere — making it effectively dead code. Note this as a known issue but do not fix it in this scope. If `EditClassDialog` is revived later, it will need the same `judgeId` treatment.

### `ClassData.judge` Field Plan

The `ClassData` interface has `judge: string` as a required field. After this fix:

- `mapDatabaseToClass()` will populate `judge` from the join (same name string as `judgeName`) instead of hardcoding `'TBD'`. This maintains backward compatibility with any code that reads `classData.judge` for display.
- The field remains a display-only name string. All write operations use `judgeId` via `judge_assignments`.
- `classStoreCompatHelpers.ts` `validateClassInput` checks `!classData.judge` — this will continue to pass since `judge` will be populated from the join (or default to `'TBD'` if no assignment exists).

### Additional Files Requiring Updates

#### `TrialDetailsPage.tsx`

Lines 150-151 set `judgeId: classData.judge` and `judgeName: classData.judge`, using the name string where a UUID is expected for `judgeId`. Once `mapDatabaseToClass` populates `judge` from the join, `judgeName` will be correct, but `judgeId` will still be wrong (name instead of UUID). Fix: also populate a `judgeId` field on `SyncableClassData` / `ClassData` from the join, or look up the judge from `assignedJudges` by name.

#### `showCreationWizardTransformers.ts`

`createClassDataFromWizard` (line 139) converts `cls.judgeId` to a name string: `judge: judgeDetails[cls.judgeId]?.name || 'TBD'`. This is fine for `ClassData.judge` display, but the original `cls.judgeId` must be preserved for the post-`createClasses()` assignment step. The wizard's `saveShow()` can read `judgeId` directly from the wizard trial data rather than from the transformed `ClassData`.

#### `persistShowJudgeAssignments` in `judgeQueries.ts`

Scope the delete to pool-level records: add `.is('class_id', null)` to prevent destroying class-level assignments when the show's judge pool is edited.

### Trial Timeline

Already joins `judge_assignments` to resolve judge names. No changes needed.

### Files Changed

| File                                                                 | Change                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `services/database/queries/judgeQueries.ts`                          | Add `upsertClassJudgeAssignment()`; scope delete in `persistShowJudgeAssignments`                 |
| `services/replication/ReplicatedClassesTable.ts`                     | Join `judge_assignments` in sync query; update `rowToClass()`; add `judgeId` to `ReplicatedClass` |
| `store/trial-store-helpers.ts`                                       | Map `judgeId` through `replicatedToTrialClass()`                                                  |
| `store/trial-store-types.ts`                                         | Add `judgeId` to `SyncableTrialClass` if not already present                                      |
| `components/panels/edit/ClassEditPanel.types.ts`                     | Add `judgeId` to `ClassEditFormData`                                                              |
| `components/panels/edit/ClassEditPanel.helpers.ts`                   | Map `judgeId` in `classToFormData()` and `formDataToClass()`                                      |
| `components/panels/edit/ClassEditForm.tsx`                           | Switch judge select from name to ID                                                               |
| `pages/ClassDetailsPage/index.tsx`                                   | Pass `showId` to panel (done); call `upsertClassJudgeAssignment` on save                          |
| `pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts` | Create class-level judge assignments after `createClasses()`                                      |
| `services/mappers/classMappers.ts`                                   | Populate `judge` from join data instead of hardcoding `'TBD'`                                     |
| `pages/TrialDetailsPage.tsx`                                         | Fix `judgeId` assignment (lines 150-151)                                                          |

### What This Does NOT Change

- `EditShowDialog` Judges tab — unchanged.
- `OfficialsSection` steward selects — unchanged (stewards use name strings from `people`, not `judge_assignments`).
- `EditClassDialog` / `AddClassDialog` — effectively dead code, noted as known issue.
- `useTrialTimeline` — already correct.
- Database schema — no migration.

### Testing

#### Unit Tests

- `upsertClassJudgeAssignment()`: test insert, update (different judge), and removal (TBD/empty).
- `rowToClass()`: test with joined judge data present, absent, and with multiple assignments (takes first).
- `classToFormData()` / `formDataToClass()`: test `judgeId` round-trip.
- `persistShowJudgeAssignments()`: verify the scoped delete does not remove class-level records.

#### Manual / Integration Tests

- Edit a class, select a judge, save. Reload page — judge still shown.
- Edit the same class, change to a different judge. Verify update.
- Edit a class, set judge to TBD. Verify the old assignment is removed.
- Edit show judge pool (Edit Show > Judges) — verify class-level assignments are preserved.
- Create a show via wizard with judges assigned to classes. Verify classes show judges after creation.
- Show details Classes tab displays judge names in both table and card views.
- Trial timeline continues showing correct judge groupings.
