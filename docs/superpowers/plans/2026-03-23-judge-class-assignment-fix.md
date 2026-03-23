# Fix Judge-to-Class Assignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make judge-to-class assignments persist correctly through the `judge_assignments` table, fixing the broken write path, read path, and wizard flow.

**Architecture:** Use existing `judge_assignments.class_id` FK (no migration) as single source of truth. Write path creates class-level records via a new `upsertClassJudgeAssignment()` function. Read path joins `judge_assignments` + `people` in the replication sync query to populate `judgeName` and `judgeId` on classes.

**Tech Stack:** TypeScript, React, Supabase PostgREST, Zustand, @myk9/replication, vitest

**Spec:** `docs/superpowers/specs/2026-03-23-judge-class-assignment-fix-design.md`

---

## Task 1: Write Path — `upsertClassJudgeAssignment` + protect pool deletes

**Files:**

- Modify: `apps/myk9show/src/services/database/queries/judgeQueries.ts:228-252`
- Create: `apps/myk9show/src/services/database/queries/__tests__/judgeQueries.test.ts`

- [ ] **Step 1: Write tests for `upsertClassJudgeAssignment`**

Create `apps/myk9show/src/services/database/queries/__tests__/judgeQueries.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
const mockDelete = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockIs = vi.fn().mockReturnThis();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      delete: mockDelete,
      insert: mockInsert,
      select: vi.fn().mockReturnThis(),
      eq: mockEq,
      is: mockIs,
    })),
  },
}));

// Use dynamic import so mocks are in place
const { upsertClassJudgeAssignment } = await import('../judgeQueries');

describe('upsertClassJudgeAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Chain: delete().eq('class_id', x) resolves
    mockDelete.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ error: null });
  });

  it('deletes existing assignment and inserts new one', async () => {
    await upsertClassJudgeAssignment('show-1', 'class-1', 'judge-1');

    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        person_id: 'judge-1',
        show_id: 'show-1',
        class_id: 'class-1',
        status: 'confirmed',
      })
    );
  });

  it('only deletes when judgeId is empty (TBD)', async () => {
    await upsertClassJudgeAssignment('show-1', 'class-1', '');

    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('only deletes when judgeId is "TBD"', async () => {
    await upsertClassJudgeAssignment('show-1', 'class-1', 'TBD');

    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/services/database/queries/__tests__/judgeQueries.test.ts`
Expected: FAIL — `upsertClassJudgeAssignment` is not exported.

- [ ] **Step 3: Implement `upsertClassJudgeAssignment`**

In `apps/myk9show/src/services/database/queries/judgeQueries.ts`, add after `persistShowJudgeAssignments`:

```typescript
/**
 * Upsert a judge assignment for a specific class.
 * Removes any existing class-level assignment, then inserts the new one.
 * Pass empty string or 'TBD' as judgeId to remove the assignment.
 */
export async function upsertClassJudgeAssignment(
  showId: string,
  classId: string,
  judgeId: string
): Promise<void> {
  // Always remove existing class-level assignment
  await assignmentsTable().delete().eq('class_id', classId);

  // Insert new assignment if judge is specified
  if (judgeId && judgeId !== 'TBD') {
    await assignmentsTable().insert({
      person_id: judgeId,
      show_id: showId,
      class_id: classId,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 4: Scope `persistShowJudgeAssignments` delete to pool-level only**

In the same file, change line 240 from:

```typescript
await assignmentsTable().delete().eq('show_id', showId);
```

to:

```typescript
await assignmentsTable().delete().eq('show_id', showId).is('class_id', null);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/services/database/queries/__tests__/judgeQueries.test.ts`
Expected: PASS

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```
git add apps/myk9show/src/services/database/queries/judgeQueries.ts apps/myk9show/src/services/database/queries/__tests__/judgeQueries.test.ts
git commit -m "feat: add upsertClassJudgeAssignment and scope pool delete"
```

---

## Task 2: Read Path — Add `judgeId` to `ReplicatedClass` and join in sync

**Files:**

- Modify: `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts:21-76,81-133,207-231`

- [ ] **Step 1: Add `judgeId` to `ReplicatedClass` interface**

In `ReplicatedClassesTable.ts`, after line 49 (`judgeName`), add:

```typescript
  judgeId?: string | undefined;
```

- [ ] **Step 2: Update `rowToClass()` to extract judge from joined data**

In `rowToClass()` (line 81-133), replace lines 112 (`judgeName: (dbRow.judge_name ...)`):

```typescript
// Extract judge from joined judge_assignments data
const judgeAssignments =
  (dbRow.judge_assignments as Array<{
    person_id: string;
    people: { first_name: string; last_name: string };
  }>) || [];
