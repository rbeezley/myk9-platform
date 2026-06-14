# Entry Management: Armband Fix + Order-Grouped UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix armband assignment so one number is shared across all of a dog's classes in a show, then redesign the entry management page to group class entries under their enrollment (order) with payment info at the order level.

**Architecture:** Phase 1 is a DB migration + two function rewrites. Phase 2 adds an enrollment-grouping utility and a new `EnrollmentCard` component that wraps existing `EntryListCard`s — no existing action handlers need to change. The `entries` table remains the source of class-level data; `enrollments` becomes the visible order header.

**Tech Stack:** TypeScript, React, Supabase (PostgreSQL), shadcn/ui, Vitest

---

## Background: What's Wrong Today

**Armband:** `entries.armband` is a per-class-entry column. `autoAssignArmbands` assigns a new sequential number to every class entry row independently — so Dog Bravo in Interior Novice A gets "1" and the same dog in Interior Excellent gets "2". Manual `assignArmband` only updates the one clicked row. The `armbands` table (which has `dog_id` + `show_id`) was built to be the source of truth but is not written to or enforced. The status filter also incorrectly excludes `'accepted'` entries.

**Order-grouped UI:** The entries page shows one card per class entry with a "Payment Due" badge on each. An exhibitor with 2 dogs × 5 classes generates 10 cards each showing the same payment status. Payment belongs at the order (enrollment) level, not the line-item level. The `registrationId` field in `EntryManagementEntry` is also incorrectly set to `entry.id` instead of `enrollment.id`, which prevents enrollment-based grouping.

---

## Files Modified

| File                                                                   | Change                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `supabase/migrations/166_armband_per_dog_per_show.sql`                 | New — UNIQUE(show_id, dog_id) on armbands table                                              |
| `apps/myk9show/src/services/database/queries/secretaryEntryQueries.ts` | Rewrite `assignArmband` and `autoAssignArmbands`; add enrollment fields to query             |
| `apps/myk9show/src/utils/armbandUtils.ts`                              | New — pure `computeArmbandAssignments` function (testable without DB)                        |
| `apps/myk9show/src/utils/armbandUtils.test.ts`                         | New — unit tests for armband computation                                                     |
| `apps/myk9show/src/types/entry-management-types.ts`                    | Add `dogId`, enrollment payment fields to `EntryManagementEntry`; new `EnrollmentGroup` type |
| `apps/myk9show/src/hooks/useEntryManagementData.ts`                    | Fix `registrationId` mapping; populate new fields; add `enrollmentGroups` derived value      |
| `apps/myk9show/src/hooks/useEntryManagementActions.ts`                 | Fix `handleArmbandAssign` to propagate to all dog's entries in local state                   |
| `apps/myk9show/src/utils/enrollmentGrouping.ts`                        | New — pure `groupEntriesByEnrollment` function                                               |
| `apps/myk9show/src/utils/enrollmentGrouping.test.ts`                   | New — unit tests for grouping logic                                                          |
| `apps/myk9show/src/components/entries/management/EnrollmentCard.tsx`   | New — order-level card wrapping class entry rows                                             |
| `apps/myk9show/src/components/entries/management/RegistrationView.tsx` | Render `EnrollmentCard` list instead of flat `EntryListCard` list                            |

---

## Phase 1: Armband Fix

### Task 1: DB Migration — backfill, RLS, and UNIQUE constraint **[EXPANDED]**

**Files:**

- Create: `supabase/migrations/166_armband_per_dog_per_show.sql`

The migration must do three things in order:

1. **Backfill** — copy any existing `entries.armband` values into the `armbands` table so they are visible as canonical assignments.
2. **Deduplicate** — collapse any pre-existing duplicate rows (kept by most recent).
3. **Constrain** — add `UNIQUE(show_id, dog_id)` and ensure RLS lets the trial secretary write the table.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/166_armband_per_dog_per_show.sql
-- Enforce one armband assignment per dog per show.
-- 1) Backfill from entries.armband (legacy data)
-- 2) Deduplicate
-- 3) Add UNIQUE constraint
-- 4) Ensure RLS lets trial secretaries write the table

-- ---------------------------------------------------------------------------
-- 1) Backfill armbands table from entries.armband (legacy data)
--    For every (show_id, dog_id) that has armband set in entries but no
--    matching row in armbands, insert one. If conflicting (multiple armband
--    values for same dog in same show), pick the most recent updated entry.
-- ---------------------------------------------------------------------------

INSERT INTO armbands (show_id, dog_id, armband_number, assigned_at, is_available)
SELECT
  e.show_id,
  e.dog_id,
  e.armband,
  COALESCE(e.updated_at, NOW()),
  FALSE
FROM (
  SELECT DISTINCT ON (show_id, dog_id)
    show_id, dog_id, armband, updated_at
  FROM entries
  WHERE armband IS NOT NULL
    AND show_id IS NOT NULL
    AND dog_id IS NOT NULL
    AND deleted_at IS NULL
  ORDER BY show_id, dog_id, updated_at DESC
) e
LEFT JOIN armbands a
  ON a.show_id = e.show_id AND a.dog_id = e.dog_id
WHERE a.id IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Deduplicate: keep the most recent armband row per (show_id, dog_id)
-- ---------------------------------------------------------------------------

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY show_id, dog_id
      ORDER BY created_at DESC
    ) AS rn
  FROM armbands
  WHERE dog_id IS NOT NULL
)
DELETE FROM armbands WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ---------------------------------------------------------------------------
-- 3) Add unique constraint: one armband per dog per show
-- ---------------------------------------------------------------------------

