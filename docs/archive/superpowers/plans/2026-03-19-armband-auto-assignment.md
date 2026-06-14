# Armband Auto-Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-assign sequential armband numbers to dogs during registration so exhibitors receive their armband in the confirmation email.

**Architecture:** Postgres function `assign_armband(show_id, dog_id)` atomically assigns the next sequential number (or returns existing). Called via Supabase RPC after entry creation in the registration wizard. One armband per dog per show.

**Tech Stack:** Postgres (migration + function), Supabase RPC, React (wizard UI), existing email template

**Spec:** `docs/superpowers/specs/2026-03-19-armband-auto-assignment-design.md`

---

### Task 1: Database Migration — Column, Constraint, and Function

**Files:**

- Create: `supabase/migrations/076_armband_auto_assignment.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Add starting armband number configuration to shows
ALTER TABLE shows ADD COLUMN IF NOT EXISTS starting_armband_number INTEGER NOT NULL DEFAULT 100;

-- Enforce one armband per dog per show at the schema level
-- (existing constraint: UNIQUE(show_id, armband_number) prevents duplicate numbers)
ALTER TABLE armbands ADD CONSTRAINT armbands_show_dog_unique UNIQUE (show_id, dog_id);

-- Atomic armband assignment function
-- Returns existing armband if dog already has one for this show,
-- otherwise assigns the next sequential number.
CREATE OR REPLACE FUNCTION assign_armband(p_show_id UUID, p_dog_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing INTEGER;
  v_next INTEGER;
  v_start INTEGER;
BEGIN
  -- Check if this dog already has an armband for this show
  SELECT armband_number::int INTO v_existing
  FROM armbands
  WHERE show_id = p_show_id AND dog_id = p_dog_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Lock the show row to serialize concurrent assignments
  SELECT COALESCE(starting_armband_number, 100) INTO v_start
  FROM shows
  WHERE id = p_show_id
  FOR UPDATE;

  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Show % not found', p_show_id;
  END IF;

  -- Compute next available number (only consider numeric armband values)
  SELECT COALESCE(
    MAX(CASE WHEN armband_number ~ '^\d+$' THEN armband_number::int END),
    v_start - 1
  ) + 1
  INTO v_next
  FROM armbands
  WHERE show_id = p_show_id;

  -- Insert the assignment (entry_id omitted — armband is per-dog, not per-entry)
  INSERT INTO armbands (show_id, dog_id, armband_number, assigned_at, is_available)
  VALUES (p_show_id, p_dog_id, v_next::text, NOW(), FALSE);

  RETURN v_next;
END;
$$;
```

- [ ] **Step 2: Apply migration locally and to remote**

Run locally: `cd supabase && supabase db push`
Run to staging: `cd supabase && supabase db push --linked`
Expected: Migration applies successfully on both, no errors.

- [ ] **Step 3: Verify function works**

Run in Supabase SQL editor or via `psql`:

```sql
-- Should return the starting number (100) for a test show/dog
SELECT assign_armband('<test-show-id>', '<test-dog-id>');
-- Call again — should return the same number (idempotent)
SELECT assign_armband('<test-show-id>', '<test-dog-id>');
-- Different dog — should return 101
SELECT assign_armband('<test-show-id>', '<different-dog-id>');
```

- [ ] **Step 4: Regenerate Supabase types**

Run: `supabase gen types typescript --local > packages/supabase/src/types/supabase.ts`