const firstJudge = judgeAssignments[0];
const judgeName = firstJudge
  ? `${firstJudge.people.first_name} ${firstJudge.people.last_name}`.trim()
  : undefined;
const judgeId = firstJudge?.person_id;
```

Then update the return object to use the new variables:

```typescript
    judgeName,
    judgeId,
```

- [ ] **Step 3: Update sync query to join `judge_assignments`**

In `sync()` method (line 221-224), change **only** the `.select('*')` argument. Keep the `.gt()` and `.order()` chains intact:

```typescript
let query = supabase
  .from('classes')
  .select(
    '*, judge_assignments!judge_assignments_class_id_fkey(person_id, people!inner(first_name, last_name))'
  )
  .gt('updated_at', new Date(lastSync).toISOString())
  .order('updated_at', { ascending: true });
```

**Important:** Do NOT remove the `.gt()` or `.order()` — they are required for incremental sync.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add apps/myk9show/src/services/replication/ReplicatedClassesTable.ts
git commit -m "feat: join judge_assignments in class sync for judge name/ID"
```

---

## Task 3: Read Path — Map `judgeId` through trial store helpers

**Files:**

- Modify: `apps/myk9show/src/store/trial-store-helpers.ts:6-59`

- [ ] **Step 1: Update `trialClassToReplicated` to include `judgeId`**

In `trial-store-helpers.ts` line 6-23, add `judgeId` to the returned object (after `judgeName`):

```typescript
    judgeId: tc.judgeId,
```

(Note: `tc` is a `SyncableTrialClass` which already has `judgeId` on its interface.)

- [ ] **Step 2: Update `replicatedToTrialClass` to map `judgeId`**

In `trial-store-helpers.ts` line 26-43, change line 32 from:

```typescript
    judgeId: '', // Local-only field (not stored in ReplicatedClass)
```

to:

```typescript
    judgeId: replicated.judgeId || '',
```

- [ ] **Step 3: Update `mergeTrialClassData` to use replicated `judgeId`**

In `trial-store-helpers.ts` line 46-59, change line 56 from:

```typescript
    judgeId: existing.judgeId || '',
```

to:

```typescript
    judgeId: base.judgeId || existing.judgeId || '',
```

This ensures the replicated (database) value takes priority over stale local data.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add apps/myk9show/src/store/trial-store-helpers.ts
git commit -m "feat: map judgeId through trial store helpers"
```

---

## Task 4: Form — Switch `ClassEditForm` judge select to use `judgeId`

**Files:**

- Modify: `apps/myk9show/src/components/panels/edit/ClassEditPanel.types.ts:17-49`
- Modify: `apps/myk9show/src/components/panels/edit/ClassEditPanel.helpers.ts:6-74`
- Modify: `apps/myk9show/src/components/panels/edit/ClassEditForm.tsx:283-308`

- [ ] **Step 1: Add `judgeId` to `ClassEditFormData`**

In `ClassEditPanel.types.ts`, after line 33 (`judge?: string;`), add:

```typescript
  judgeId?: string;
```

- [ ] **Step 2: Update `classToFormData` to populate `judgeId`**

In `ClassEditPanel.helpers.ts`, in `classToFormData()` (line 6-32), after line 19 (`judge: classItem.judge || ''`), add:

```typescript
    judgeId: (classItem as Record<string, unknown>).judgeId as string || '',
```

(The `ClassData` type doesn't have `judgeId` yet, but the actual object passed from `SyncableTrialClass` or the merged data will have it. Use `as Record<string, unknown>` to access it safely.)

- [ ] **Step 3: Update `formDataToClass` to include `judgeId`**

In `ClassEditPanel.helpers.ts`, in `formDataToClass()` (line 50-74), add after the `judge` spread (line 62):

```typescript
  ...(formData.judgeId !== undefined && { judgeId: formData.judgeId }),