ALTER TABLE armbands
  ADD CONSTRAINT armbands_show_dog_unique UNIQUE (show_id, dog_id);

-- ---------------------------------------------------------------------------
-- 4) RLS: trial secretaries can manage armbands for their shows
--    (Use IF NOT EXISTS so re-running is safe)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'armbands'
      AND policyname = 'secretaries_manage_armbands'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY "secretaries_manage_armbands" ON armbands
      FOR ALL USING (
        show_id IN (
          SELECT s.id FROM shows s
          WHERE has_role('trial_secretary', s.club_id)
             OR has_role('club_admin', s.club_id)
             OR has_role('platform_admin')
        )
      ) WITH CHECK (
        show_id IN (
          SELECT s.id FROM shows s
          WHERE has_role('trial_secretary', s.club_id)
             OR has_role('club_admin', s.club_id)
             OR has_role('platform_admin')
        )
      );
    $POLICY$;
  END IF;
END $$;

SELECT 'Migration 166: armbands backfilled, deduplicated, UNIQUE(show_id, dog_id) added, RLS enabled' AS status;
```

- [ ] **Step 2: Confirm with user before deploying [ADDED]**

Per `CLAUDE.md`'s "Auto Mode shared-system writes" rule, pause and ask the user to confirm before running `supabase db push`. Even if the user has approved the broader plan, shared-DB pushes require explicit re-confirmation.

Suggested message:

> "About to run `supabase db push` for migration 166 (armbands backfill + UNIQUE + RLS). This writes to the linked Supabase staging DB. Proceed?"

- [ ] **Step 3: Snapshot the armbands table before pushing [ADDED]**

The migration includes a destructive `DELETE` of duplicate rows. Snapshot the table so we can restore if anything goes wrong:

```bash
source supabase/.env && supabase db dump --password "$SUPABASE_DB_PASSWORD" \
  --data-only --schema public --table armbands \
  > /tmp/armbands_backup_$(date +%Y%m%d_%H%M%S).sql
ls -lh /tmp/armbands_backup_*.sql
```

Expected: file size > 0 bytes.

- [ ] **Step 4: Deploy the migration**

```bash
source supabase/.env && supabase db push --password "$SUPABASE_DB_PASSWORD"
```

Expected: `Migration 166: armbands backfilled, deduplicated, UNIQUE(show_id, dog_id) added, RLS enabled`

- [ ] **Step 5: Verify constraint, RLS, and backfill counts**

```bash
source supabase/.env && supabase db connect --password "$SUPABASE_DB_PASSWORD" \
  --command "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'armbands' AND constraint_name = 'armbands_show_dog_unique';"
```

Expected: one row with `armbands_show_dog_unique`

```bash
source supabase/.env && supabase db connect --password "$SUPABASE_DB_PASSWORD" \
  --command "SELECT COUNT(*) AS armbands_rows, COUNT(DISTINCT (show_id, dog_id)) AS distinct_pairs FROM armbands;"
```

Expected: `armbands_rows == distinct_pairs` (proves uniqueness invariant holds).

```bash
source supabase/.env && supabase db connect --password "$SUPABASE_DB_PASSWORD" \
  --command "SELECT policyname FROM pg_policies WHERE tablename = 'armbands';"
```

Expected: includes `secretaries_manage_armbands`.

- [ ] **Step 6: Rollback procedure (documentation only) [ADDED]**

If the migration causes problems, the rollback is:

```sql
-- Drop the constraint to allow duplicates again
ALTER TABLE armbands DROP CONSTRAINT IF EXISTS armbands_show_dog_unique;
-- Drop the policy
DROP POLICY IF EXISTS "secretaries_manage_armbands" ON armbands;
-- Restore deleted rows from snapshot
\i /tmp/armbands_backup_<timestamp>.sql
```

The backfilled rows are not rolled back automatically; if needed, identify them via `WHERE created_at > '<migration timestamp>'`.

---

### Task 2: Extract pure armband logic + unit tests

**Files:**

- Create: `apps/myk9show/src/utils/armbandUtils.ts`
- Create: `apps/myk9show/src/utils/armbandUtils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/myk9show/src/utils/armbandUtils.test.ts
import { describe, it, expect } from 'vitest';
import { computeArmbandAssignments, resolveStartNumber } from './armbandUtils';

describe('computeArmbandAssignments', () => {
  it('assigns sequential numbers starting from startNumber', () => {
    const result = computeArmbandAssignments(['dog-1', 'dog-2', 'dog-3'], 5);
    expect(result).toEqual([
      { dogId: 'dog-1', armband: '5' },
      { dogId: 'dog-2', armband: '6' },
      { dogId: 'dog-3', armband: '7' },
    ]);
  });

  it('returns empty array for no dogs', () => {
    expect(computeArmbandAssignments([], 1)).toEqual([]);
  });

  it('starts at 1 by default', () => {
    const result = computeArmbandAssignments(['dog-a'], 1);
    expect(result[0].armband).toBe('1');
  });
});

