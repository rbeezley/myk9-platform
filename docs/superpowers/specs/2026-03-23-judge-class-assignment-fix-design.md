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

#### Show Creation Wizard

After `createClasses()` completes in `saveShow()`:

1. Iterate over the created classes.
2. For each class that has a `judgeId` (not empty/TBD), call `upsertClassJudgeAssignment(showId, classId, judgeId)`.
3. This happens alongside the existing `persistShowJudgeAssignments()` call for show-level pool records.

The wizard's `classDataToReplicatedClass()` function maps `classData.judge` (a name string). The wizard step that assigns judges needs to also capture the `judgeId` — this may already be available via `judgeDetails` map and `classData.judgeId` from the wizard validation types.

### Read Path

#### Replication Layer (feeds Classes tab and class cards)

**`ReplicatedClassesTable.sync()`:** Change the query from `select('*')` to include a join:

```
select('*, judge_assignments!judge_assignments_class_id_fkey(person_id, people!inner(first_name, last_name))')
```

This is the same pattern `useTrialTimeline` already uses successfully.

**`rowToClass()`:** Extract the judge name from the joined data instead of reading a nonexistent `judge_name` column:

```typescript
const judgeAssignment = dbRow.judge_assignments?.[0];
const person = judgeAssignment?.people;
const judgeName = person ? `${person.first_name} ${person.last_name}`.trim() : undefined;
```

This populates `ReplicatedClass.judgeName`, which flows through:

- `replicatedToTrialClass()` → `SyncableTrialClass.judgeName`
- `ShowDetailsPage.showClasses` → `ClassInfo.judgeName`
- `ClassesTab` table/cards → display

#### Class Edit Form (pre-populating the dropdown)

The class edit form needs to know the currently assigned `judgeId` to pre-select the dropdown.

**Option:** Resolve it from the show's `assignedJudges` data. The `buildAssignedJudges()` utility already extracts `assignedClasses` from `judge_assignments` records. The form can find which judge has `classId` in their `assignedClasses` array and pre-select that `judgeId`.

Alternatively, the `ReplicatedClass` can carry a `judgeId` field (extracted from the join) so it's available when the edit form opens.

**Recommended:** Add `judgeId` to `ReplicatedClass` and populate it from the join. This is the simplest path since the data is already being fetched.

### Form Changes

#### `ClassEditFormData` type (`ClassEditPanel.types.ts`)

Add `judgeId?: string` field.

#### `ClassEditForm` component

- Change the judge `<Select>` value from `data.judge` (name string) to `data.judgeId` (UUID).
- Dropdown items: `value={judge.judgeId}`, display text: `{judge.judgeName}`.
- Keep the TBD option with value `'TBD'` or empty string.

#### `ClassEditPanel.helpers.ts`

- `classToFormData()`: populate `judgeId` from the class data (will be available once the replication layer provides it).
- `formDataToClass()`: include `judgeId` in the output so the save handler can read it.

#### `TrialClassEditForm` (simple mode)

Already uses `judgeId` correctly. No changes needed.

### Trial Timeline

Already joins `judge_assignments` to resolve judge names. No changes needed.

### Files Changed

| File                                                                 | Change                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `services/database/queries/judgeQueries.ts`                          | Add `upsertClassJudgeAssignment()`                                       |
| `services/replication/ReplicatedClassesTable.ts`                     | Join `judge_assignments` in sync query; update `rowToClass()`            |
| `services/replication/ReplicatedClassesTable.ts`                     | Add `judgeId` to `ReplicatedClass` interface                             |
| `store/trial-store-helpers.ts`                                       | Map `judgeId` through `replicatedToTrialClass()`                         |
| `components/panels/edit/ClassEditPanel.types.ts`                     | Add `judgeId` to `ClassEditFormData`                                     |
| `components/panels/edit/ClassEditPanel.helpers.ts`                   | Map `judgeId` in `classToFormData()` and `formDataToClass()`             |
| `components/panels/edit/ClassEditForm.tsx`                           | Switch judge select from name to ID                                      |
| `pages/ClassDetailsPage/index.tsx`                                   | Pass `showId` to panel (done); call `upsertClassJudgeAssignment` on save |
| `pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts` | Create class-level judge assignments after `createClasses()`             |
| `services/mappers/classMappers.ts`                                   | Remove hardcoded `judge: 'TBD'` in `mapDatabaseToClass()`                |

### What This Does NOT Change

- `persistShowJudgeAssignments()` — show-level pool management unchanged.
- `EditShowDialog` Judges tab — unchanged.
- `OfficialsSection` steward selects — unchanged (stewards use name strings from `people`, not `judge_assignments`).
- `useTrialTimeline` — already correct.
- Database schema — no migration.

### Testing

- Edit a class, select a judge, save. Reload page — judge still shown.
- Edit the same class, change to a different judge. Verify update.
- Edit a class, set judge to TBD. Verify the old assignment is removed.
- Create a show via wizard with judges assigned to classes. Verify classes show judges after creation.
- Show details Classes tab displays judge names in both table and card views.
- Trial timeline continues showing correct judge groupings.