```

- [ ] **Step 4: Update the judge `<Select>` in `ClassEditForm`**

In `ClassEditForm.tsx`, lines 283-308, change the judge select from name-based to ID-based:

Change `value={data.judge || ''}` (line 285) to:

```typescript
value={data.judgeId || ''}
```

Change the `SelectItem` value from `value={judge.judgeName}` (line 295) to:

```typescript
value={judge.judgeId}
```

Change the `onValueChange` handler from `handleSelectChange('judge')` (line 286) to:

```typescript
onValueChange={value => {
  const finalValue = value === 'none' ? '' : value;
  form?.setValue('judgeId', finalValue);
  // Also update judge name for display compatibility
  const selectedJudge = assignedJudges.find(j => j.judgeId === finalValue);
  form?.setValue('judge', selectedJudge?.judgeName || 'TBD');
  form?.touchField('judgeId');
}}
```

Update the TBD `SelectItem` value to use empty string:

```typescript
<SelectItem value="TBD">TBD</SelectItem>
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```
git add apps/myk9show/src/components/panels/edit/ClassEditPanel.types.ts apps/myk9show/src/components/panels/edit/ClassEditPanel.helpers.ts apps/myk9show/src/components/panels/edit/ClassEditForm.tsx
git commit -m "feat: switch class edit form judge select to use judgeId"
```

---

## Task 5: Save Handler — Wire `upsertClassJudgeAssignment` into `ClassDetailsPage`

**Files:**

- Modify: `apps/myk9show/src/pages/ClassDetailsPage/index.tsx:111-122,296-310`

- [ ] **Step 1: Import `upsertClassJudgeAssignment`**

At the top of `ClassDetailsPage/index.tsx`, add:

```typescript
import { upsertClassJudgeAssignment } from '@/services/database/queries/judgeQueries';
```

- [ ] **Step 2: Update `handleSaveClassEdit` to save judge assignment**

Replace the `handleSaveClassEdit` function (lines 111-122) with:

```typescript
const handleSaveClassEdit = async (data: Partial<typeof currentClass>) => {
  if (classId && currentClass) {
    try {
      await updateClass(classId, data as Partial<ClassData>);

      // Save judge assignment separately via judge_assignments table
      const judgeId = (data as Record<string, unknown>).judgeId as string | undefined;
      if (judgeId !== undefined && parentShow?.id) {
        try {
          await upsertClassJudgeAssignment(parentShow.id, classId, judgeId);
        } catch (judgeError) {
          logger.warn('Failed to save judge assignment', 'classes', {
            classId,
            error: judgeError instanceof Error ? judgeError.message : String(judgeError),
          });
          toast.warning('Class saved, but judge assignment could not be saved');
        }
      }

      toast.success('Class updated successfully');
    } catch (error) {
      logger.error('Failed to update class', 'classes', { classId }, error as Error);
      toast.error('Failed to update class');
    }
  }
  dialogs.closeEditClassPanel();
};
```

- [ ] **Step 3: Verify `showId` is already passed to `ClassEditPanel`**

Confirm `ClassEditPanel` at line ~300 has `showId={parentShow?.id}` (added in earlier fix). If not, add it.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add apps/myk9show/src/pages/ClassDetailsPage/index.tsx
git commit -m "feat: wire upsertClassJudgeAssignment into class edit save"
```

---

## Task 6: Fix `mapDatabaseToClass` — Remove hardcoded `judge: 'TBD'`

**Files:**

- Modify: `apps/myk9show/src/services/mappers/classMappers.ts:163-207`
- Modify: `apps/myk9show/src/services/database/queries/classQueries.ts:40-58`

- [ ] **Step 1: Add judge join to `getAllClasses` query**

In `classQueries.ts`, update the select string (lines 42-55) to include the judge assignment join:

```typescript
      .select(
        `
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number,
          status
        ),
        entries (
          id
        ),
        judge_assignments!judge_assignments_class_id_fkey (
          person_id,
          people!inner (
            first_name,
            last_name
          )
        )
      `
      )
```

- [ ] **Step 2: Update `mapDatabaseToClass` to use joined data**

In `classMappers.ts`, replace line 174 (`judge: 'TBD'`) with:

```typescript
    judge: extractJudgeName(dbClass) || 'TBD',
```

Add a helper function before `mapDatabaseToClass`:

```typescript
/** Joined judge assignment shape from the query */
interface JoinedJudgeAssignment {
  person_id: string;
  people: { first_name: string; last_name: string };
}

/** Extract judge info from joined judge_assignments data */
function extractJudgeFromJoin(dbClass: DbClassWithRelations): { name: string; id: string } | null {
  const assignments = (dbClass as Record<string, unknown>).judge_assignments as
    | JoinedJudgeAssignment[]
    | undefined;
  const first = assignments?.[0];
  if (!first) return null;
  return {
    name: `${first.people.first_name} ${first.people.last_name}`.trim(),
    id: first.person_id,
  };
}
```

Then update the `mapDatabaseToClass` return to use both name and ID:

```typescript
    judge: extractJudgeFromJoin(dbClass)?.name || 'TBD',
    judgeId: extractJudgeFromJoin(dbClass)?.id || '',