This updates the generated types so `DbShow` includes `starting_armband_number` and the `assign_armband` RPC is typed. Without this, mapper code in Task 2 will fail typecheck.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/076_armband_auto_assignment.sql packages/supabase/src/types/supabase.ts
git commit -m "feat(db): add armband auto-assignment function and starting_armband_number column"
```

---

### Task 2: Update Show Type and Mapper

**Files:**

- Modify: `apps/myk9show/src/types/show-types.ts:59-108` (Show interface)
- Modify: `apps/myk9show/src/types/show-types.ts:114-143` (ShowInput interface)
- Modify: `apps/myk9show/src/services/mappers/showMappers.ts:9-39` (mapShowInputToInsert)
- Modify: `apps/myk9show/src/services/mappers/showMappers.ts:44-73` (mapShowInputToUpdate)
- Modify: `apps/myk9show/src/services/mappers/showMappers.ts:170-241` (mapDatabaseToShow)
- Modify: `apps/myk9show/src/services/mappers/showMappers.ts:262-287` (mapShowToShowInput)

- [ ] **Step 1: Add `startingArmbandNumber` to Show and ShowInput interfaces**

In `show-types.ts`, add to the `Show` interface (after `confirmationMessage`):

```typescript
startingArmbandNumber?: number;
```

Add the same field to the `ShowInput` interface.

- [ ] **Step 2: Update `mapShowInputToInsert`**

In `showMappers.ts`, add to the insert mapping:

```typescript
starting_armband_number: input.startingArmbandNumber ?? 100,
```

- [ ] **Step 3: Update `mapShowInputToUpdate`**

Add to the update mapping (only if provided):

```typescript
...(input.startingArmbandNumber !== undefined && {
  starting_armband_number: input.startingArmbandNumber,
}),
```

- [ ] **Step 4: Update `mapDatabaseToShow`**

Add to the return object:

```typescript
startingArmbandNumber: dbShow.starting_armband_number ?? 100,
```

- [ ] **Step 5: Update `mapShowToShowInput`**

Add to the return object:

```typescript
startingArmbandNumber: show.startingArmbandNumber,
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: Pass (may have errors in wizard/dialog that expect the new field — that's fine, we add it in Tasks 3-4).

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/types/show-types.ts apps/myk9show/src/services/mappers/showMappers.ts
git commit -m "feat(shows): add startingArmbandNumber to Show type and mappers"
```

---

### Task 3: Add Starting Armband Number to Show Creation Wizard

**Files:**

- Modify: `apps/myk9show/src/store/wizardStore.ts` (wizard state — add `startingArmbandNumber` to show data)
- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts` (`WizardShowData` interface + `transformWizardDataToShow` + `showToShowInput`)
- Modify: The wizard step component that has entry fee fields (`preEntryFee`, `dayOfShowFee`) — add the input there

- [ ] **Step 1: Add `startingArmbandNumber` to `WizardShowData` interface**

In `showCreationWizardTransformers.ts`, add to the `WizardShowData` interface:

```typescript
startingArmbandNumber?: number;
```

- [ ] **Step 2: Update `transformWizardDataToShow` and `showToShowInput`**

Ensure both transformer functions pass `startingArmbandNumber` through so it flows from wizard state → ShowInput → database insert.

- [ ] **Step 3: Add `startingArmbandNumber` to wizard store defaults**

In `wizardStore.ts`, add `startingArmbandNumber: 100` to the default show state.

- [ ] **Step 4: Add the input field to the wizard step**

Find the step that has `preEntryFee` / `dayOfShowFee` fields and add a labeled integer input after them:

```tsx
<div>
  <Label htmlFor="startingArmbandNumber">Starting Armband Number</Label>
  <Input
    id="startingArmbandNumber"
    type="number"
    min={1}
    value={show.startingArmbandNumber ?? 100}
    onChange={e => setShow({ ...show, startingArmbandNumber: parseInt(e.target.value, 10) || 100 })}
  />
  <p className="text-xs text-muted-foreground mt-1">
    First dog registered will receive this armband number
  </p>
</div>
```

- [ ] **Step 5: Verify the field persists through wizard flow**

Ensure the value flows from wizard store → transformer → `mapShowInputToInsert` → database.

- [ ] **Step 5: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: Pass.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowCreationWizard/
git commit -m "feat(wizard): add starting armband number field to show creation"
```

---

### Task 4: Add Starting Armband Number to Edit Show Dialog

**Files:**

- Modify: `apps/myk9show/src/components/shows/ShowDetails/dialogs/EditShowDialog.tsx:23-39` (ShowFormData)
- Modify: Same file, form JSX section (after entry fee fields)

- [ ] **Step 1: Add field to ShowFormData**

```typescript
startingArmbandNumber?: number;
```

- [ ] **Step 2: Initialize from show data**

In the form initialization (where show props are mapped to form state), add:

```typescript
startingArmbandNumber: show.startingArmbandNumber ?? 100,
```

- [ ] **Step 3: Add the input field in the form**

Add after the entry fee fields (similar to Task 3 Step 3).

- [ ] **Step 4: Include in submit handler**

Ensure `startingArmbandNumber` is included when the form submits the update.

- [ ] **Step 5: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: Pass.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/shows/ShowDetails/dialogs/EditShowDialog.tsx
git commit -m "feat(shows): add starting armband number to edit show dialog"
```

---

### Task 5: Call `assign_armband` RPC During Registration

**Files:**

- Modify: `apps/myk9show/src/pages/RegistrationWizardPage.tsx:327-356` (entry submission flow)
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/WorkflowStepContent.tsx` (thread armbandAssignments to ConfirmationStep)

**Important notes:**

- Import supabase client (check existing pattern — typically `import { supabase } from '@myk9/supabase'` or `import { supabase } from '@/services/supabase'`)
- Armband assignment MUST happen after `createMultipleEntries()` but BEFORE `confirmRegistration()` — otherwise the confirmation email will lack armband numbers
- The `updateEntry` method requires a `userId` parameter — check the actual signature in entryStore
- The RPC may need `as never` casts if types weren't regenerated: `supabase.rpc('assign_armband' as never, { p_show_id: showId, p_dog_id: dogId } as never)`

- [ ] **Step 1: Understand current entry creation flow**

Read `RegistrationWizardPage.tsx` lines 327-356. Map the exact sequence: `createMultipleEntries()` → `confirmRegistration()` → transition to confirmation step. Identify where to insert armband assignment so it happens after entries exist but before the confirmation email is sent.

- [ ] **Step 2: Add armband assignment after entry creation, before confirmation**

After `createMultipleEntries()` succeeds but BEFORE `confirmRegistration()`, extract unique `(showId, dogId)` pairs and call the RPC:

```typescript
// Assign armbands — one per unique dog
const uniqueDogs = [...new Set(entryInputs.map(e => e.dogId))];
const armbandResults: Array<{ dogId: string; armband: number }> = [];

await Promise.all(
  uniqueDogs.map(async dogId => {
    try {
      const { data, error } = await supabase.rpc('assign_armband', {
        p_show_id: showId,
        p_dog_id: dogId,
      });
      if (!error && data != null) {
        armbandResults.push({ dogId, armband: data });
      }
    } catch {
      // Armband assignment failure is non-blocking — entry still saved
    }
  })
);
```

- [ ] **Step 3: Write armband back to entries** [EXPANDED]

After getting armband numbers, update each entry's `armband` field. Check the actual `updateEntry` signature in entryStore — it likely requires `userId` as a third parameter.

**Important:** Verify that the replication layer maps `registrationData.armband` to the `entries.armband` column in the database. Check `ReplicatedEntriesTable` or the entry store's persistence logic to confirm this mapping exists. If it doesn't, write directly to `entries.armband` via a Supabase update instead.

```typescript
for (const { dogId, armband } of armbandResults) {
  const dogEntries = createdEntries.filter(e => e.dogId === dogId);
  for (const entry of dogEntries) {
    await entryStore.updateEntry(
      entry.id,
      {
        registrationData: { ...entry.registrationData, armband: String(armband) },
      },
      userId
    );
  }
}
```

- [ ] **Step 4: Store armband assignments in component state**

Store `armbandResults` in React state so it can be passed down to the confirmation step:

```typescript
const [armbandAssignments, setArmbandAssignments] = useState<
  Array<{ dogId: string; armband: string }>
>([]);

// After RPC calls complete:
setArmbandAssignments(
  armbandResults.map(({ dogId, armband }) => ({
    dogId,
    armband: String(armband),
  }))
);
```

- [ ] **Step 5: Thread armbandAssignments through WorkflowStepContent to ConfirmationStep**

`ConfirmationStep` is rendered by `WorkflowStepContent.tsx`, not directly by `RegistrationWizardPage`. Thread the prop:

1. Add `armbandAssignments` to `WorkflowStepContentProps`
2. Pass it from `RegistrationWizardPage` → `WorkflowStepContent` → `ConfirmationStep`
3. `ConfirmationStep` already accepts `armbandAssignments` prop and displays them

- [ ] **Step 6: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: Pass.

- [ ] **Step 7: Manual test**

1. Create a show with starting armband number 100
2. Register a dog for two classes
3. Verify confirmation step shows armband #100
4. Register a different dog
5. Verify it gets armband #101
6. Register first dog for another class
7. Verify it still shows #100 (reused)

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/pages/RegistrationWizardPage.tsx apps/myk9show/src/components/shows/RegistrationWorkflow/WorkflowStepContent.tsx
git commit -m "feat(registration): auto-assign armband numbers during entry creation"
```

---

### Task 6: Verify Email Template Includes Armband

**Files:**

- Read: `packages/email/src/templates/RegistrationConfirmation.tsx:77-83`
- Modify (if needed): Same file

- [ ] **Step 1: Verify email template already handles armband**

The email template already has armband display logic at lines 77-83:

```tsx
{
  entry.armband && (
    <Column style={{ textAlign: 'right' }}>
      <Text style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>#{entry.armband}</Text>
    </Column>
  );
}
```

Verify that `entry.armband` is populated when the confirmation email is sent. Check where the email is triggered during registration and confirm that the entry data passed to the email includes the armband field.

- [ ] **Step 2: Trace email sending flow**

Find where `RegistrationConfirmation` is called/sent during registration. Ensure the entries passed to it include the `armband` field that was set in Task 5.

- [ ] **Step 3: Fix if needed**

If the email sending happens before the armband is written back to the entry, reorder the flow so armband assignment happens first.

- [ ] **Step 4: Commit (if changes made)**

```bash
git add packages/email/ apps/myk9show/
git commit -m "fix(email): ensure armband number is included in confirmation email"
```

---

### Task 7: Tests

**Files:**

- Create: `apps/myk9show/src/test/services/armband-assignment.test.ts`

- [ ] **Step 1: Write unit tests for the application-layer armband logic**

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Armband assignment during registration', () => {
  it('calls assign_armband RPC for each unique dog', () => {
    // Mock supabase.rpc, verify called once per unique dogId
  });

  it('reuses same armband for same dog across multiple entries', () => {
    // Mock RPC returning same number for same dog
    // Verify all entries for that dog get the same armband
  });

  it('does not block registration if RPC fails', () => {
    // Mock RPC throwing error
    // Verify entries are still created successfully
    // Verify armbandAssignments is empty (graceful degradation)
  });

  it('passes armband assignments to ConfirmationStep', () => {
    // Verify the armbandAssignments array is correctly formed
    // Each entry should have { dogId, armband } with armband as string
  });

  it('assigns sequential numbers for different dogs', () => {
    // Mock RPC returning 100 for dog A, 101 for dog B
    // Verify entries for dog A all get "100", entries for dog B all get "101"
  });

  it('writes armband back to entry registrationData', () => {
    // Mock RPC returning 100
    // Verify updateEntry is called with registrationData.armband = "100"
  });
});
```

**Note:** Database-level tests (concurrent calls, non-numeric values, NULL starting number, nonexistent show) are best verified manually via SQL in Task 1 Step 3 or in a future database test suite. The Vitest tests focus on the application layer.

- [ ] **Step 2: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/test/services/armband-assignment.test.ts --reporter=verbose`
Expected: All tests pass.

- [ ] **Step 3: Run full typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/test/services/armband-assignment.test.ts
git commit -m "test(registration): add armband auto-assignment tests"
```

---

### Task 8: Update TO-DOS.md

**Files:**

- Modify: `TO-DOS.md`

- [ ] **Step 1: Mark the armband number assignment todo as done**

Find the "Armband Number Assignment" section and mark it `[x]` with a summary of what was implemented.

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark armband auto-assignment todo as done"
```