describe('resolveStartNumber', () => {
  it('returns startNumber when no existing armbands', () => {
    expect(resolveStartNumber(null, 1)).toBe(1);
    expect(resolveStartNumber(undefined, 5)).toBe(5);
  });

  it('uses max existing + 1 when higher than startNumber', () => {
    expect(resolveStartNumber('10', 1)).toBe(11);
  });

  it('uses startNumber when higher than max existing + 1', () => {
    expect(resolveStartNumber('3', 10)).toBe(10);
  });

  it('ignores non-numeric existing armbands', () => {
    expect(resolveStartNumber('ABC', 1)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/myk9show && npx vitest run src/utils/armbandUtils.test.ts --reporter=verbose
```

Expected: FAIL — `Cannot find module './armbandUtils'`

- [ ] **Step 3: Implement the utility**

```typescript
// apps/myk9show/src/utils/armbandUtils.ts

export interface ArmbandAssignment {
  dogId: string;
  armband: string;
}

/**
 * Given a deduplicated list of dogIds and a starting number,
 * returns one sequential armband per dog.
 */
export function computeArmbandAssignments(
  dogIds: string[],
  startNumber: number
): ArmbandAssignment[] {
  return dogIds.map((dogId, i) => ({ dogId, armband: String(startNumber + i) }));
}

/**
 * Resolves the actual starting number given an optional existing max armband string.
 * Picks the higher of startNumber and (existingMax + 1).
 */
export function resolveStartNumber(
  existingMaxArmband: string | null | undefined,
  startNumber: number
): number {
  if (!existingMaxArmband) return startNumber;
  const parsed = parseInt(existingMaxArmband, 10);
  if (isNaN(parsed)) return startNumber;
  return Math.max(startNumber, parsed + 1);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/utils/armbandUtils.test.ts --reporter=verbose
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/myk9show && git add src/utils/armbandUtils.ts src/utils/armbandUtils.test.ts
git commit -m "feat(armbands): add computeArmbandAssignments pure utility"
```

---

### Task 3: Rewrite `assignArmband` and `autoAssignArmbands`

**Files:**

- Modify: `apps/myk9show/src/services/database/queries/secretaryEntryQueries.ts`

- [ ] **Step 1: Replace `assignArmband` (with concurrent-conflict error message) [EXPANDED]**

Replace the function at line ~308 with:

```typescript
/**
 * Assign an armband to a dog for the whole show.
 * Writes to the armbands table (source of truth) and propagates
 * to ALL class entries for that dog in the show.
 *
 * If another dog in the same show already has this armband number, the
 * UNIQUE(show_id, armband_number) constraint will fire — surface a clear
 * "already assigned" error rather than the raw Postgres message.
 */
export const assignArmband = async (entryId: string, armband: string) => {
  const startTime = Date.now();

  try {
    // Look up the dog and show from this entry
    const { data: entry, error: lookupError } = await supabase
      .from('entries')
      .select('dog_id, show_id')
      .eq('id', entryId)
      .single();

    if (lookupError || !entry) {
      throw createDatabaseError(
        lookupError ?? new Error('Entry not found'),
        'entries',
        'assign_armband'
      );
    }

    // Upsert into armbands (one per dog per show)
    const { error: armbandError } = await supabase.from('armbands').upsert(
      {
        show_id: entry.show_id,
        dog_id: entry.dog_id,
        armband_number: armband,
        assigned_at: new Date().toISOString(),
        is_available: false,
      },
      { onConflict: 'show_id,dog_id' }
    );

    if (armbandError) {
      // Postgres 23505 = unique_violation. Translate the message so the UI
      // shows "already assigned" instead of a raw constraint name.
      const isConflict =
        (armbandError as { code?: string }).code === '23505' ||
        armbandError.message?.includes('armbands_show_armband_number') ||
        armbandError.message?.includes('duplicate key');
      if (isConflict) {
        return {
          data: null,
          error: createDatabaseError(
            new Error(`Armband ${armband} is already assigned to another dog in this show.`),
            'armbands',
            'assign_armband'
          ),
        };
      }
      throw createDatabaseError(armbandError, 'armbands', 'assign_armband');
    }

    // Propagate to all class entries for this dog in this show
    const { data, error: updateError } = await supabase
      .from('entries')
      .update({ armband, updated_at: new Date().toISOString() })
      .eq('dog_id', entry.dog_id)
      .eq('show_id', entry.show_id)
      .is('deleted_at', null)
      .select('id');

    const duration = Date.now() - startTime;
    logQuery('entries', 'assign_armband', duration, updateError?.message);

    if (updateError) throw createDatabaseError(updateError, 'entries', 'assign_armband');

    return { data: { updated: data?.length ?? 0, armband }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'assign_armband');
    logQuery('entries', 'assign_armband', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
```

- [ ] **Step 2: Replace `autoAssignArmbands`**

Replace the function at line ~341 with:

```typescript
/**
 * Auto-assign sequential armbands to all dogs in a show that don't have one yet.
 * Assigns one number per dog (not per class entry) and propagates to all their entries.
 */
export const autoAssignArmbands = async (showId: string, startNumber: number = 1) => {
  const startTime = Date.now();

  try {
    // Get all entries for accepted/confirmed dogs without an armband yet
    const { data: unassigned, error: fetchError } = await supabase
      .from('entries')
      .select('dog_id')
      .eq('show_id', showId)
      .in('entry_status', ['accepted', 'confirmed'])
      .is('deleted_at', null)
      .is('armband', null);

    if (fetchError) throw createDatabaseError(fetchError, 'entries', 'auto_assign_armbands_fetch');

    // One armband per dog — deduplicate
    const dogIds = [...new Set((unassigned ?? []).map(e => e.dog_id).filter(Boolean) as string[])];

    if (dogIds.length === 0) {
      return { data: { assigned: 0, startedAt: startNumber }, error: null };
    }

    // Avoid conflicting with existing armbands
    const { data: maxRow } = await supabase
      .from('entries')
      .select('armband')
      .eq('show_id', showId)
      .is('deleted_at', null)
      .not('armband', 'is', null)
      .order('armband', { ascending: false })
      .limit(1)
      .single();

    const nextNumber = resolveStartNumber(maxRow?.armband ?? null, startNumber);
    const assignments = computeArmbandAssignments(dogIds, nextNumber);

    let assignedCount = 0;
    for (const { dogId, armband } of assignments) {
      // Write to armbands table (source of truth)
      await supabase.from('armbands').upsert(
        {
          show_id: showId,
          dog_id: dogId,
          armband_number: armband,
          assigned_at: new Date().toISOString(),
          is_available: false,
        },
        { onConflict: 'show_id,dog_id' }
      );

      // Propagate to all class entries for this dog
      const { error: updateError } = await supabase
        .from('entries')
        .update({ armband, updated_at: new Date().toISOString() })
        .eq('dog_id', dogId)
        .eq('show_id', showId)
        .is('deleted_at', null);

      if (!updateError) assignedCount++;
    }

    const duration = Date.now() - startTime;
    logQuery('entries', 'auto_assign_armbands', duration);
    return { data: { assigned: assignedCount, startedAt: nextNumber }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'auto_assign_armbands');
    logQuery('entries', 'auto_assign_armbands', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
```

- [ ] **Step 3: Add the import for armbandUtils at the top of secretaryEntryQueries.ts**

After the existing imports, add:

```typescript
import { computeArmbandAssignments, resolveStartNumber } from '@/utils/armbandUtils';
```

- [ ] **Step 4: Typecheck**

```bash
cd /path/to/myk9-platform && pnpm typecheck 2>&1 | grep "error TS"
```

Expected: no output (no errors)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/services/database/queries/secretaryEntryQueries.ts
git commit -m "fix(armbands): assign per dog per show, propagate to all class entries"
```

---

### Task 4: Fix local state propagation for armband assignment

**Files:**

- Modify: `apps/myk9show/src/types/entry-management-types.ts`
- Modify: `apps/myk9show/src/hooks/useEntryManagementData.ts`
- Modify: `apps/myk9show/src/hooks/useEntryManagementActions.ts`

- [ ] **Step 1: Add `dogId` to `EntryManagementEntry`**

In `apps/myk9show/src/types/entry-management-types.ts`, add `dogId` to the interface:

```typescript
export interface EntryManagementEntry {
  id: string;
  registrationId: string;
  entryNumber: string;
  showId: string;
  dogId: string; // ADD THIS — needed to propagate armband across dog's entries
  dogName: string;
  ownerName: string;
  ownerEmail: string;
  handlerName: string;
  classes: EntryClass[];
  totalFee: number;
  paidAmount: number;
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
  submittedAt: Date;
  lastUpdated: Date;
  notes?: string;
  armbandNumber?: string;
  confirmationNumber?: string;
  comped?: boolean;
  compedReason?: string;
}
```

- [ ] **Step 2: Populate `dogId` in the data transform**

In `apps/myk9show/src/hooks/useEntryManagementData.ts`, inside the `(data || []).map(...)` transform, add `dogId` to the returned object. The field maps to `entry.dog_id`:

```typescript
// Inside the .map((entry: SecretaryEntry) => ({ ... })) block, add:
dogId: entry.dog_id || '',
```

Place it directly after `id: entry.id,`.

- [ ] **Step 3: Fix `handleArmbandAssign` to propagate to all dog entries in local state**

In `apps/myk9show/src/hooks/useEntryManagementActions.ts`, find `handleArmbandAssign` (the function that calls `assignArmband` on success). Replace the `setEntries` optimistic update inside it:

**Before** (updates only the clicked entry):

```typescript
setEntries(prev =>
  prev.map(e =>
    e.id === armbandDialog.entry?.id
      ? { ...e, armbandNumber: armbandDialog.value.trim(), entryNumber: armbandDialog.value.trim() }
      : e
  )
);
```

**After** (updates all entries for the same dog in the same show):

```typescript
const targetDogId = armbandDialog.entry.dogId;
const targetShowId = armbandDialog.entry.showId;
const armband = armbandDialog.value.trim();
setEntries(prev =>
  prev.map(e =>
    e.dogId === targetDogId && e.showId === targetShowId
      ? { ...e, armbandNumber: armband, entryNumber: armband }
      : e
  )
);
```

- [ ] **Step 4: Typecheck**

```bash
cd /path/to/myk9-platform && pnpm typecheck 2>&1 | grep "error TS"
```

Expected: no output

- [ ] **Step 5: Manually verify armband assignment in the browser**

1. `pnpm dev:show` — open `localhost:5173/secretary/entries`
2. Select a show with entries
3. Click the armband icon (#) on an entry with multiple classes
4. Assign armband "99"
5. Verify all class entries for that dog now show "99"

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/types/entry-management-types.ts \
        apps/myk9show/src/hooks/useEntryManagementData.ts \
        apps/myk9show/src/hooks/useEntryManagementActions.ts
git commit -m "fix(armbands): propagate armband to all dog entries in local state"
```

---

## Phase 2: Order-Grouped Entry UI

### Task 5: Extend query with enrollment payment fields + fix registrationId

**Files:**

- Modify: `apps/myk9show/src/services/database/queries/secretaryEntryQueries.ts`
- Modify: `apps/myk9show/src/hooks/useEntryManagementData.ts`
- Modify: `apps/myk9show/src/types/entry-management-types.ts`

The current query fetches `registration:registration_id (id, confirmation_number)`. We need `payment_status`, `payment_reference` (Stripe payment_intent_id), and `total_amount` from the enrollment. We also need to fix `registrationId: entry.id` → the actual enrollment id.

- [ ] **Step 1: Extend the `SecretaryEntry` type**

In `secretaryEntryQueries.ts`, find the `SecretaryEntry` interface (around line 15). The `registration` field currently has `{ id; confirmation_number }`. Add the new fields:

```typescript
export interface SecretaryEntry {
  // ... existing fields ...
  registration: {
    id: string;
    confirmation_number: string;
    payment_status: string | null;
    payment_reference: string | null;
    total_amount: number | null;
  } | null;
}
```

- [ ] **Step 2: Extend the Supabase select in `getEntriesForShow`**

Find the `registration:registration_id (...)` line in the select string and expand it:

```typescript
registration:registration_id (
  id,
  confirmation_number,
  payment_status,
  payment_reference,
  total_amount
),
```

- [ ] **Step 3: Add enrollment fields to `EntryManagementEntry`**

In `entry-management-types.ts`, add these optional fields to `EntryManagementEntry`:

```typescript
export interface EntryManagementEntry {
  // ... existing fields ...
  enrollmentPaymentStatus?: string | null;
  enrollmentPaymentReference?: string | null; // Stripe payment_intent_id
  enrollmentTotalAmount?: number | null;
}
```

- [ ] **Step 4: Fix the data transform**

In `useEntryManagementData.ts`, the transform currently has `registrationId: entry.id` (wrong — this is the entry's own ID, not the enrollment ID). Fix this and populate the new fields:

```typescript
// BEFORE:
registrationId: entry.id,

// AFTER:
registrationId: entry.registration?.id ?? '',
```

Also add the new enrollment fields to the transform object:

```typescript
...(entry.registration?.payment_status != null
  ? { enrollmentPaymentStatus: entry.registration.payment_status }
  : {}),
...(entry.registration?.payment_reference != null
  ? { enrollmentPaymentReference: entry.registration.payment_reference }
  : {}),
...(entry.registration?.total_amount != null
  ? { enrollmentTotalAmount: entry.registration.total_amount }
  : {}),
```

- [ ] **Step 5: Typecheck**

```bash
cd /path/to/myk9-platform && pnpm typecheck 2>&1 | grep "error TS"
```

Expected: no output

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/services/database/queries/secretaryEntryQueries.ts \
        apps/myk9show/src/types/entry-management-types.ts \
        apps/myk9show/src/hooks/useEntryManagementData.ts
git commit -m "feat(entries): extend query with enrollment payment fields; fix registrationId mapping"
```

---

### Task 6: Enrollment grouping utility + tests

**Files:**

- Create: `apps/myk9show/src/utils/enrollmentGrouping.ts`
- Create: `apps/myk9show/src/utils/enrollmentGrouping.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/myk9show/src/utils/enrollmentGrouping.test.ts
import { describe, it, expect } from 'vitest';
import { groupEntriesByEnrollment } from './enrollmentGrouping';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

const base: EntryManagementEntry = {
  id: '',
  registrationId: '',
  entryNumber: '',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Bravo',
  ownerName: 'Test',
  ownerEmail: '',
  handlerName: 'Alice',
  classes: [],
  totalFee: 10,
  paidAmount: 10,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID,
  submittedAt: new Date(),
  lastUpdated: new Date(),
};

describe('groupEntriesByEnrollment', () => {
  it('groups entries sharing a registrationId into one group', () => {
    const entries: EntryManagementEntry[] = [
      { ...base, id: 'e1', registrationId: 'reg-1', dogId: 'dog-1', dogName: 'Bravo' },
      { ...base, id: 'e2', registrationId: 'reg-1', dogId: 'dog-1', dogName: 'Bravo' },
      { ...base, id: 'e3', registrationId: 'reg-1', dogId: 'dog-2', dogName: 'Charlie' },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].enrollmentId).toBe('reg-1');
    expect(groups[0].entries).toHaveLength(3);
  });

  it('creates separate groups for different registrationIds', () => {
    const entries: EntryManagementEntry[] = [
      { ...base, id: 'e1', registrationId: 'reg-1' },
      { ...base, id: 'e2', registrationId: 'reg-2' },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups).toHaveLength(2);
  });

  it('groups entries with no registrationId under a single unregistered group', () => {
    const entries: EntryManagementEntry[] = [
      { ...base, id: 'e1', registrationId: '' },
      { ...base, id: 'e2', registrationId: '' },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].enrollmentId).toBeNull();
  });

  it('sums entry fees as groupTotal when enrollmentTotalAmount is absent (dollars)', () => {
    const entries: EntryManagementEntry[] = [
      { ...base, id: 'e1', registrationId: 'reg-1', totalFee: 15 },
      { ...base, id: 'e2', registrationId: 'reg-1', totalFee: 20 },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups[0].totalAmount).toBe(35);
    expect(groups[0].totalAmountUnit).toBe('dollars');
  });

  it('uses enrollmentTotalAmount when present (cents from Stripe)', () => {
    const entries: EntryManagementEntry[] = [
      { ...base, id: 'e1', registrationId: 'reg-1', totalFee: 15, enrollmentTotalAmount: 5000 },
      { ...base, id: 'e2', registrationId: 'reg-1', totalFee: 20, enrollmentTotalAmount: 5000 },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups[0].totalAmount).toBe(5000);
    expect(groups[0].totalAmountUnit).toBe('cents');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/myk9show && npx vitest run src/utils/enrollmentGrouping.test.ts --reporter=verbose
```

Expected: FAIL — `Cannot find module './enrollmentGrouping'`

- [ ] **Step 3: Implement the utility**

```typescript
// apps/myk9show/src/utils/enrollmentGrouping.ts
import type { EntryManagementEntry } from '@/types/entry-management-types';

export interface EnrollmentGroup {
  enrollmentId: string | null;
  confirmationNumber: string | null;
  handlerName: string;
  paymentStatus: string;
  totalAmount: number;
  /**
   * Unit of `totalAmount`. Stripe stores amounts in cents on `enrollments.total_amount`,
   * but `entries.entry_fee` (which we sum as a fallback) is in dollars. Track the unit
   * explicitly instead of guessing from value magnitude.
   */
  totalAmountUnit: 'cents' | 'dollars';
  paymentReference: string | null;
  entries: EntryManagementEntry[];
}

export function groupEntriesByEnrollment(entries: EntryManagementEntry[]): EnrollmentGroup[] {
  const map = new Map<string, EnrollmentGroup>();

  for (const entry of entries) {
    const key = entry.registrationId || '__unregistered__';

    if (!map.has(key)) {
      const hasEnrollmentTotal = entry.enrollmentTotalAmount != null;
      map.set(key, {
        enrollmentId: entry.registrationId || null,
        confirmationNumber: entry.confirmationNumber ?? null,
        handlerName: entry.handlerName,
        paymentStatus: entry.enrollmentPaymentStatus ?? entry.paymentStatus,
        totalAmount: hasEnrollmentTotal ? entry.enrollmentTotalAmount! : 0,
        totalAmountUnit: hasEnrollmentTotal ? 'cents' : 'dollars',
        paymentReference: entry.enrollmentPaymentReference ?? null,
        entries: [],
      });
    }

    const group = map.get(key)!;
    group.entries.push(entry);

    // Fallback: if there is no enrollment-level total, sum entry_fee values (dollars).
    if (group.totalAmountUnit === 'dollars') {
      group.totalAmount = group.entries.reduce((sum, e) => sum + e.totalFee, 0);
    }
  }

  return [...map.values()];
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/utils/enrollmentGrouping.test.ts --reporter=verbose
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/utils/enrollmentGrouping.ts \
        apps/myk9show/src/utils/enrollmentGrouping.test.ts
git commit -m "feat(entries): add enrollment grouping utility with tests"
```

---

### Task 7: EnrollmentCard component

**Files:**

- Create: `apps/myk9show/src/components/entries/management/EnrollmentCard.tsx`

This component renders one order/enrollment at the top level (confirmation number, handler, payment status, total) and lists the class entries beneath it using the existing `EntryListCard`. It does not replace `EntryListCard` — it wraps it.

- [ ] **Step 1: Create the component**

```typescript
// apps/myk9show/src/components/entries/management/EnrollmentCard.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EntryListCard } from './EntryListCard';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import type { EntryStatus } from '@/types/show-registration-types';

interface EnrollmentCardProps {
  group: EnrollmentGroup;
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  onOpenCheckInDialog: (entry: EntryManagementEntry, cls: EntryClass) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onCompEntry?: (entryId: string) => void;
  selectedEntries: string[];
  onSelectEntry: (entryId: string, checked: boolean) => void;
}

const PAYMENT_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  paid: { label: 'Paid', variant: 'default' },
  pending: { label: 'Payment Due', variant: 'destructive' },
  refunded: { label: 'Refunded', variant: 'secondary' },
  waived: { label: 'Waived', variant: 'outline' },
};

export const EnrollmentCard: React.FC<EnrollmentCardProps> = ({
  group,
  onStatusChange,
  onOpenCheckInDialog,
  onOpenArmbandDialog,
  onCompEntry,
  selectedEntries,
  onSelectEntry,
}) => {
  const [expanded, setExpanded] = useState(true);

  const paymentBadge = PAYMENT_BADGE[group.paymentStatus] ?? { label: group.paymentStatus, variant: 'outline' as const };
  const dollars = group.totalAmountUnit === 'cents'
    ? group.totalAmount / 100
    : group.totalAmount;
  const displayTotal = `$${dollars.toFixed(2)}`;

  return (
    <Card className="border border-border/60">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: handler + confirmation */}
          <div className="flex items-center gap-3">
            <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <span className="font-semibold text-sm">{group.handlerName}</span>
              {group.confirmationNumber && (
                <span className="text-xs text-muted-foreground ml-2">
                  #{group.confirmationNumber}
                </span>
              )}
              {group.paymentReference && (
                <span className="text-xs text-muted-foreground ml-2 font-mono">
                  {group.paymentReference.slice(0, 16)}…
                </span>
              )}
            </div>
          </div>

          {/* Right: payment badge + total + expand */}
          <div className="flex items-center gap-2">
            <Badge variant={paymentBadge.variant}>{paymentBadge.label}</Badge>
            <span className="text-sm font-medium">{displayTotal}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(v => !v)}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className={cn('pt-0 px-0 pb-2 space-y-1')}>
          {group.entries.map(entry => (
            <EntryListCard
              key={entry.id}
              entry={entry}
              onStatusChange={onStatusChange}
              onOpenCheckInDialog={onOpenCheckInDialog}
              onOpenArmbandDialog={onOpenArmbandDialog}
              onCompEntry={onCompEntry}
              isSelected={selectedEntries.includes(entry.id)}
              onSelect={onSelectEntry}
              hideBulkCheckbox={false}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
};
```

- [ ] **Step 2: Typecheck**

```bash
cd /path/to/myk9-platform && pnpm typecheck 2>&1 | grep "error TS"
```

If there are errors about `EntryListCard` props not matching, read `EntryListCard.tsx` and adjust the prop names to match exactly. The prop interface for `EntryListCard` is the reference — do not change `EntryListCard`.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/entries/management/EnrollmentCard.tsx
git commit -m "feat(entries): add EnrollmentCard component for order-level grouping"
```

---

### Task 7b: EnrollmentCard component tests **[ADDED]**

**Files:**

- Create: `apps/myk9show/src/components/entries/management/__tests__/EnrollmentCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/myk9show/src/components/entries/management/__tests__/EnrollmentCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnrollmentCard } from '../EnrollmentCard';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

const baseEntry: EntryManagementEntry = {
  id: 'e1',
  registrationId: 'reg-1',
  entryNumber: '7',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Bravo',
  ownerName: 'Test',
  ownerEmail: '',
  handlerName: 'Alice',
  classes: [
    { id: 'c1', name: 'Interior Novice A', number: '1', fee: 10, status: 'entered' },
  ],
  totalFee: 10,
  paidAmount: 10,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID,
  submittedAt: new Date(),
  lastUpdated: new Date(),
};

const baseGroup: EnrollmentGroup = {
  enrollmentId: 'reg-1',
  confirmationNumber: 'MK9-ABCD',
  handlerName: 'Alice',
  paymentStatus: 'paid',
  totalAmount: 5000,
  totalAmountUnit: 'cents',
  paymentReference: 'pi_1A2B3C4D5E6F7G8H',
  entries: [baseEntry],
};

const noopProps = {
  onStatusChange: vi.fn(),
  onOpenCheckInDialog: vi.fn(),
  onOpenArmbandDialog: vi.fn(),
  selectedEntries: [],
  onSelectEntry: vi.fn(),
};

describe('EnrollmentCard', () => {
  it('renders handler name and confirmation number', () => {
    render(<EnrollmentCard group={baseGroup} {...noopProps} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/MK9-ABCD/)).toBeInTheDocument();
  });

  it('formats cents total as dollars', () => {
    render(<EnrollmentCard group={baseGroup} {...noopProps} />);
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('formats dollars total without unit conversion', () => {
    const group: EnrollmentGroup = { ...baseGroup, totalAmount: 35, totalAmountUnit: 'dollars' };
    render(<EnrollmentCard group={group} {...noopProps} />);
    expect(screen.getByText('$35.00')).toBeInTheDocument();
  });

  it('shows the truncated Stripe payment reference', () => {
    render(<EnrollmentCard group={baseGroup} {...noopProps} />);
    expect(screen.getByText(/pi_1A2B3C4D5E6F7G8H/)).toBeInTheDocument();
  });

  it('renders the appropriate payment badge', () => {
    render(<EnrollmentCard group={baseGroup} {...noopProps} />);
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('collapses and expands on toggle click', () => {
    render(<EnrollmentCard group={baseGroup} {...noopProps} />);
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Collapse'));
    expect(screen.queryByText('Bravo')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail then pass**

```bash
cd apps/myk9show && npx vitest run src/components/entries/management/__tests__/EnrollmentCard.test.tsx --reporter=verbose
```

If `EntryListCard` requires extra context (e.g., a wrapping table or a data provider), adjust the rendered output expectations to match — the test should focus on `EnrollmentCard`'s own rendering, not on the children.

Expected: 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/entries/management/__tests__/EnrollmentCard.test.tsx
git commit -m "test(entries): cover EnrollmentCard rendering and unit formatting"
```

---

### Task 7c: Hide per-class payment badge in EntryListCard **[ADDED]**

**Files:**

- Modify: `apps/myk9show/src/components/entries/management/EntryListCard.tsx`

The original goal was to consolidate payment status to the order-level card. With `EnrollmentCard` displaying it at the top, the per-class-row payment badge in `EntryListCard` is now duplicated noise.

- [ ] **Step 1: Add a `hidePaymentBadge` prop to `EntryListCard`**

In `EntryListCard.tsx`, find the `EntryListCardProps` interface and add:

```typescript
interface EntryListCardProps {
  // ... existing props ...
  /**
   * When true, suppress the payment-status badge inside the card.
   * Set by parents (like EnrollmentCard) that show payment status at a higher level.
   */
  hidePaymentBadge?: boolean;
}
```

- [ ] **Step 2: Conditionally render the payment badge**

Find the JSX block that renders the payment badge (search for `paymentStatus` references that produce a `<Badge>`). Wrap it with the new flag:

```tsx
{!hidePaymentBadge && (
  <Badge variant={...}>{...}</Badge>
)}
```

- [ ] **Step 3: Pass `hidePaymentBadge={true}` from `EnrollmentCard`**

In `EnrollmentCard.tsx`, update the `<EntryListCard ... />` render to include `hidePaymentBadge`:

```tsx
<EntryListCard
  key={entry.id}
  entry={entry}
  onStatusChange={onStatusChange}
  onOpenCheckInDialog={onOpenCheckInDialog}
  onOpenArmbandDialog={onOpenArmbandDialog}
  onCompEntry={onCompEntry}
  isSelected={selectedEntries.includes(entry.id)}
  onSelect={onSelectEntry}
  hideBulkCheckbox={false}
  hidePaymentBadge={true}
/>
```

- [ ] **Step 4: Verify existing `EntryListCard` tests still pass**

```bash
cd apps/myk9show && npx vitest run src/components/entries/management/__tests__/EntryListCard.test.tsx --reporter=verbose
```

The default behavior (no flag) must still render the payment badge so existing callers don't break.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/entries/management/EntryListCard.tsx \
        apps/myk9show/src/components/entries/management/EnrollmentCard.tsx
git commit -m "feat(entries): suppress per-class payment badge inside EnrollmentCard"
```

---

### Task 8: Wire EnrollmentCard into RegistrationView **[EXPANDED]**

**Files:**

- Modify: `apps/myk9show/src/components/entries/management/RegistrationView.tsx`
- Modify: `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx`

**Where to derive `enrollmentGroups`:** Filtering (search, status, payment, tabs) happens in `useEntryManagementFilters` which is called inside `EntryManagementPage`. The filtered list is passed into `RegistrationView` as `entries`. Therefore the grouping must happen in `EntryManagementPage` _after_ filtering and _before_ passing to `RegistrationView` — not in `useEntryManagementData`. Otherwise tab filtering would not apply to the grouped view.

- [ ] **Step 1: Derive `enrollmentGroups` in `EntryManagementPage`**

In `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx`, locate where `useEntryManagementFilters` is called (around line 123 — `const { ... } = useEntryManagementFilters({ entries, tabCounts, showId: selectedShowId });`). The hook returns a filtered `filteredEntries` (or similarly named) variable that is passed to `RegistrationView` as `entries`.

Add the import:

```typescript
import { groupEntriesByEnrollment, type EnrollmentGroup } from '@/utils/enrollmentGrouping';
```

After the filter hook destructures, add a `useMemo` over the filtered list. If the filtered variable is named `filteredEntries`:

```typescript
const enrollmentGroups: EnrollmentGroup[] = React.useMemo(
  () => groupEntriesByEnrollment(filteredEntries),
  [filteredEntries]
);
```

If the filtered variable in the existing code uses a different name (e.g., the hook returns it as `entries` directly), match that name in the dependency array.

- [ ] **Step 2: Pass `enrollmentGroups` to `RegistrationView`**

In the JSX where `RegistrationView` is rendered, add the new prop alongside the existing ones:

```tsx
<RegistrationView
  // ... existing props ...
  entries={filteredEntries}     {/* keep — table view still uses flat list */}
  enrollmentGroups={enrollmentGroups}
/>
```

- [ ] **Step 3: Add `enrollmentGroups` prop to `RegistrationView` and render enrollment cards**

In `apps/myk9show/src/components/entries/management/RegistrationView.tsx`:

a. Add the imports:

```typescript
import { EnrollmentCard } from './EnrollmentCard';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
```

b. Add `enrollmentGroups` to the props interface:

```typescript
interface RegistrationViewProps {
  // ... existing props ...
  enrollmentGroups: EnrollmentGroup[];
}
```

c. Destructure it in the component signature.

d. Locate the JSX block that renders `<EntryListCard>` inside a `.map()` over the entries list (used for the card view). Replace that map with a map over `enrollmentGroups`:

```tsx
{
  enrollmentGroups.map(group => (
    <EnrollmentCard
      key={group.enrollmentId ?? `__unregistered__:${group.handlerName}`}
      group={group}
      onStatusChange={onStatusChange}
      onOpenCheckInDialog={onOpenCheckInDialog}
      onOpenArmbandDialog={onOpenArmbandDialog}
      onCompEntry={onCompEntry}
      selectedEntries={selectedEntries}
      onSelectEntry={onSelectEntry}
    />
  ));
}
```

**Important:** The page has both a card view and a table view (toggle on the page). Only replace the card-view render block. The table view (`EntriesTableView` from line 30) keeps its flat-entry rendering — the table is a different visualization where order grouping doesn't fit naturally. If the user later wants order grouping in the table view too, that's a follow-up.

- [ ] **Step 4: Typecheck**

```bash
cd /path/to/myk9-platform && pnpm typecheck 2>&1 | grep "error TS"
```

Fix any prop mismatches. Common issue: `onStatusChange` and `onOpenCheckInDialog` prop names in `RegistrationView` may differ from `EnrollmentCard`'s expected names — align them.

- [ ] **Step 5: Verify in browser**

1. `pnpm dev:show` — open `localhost:5173/secretary/entries`
2. Select a show with entries
3. Verify entries are now grouped into enrollment cards (one per handler/order)
4. Each card shows the handler name, confirmation number, payment status badge, and total
5. Cards expand/collapse to show class entries beneath them
6. No "Payment Due" badge appears on individual class entry rows
7. Check-in status still works per class entry
8. Armband dialog still works and shows the assigned number on all class entries for the dog

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/entries/management/RegistrationView.tsx \
        apps/myk9show/src/hooks/useEntryManagementData.ts \
        apps/myk9show/src/pages/secretary/EntryManagementPage.tsx
git commit -m "feat(entries): group entry management page by enrollment order"
```

---

## Final verification

- [ ] **Run the full myK9Show test suite**

```bash
cd apps/myk9show && pnpm vitest run --reporter=default \
  --exclude '**/integration/**' \
  --exclude '**/debug-*.test.*'
```

Expected: all tests pass (ignore PresenceService.test.ts and PerformanceService.test.ts — known flaky)

- [ ] **Run typecheck across the monorepo**

```bash
cd /path/to/myk9-platform && pnpm typecheck 2>&1 | grep "error TS"
```

Expected: no output

- [ ] **Ship PR**

```bash
git push -u origin HEAD
gh pr create --title "fix(entries): armband per dog + order-grouped entry UI"
```
