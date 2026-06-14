# Armband Auto-Assignment During Registration

**Date:** 2026-03-19
**Status:** Approved

## Problem

Entries created by the registration wizard have no armband number. Exhibitors need their armband number at registration time so it can be included in the confirmation email. Without it, show staff must manually assign armbands later — an extra step that delays communication and creates operational overhead.

## Design

### Core Rule

Each dog gets one armband number per show. The number is assigned when the dog's first entry is created and reused for all subsequent entries in that show. Numbers are sequential integers starting from a configurable per-show value (default 100). Cancelled entries leave gaps — numbers are never recycled.

### Database Changes

**Migration: add `starting_armband_number` to `shows`, add `UNIQUE(show_id, dog_id)` to `armbands`**

```sql
ALTER TABLE shows ADD COLUMN starting_armband_number INTEGER NOT NULL DEFAULT 100;

-- Enforce one armband per dog per show at the schema level
ALTER TABLE armbands ADD CONSTRAINT armbands_show_dog_unique UNIQUE (show_id, dog_id);
```

**Migration: Postgres function `assign_armband`**

```sql
CREATE OR REPLACE FUNCTION assign_armband(p_show_id UUID, p_dog_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
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

  -- Insert the assignment (entry_id intentionally omitted — armband is per-dog, not per-entry)
  INSERT INTO armbands (show_id, dog_id, armband_number, assigned_at, is_available)
  VALUES (p_show_id, p_dog_id, v_next::text, NOW(), FALSE);

  RETURN v_next;
END;
$$;
```

Key details:

- `FOR UPDATE` on the shows row serializes concurrent calls — no two registrations can claim the same number.
- `UNIQUE(show_id, dog_id)` constraint enforces one armband per dog per show at the schema level.
- `UNIQUE(show_id, armband_number)` constraint (existing) prevents duplicate numbers.
- Only numeric `armband_number` values are considered when computing the next number. Non-numeric values from manual tools are safely ignored.
- `COALESCE(starting_armband_number, 100)` guards against NULL.
- `entry_id` is intentionally omitted from the INSERT — the armband belongs to the dog for the entire show, not to a specific entry. One dog may have many entries sharing the same armband.
- `trial_id` is intentionally omitted — this design is one-armband-per-show. Per-trial series is a future enhancement.
- Returns the armband number (existing or newly assigned) as an integer.

### Application Layer

**Registration wizard (`ConfirmationStep` / entry creation):**

1. After each entry is written to the replication layer, call `supabase.rpc('assign_armband', { p_show_id, p_dog_id })`.
2. Write the returned number to `entries.armband` (denormalized for easy display).
3. Display the armband number on the confirmation screen.
4. If the RPC call fails (e.g., network error), registration still succeeds but armband is left unassigned. The secretary can assign it later via existing manual tools. This preserves offline-first behavior.

**Show creation wizard / Show edit form:**

- Add "Starting Armband Number" integer input field (default 100).
- Stored in `shows.starting_armband_number`.
- Note: changing the starting number after armbands have been assigned does not affect existing assignments. The next assignment will still be `MAX(existing) + 1`.

**Confirmation email:**

- Include armband number per dog in the email template.
- Format: "Your armband number is **105**" (one number per dog, listed with their entries).
- If armband was not assigned (offline/error), omit the armband line from the email.

### What We're NOT Doing

- **Per-trial armband series** — future enhancement for multi-sport shows (e.g., separate series for Scent Work and Conformation trials).
- **Prefix support** — future enhancement (e.g., "A-101").
- **Recycling on cancellation** — gaps are acceptable.
- **Changes to existing manual armband tools** — `ArmbandDialog`, `AutoArmbandDialog`, `armbandStore`, and `ArmbandManager` are untouched. They serve day-of-show manual reassignment. The existing `secretaryEntryQueries.ts` functions (`autoAssignArmbands`, `assignArmband`) write only to `entries.armband` — they should be updated in a follow-up to also write to the `armbands` table for consistency, but that is out of scope for this change.
- **ArmbandAssignment type consolidation** — four different `ArmbandAssignment` interfaces exist across the codebase. Unifying them is desirable but out of scope. This feature uses the armband number as a plain integer/string.

### Files Affected

| File                                                                           | Change                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------- |
| `supabase/migrations/0XX_armband_auto_assignment.sql`                          | New migration: column, constraint, function       |
| `apps/myk9show/src/pages/secretary/ShowCreationWizard/`                        | Add starting armband number field                 |
| `apps/myk9show/src/components/shows/ShowDetails/dialogs/EditShowDialog.tsx`    | Add starting armband number field                 |
| `apps/myk9show/src/components/shows/RegistrationWorkflow/ConfirmationStep.tsx` | Call `assign_armband` RPC, display number         |
| `apps/myk9show/src/services/mappers/showMappers.ts`                            | Map `starting_armband_number`                     |
| `apps/myk9show/src/types/show-types.ts`                                        | Add `startingArmbandNumber` to `Show` type        |
| `apps/myk9show/src/types/database-mappings.ts`                                 | Will update automatically after type regeneration |
| Supabase generated types (`supabase gen types`)                                | Regenerate after migration                        |
| Email template (confirmation)                                                  | Include armband number per dog                    |

### Testing

- Unit test: `assign_armband` returns same number for same dog+show on repeated calls
- Unit test: `assign_armband` returns sequential numbers for different dogs
- Unit test: concurrent calls don't produce duplicates (can simulate with parallel RPC calls)
- Unit test: first assignment uses `starting_armband_number` from the show
- Unit test: non-numeric existing armband values are safely ignored
- Unit test: NULL `starting_armband_number` falls back to 100
- Unit test: nonexistent `show_id` raises an exception
- Unit test: RPC failure during registration does not block entry creation
- Integration test: registration wizard displays armband on confirmation step