```

Note: `SyncableClassData` doesn't have `judgeId` in its interface, but the extra property will pass through when the object is spread. This is needed by `TrialDetailsPage` (Task 7).

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```
git add apps/myk9show/src/services/mappers/classMappers.ts apps/myk9show/src/services/database/queries/classQueries.ts
git commit -m "fix: populate judge name from join instead of hardcoding TBD"
```

---

## Task 7: Fix `TrialDetailsPage` — Use proper `judgeId`

**Files:**

- Modify: `apps/myk9show/src/pages/TrialDetailsPage.tsx:150-151`

- [ ] **Step 1: Fix `judgeId` and `judgeName` assignment**

In `TrialDetailsPage.tsx`, replace lines 150-151:

```typescript
        judgeId: classData.judge || 'TBD',
        judgeName: classData.judge || 'TBD',
```

with:

```typescript
        judgeId: (classData as Record<string, unknown>).judgeId as string || 'TBD',
        judgeName: classData.judge || 'TBD',
```

This uses the `judgeId` from the class data (now populated via the join) for the ID field, and the `judge` name string for display.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```
git add apps/myk9show/src/pages/TrialDetailsPage.tsx
git commit -m "fix: use proper judgeId from class data in TrialDetailsPage"
```

---

## Task 8: Wizard — Create class-level judge assignments after class creation

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts:155-280`

- [ ] **Step 1: Import `upsertClassJudgeAssignment`**

Add to imports:

```typescript
import { upsertClassJudgeAssignment } from '@/services/database/queries/judgeQueries';
```

(Note: `persistShowJudgeAssignments` is already imported from this file.)

- [ ] **Step 2: Modify `createClasses` to return class-judge pairs**

In `createClasses()` (lines 155-227), change the return type and collect the pairs.

Before the `for` loop (line 207), add:

```typescript
const classJudgePairs: Array<{ classId: string; judgeId: string }> = [];
```

First, in `showCreationWizardTransformers.ts`, at line 139, after `judge: judgeDetails[cls.judgeId || '']?.name || 'TBD',`, add to the returned class object:

```typescript
        judgeId: cls.judgeId || '',
```

This adds `judgeId` as an ad-hoc property on the `ClassData` object so it's available in `createClasses`.

Then in `useShowCreationWizardActions.ts`, inside the `for` loop after `await replicatedClassesTable.createClass(replicatedClass)` (line 221), add:

```typescript
const classJudgeId = (classData as Record<string, unknown>).judgeId as string;
if (classJudgeId && classJudgeId !== 'TBD') {
  classJudgePairs.push({ classId: replicatedClass.id, judgeId: classJudgeId });
}
```

At the end of `createClasses`, before the closing `logger.debug`, add:

```typescript
return classJudgePairs;
```

Update the function signature to indicate the return type:

```typescript
  const createClasses = useCallback(
    async (showId: string, trialIdMap: Record<string, string>): Promise<Array<{ classId: string; judgeId: string }>> => {
```

- [ ] **Step 3: Use returned pairs in `saveShow` to create class-level assignments**

In `saveShow()`, after `await createClasses(realShowId, trialIdMap)` (line 266), capture the return value:

```typescript
const classJudgePairs = await createClasses(realShowId, trialIdMap);
```

After the existing `persistShowJudgeAssignments` block (around line 280), add:

```typescript
// Persist class-level judge assignments
if (classJudgePairs.length > 0) {
  for (const { classId, judgeId } of classJudgePairs) {
    try {
      await upsertClassJudgeAssignment(realShowId, classId, judgeId);
    } catch (err) {
      logger.warn('Failed to persist class judge assignment', 'wizard', {
        classId,
        judgeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts
git commit -m "feat: create class-level judge assignments in show wizard"
```

---

## Task 9: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS (may have pre-existing warnings, 0 new errors).

- [ ] **Step 3: Run myK9Show unit tests**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass. If any tests reference the hardcoded `judge: 'TBD'` from `mapDatabaseToClass`, they may need updating.

- [ ] **Step 4: Fix any test failures**

If tests fail because they expected `judge: 'TBD'`, update the test fixtures to include the `judge_assignments` join data in their mock responses, or accept `'TBD'` as the fallback when no assignment exists.

- [ ] **Step 5: Commit any test fixes**

```
git add -u
git commit -m "test: fix tests for judge assignment join changes"
```
