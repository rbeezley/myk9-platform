# People Deduplication on Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate `people` rows when a mail-in exhibitor later creates an auth account with the same email address.

**Architecture:** A single Supabase migration (131) adds a partial unique index on `people.email` and replaces the `handle_new_user` trigger function with a version that links an existing person record instead of inserting a new one when the email matches.

**Tech Stack:** PostgreSQL, Supabase migrations, vitest (for unit tests of the SQL logic boundary)

**Spec:** `docs/superpowers/specs/2026-04-13-people-deduplication-design.md`

---

## File Map

| Action            | File                                                       |
| ----------------- | ---------------------------------------------------------- |
| Create            | `supabase/migrations/131_deduplicate_people_on_signup.sql` |
| Test (manual SQL) | Verification queries in Task 2                             |

No frontend files change.

---

## Task 1: Write migration 131

**Files:**

- Create: `supabase/migrations/131_deduplicate_people_on_signup.sql`

- [ ] **Step 1: Create the migration file**

```bash
ls supabase/migrations/ | tail -1   # confirm 130 is last
touch supabase/migrations/131_deduplicate_people_on_signup.sql
```

- [ ] **Step 2: Write the SQL**

Write the following to `supabase/migrations/131_deduplicate_people_on_signup.sql`:

```sql
-- Migration 131: Deduplicate people rows on auth signup
--
-- Problem: when a secretary creates a mail-in entry, a people row is inserted
-- with auth_user_id = NULL. If that person later signs up with the same email
-- address, the on_auth_user_created trigger previously always inserted a new
-- people row, splitting the person's history across two identities.
--
-- Fix:
--   1. Add a partial case-insensitive unique index on people.email so the DB
--      enforces uniqueness going forward.
--   2. Replace handle_new_user() to check for an existing people row by email
--      before inserting. On match: link the row and update name/phone from the
--      signup form. On no match: existing insert behavior.

-- ==========================================================================
-- 1. Unique index on people.email
-- ==========================================================================

-- Partial: allows NULL email (mail-in entries without email can still coexist)
-- Partial: excludes soft-deleted rows (a deleted person's email can be reused)
-- LOWER(): case-insensitive so John@gmail.com and john@gmail.com match
CREATE UNIQUE INDEX people_email_unique
  ON public.people(LOWER(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- ==========================================================================
-- 2. Updated handle_new_user trigger function
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_person_id UUID;
  new_person_id      UUID;
  exhibitor_role_id  UUID;
BEGIN
  -- Resolve the exhibitor role id once
  SELECT id INTO exhibitor_role_id
    FROM public.roles
    WHERE name = 'exhibitor';

  -- Check for an existing non-deleted people row with the same email.
  -- Only match rows that have not yet been linked to an auth account so we
  -- don't accidentally stomp a row that belongs to a different auth user.
  SELECT id INTO existing_person_id
    FROM public.people
    WHERE LOWER(email) = LOWER(NEW.email)
      AND auth_user_id IS NULL
      AND deleted_at IS NULL
    LIMIT 1;

  IF existing_person_id IS NOT NULL THEN
    -- -----------------------------------------------------------------------
    -- Link path: existing secretary-created person is signing up
    -- -----------------------------------------------------------------------
    -- Signup form data is more authoritative than secretary data entry.
    -- COALESCE keeps existing value if signup metadata field is absent.
    UPDATE public.people SET
      auth_user_id = NEW.id,
      first_name   = COALESCE(NEW.raw_user_meta_data->>'first_name', first_name),
      last_name    = COALESCE(NEW.raw_user_meta_data->>'last_name', last_name),
      phone        = COALESCE(NEW.raw_user_meta_data->>'phone', phone),
      updated_at   = now()
    WHERE id = existing_person_id;

    new_person_id := existing_person_id;
  ELSE
    -- -----------------------------------------------------------------------
    -- New person path: no existing match, create a fresh people row
    -- -----------------------------------------------------------------------
    INSERT INTO public.people (
      first_name,
      last_name,
      email,
      phone,
      auth_user_id
    ) VALUES (
      COALESCE(NEW.raw_user_meta_data->>'first_name', 'Unknown'),
      COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
      NEW.email,
      NEW.raw_user_meta_data->>'phone',
      NEW.id
    )
    RETURNING id INTO new_person_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- Shared: create exhibitor_profiles and assign exhibitor role
  -- (both paths need these; use idempotent inserts)
  -- -------------------------------------------------------------------------

  -- exhibitor_profiles has a unique index on auth_user_id
  INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
  VALUES (new_person_id, NEW.id)
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- user_roles unique constraint is (user_id, role_id, club_id, show_id).
  -- club_id and show_id are NULL here; PostgreSQL does not consider NULL = NULL
  -- in unique constraints, so ON CONFLICT won't fire reliably. Use EXISTS guard.
  IF exhibitor_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT new_person_id, exhibitor_role_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id  = new_person_id
        AND role_id  = exhibitor_role_id
        AND club_id  IS NULL
        AND show_id  IS NULL
    );
  END IF;

  RETURN NEW;
END;
$$;
```

- [ ] **Step 3: Typecheck (no TS changes, but confirm nothing is broken)**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
pnpm typecheck
```

Expected: all tasks successful.

- [ ] **Step 4: Commit the migration**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
git add supabase/migrations/131_deduplicate_people_on_signup.sql
git commit -m "feat(db): deduplicate people rows on auth signup (migration 131)"
```

---

## Task 2: Push and verify

**Files:** none (verification only)

- [ ] **Step 1: Push the migration**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
source supabase/.env && supabase db push --password "$SUPABASE_DB_PASSWORD"
```

Expected output:

```
Applying migration 131_deduplicate_people_on_signup.sql...
Finished supabase db push.
```

- [ ] **Step 2: Verify the unique index exists**

Run in the Supabase SQL editor (Dashboard → SQL Editor):

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'people'
  AND indexname = 'people_email_unique';
```

Expected: one row with `indexdef` containing `LOWER(email)` and a WHERE clause.

- [ ] **Step 3: Verify the link path (new person signs up after secretary entry)**

```sql
-- Setup: insert a headless person as a secretary would
INSERT INTO public.people (first_name, last_name, email, phone)
VALUES ('Jane', 'Smyth', 'jane@example.com', '555-0100')
RETURNING id;
-- note the returned id (call it PERSON_ID)

-- Simulate the trigger firing when Jane signs up.
-- (In production this fires automatically via on_auth_user_created.)
-- Call the function directly with a fake NEW row:
SELECT public.handle_new_user_test('jane@example.com', 'Jane', 'Smith', '555-0199');
```

Since calling trigger functions directly is awkward, instead verify the logic by checking what the trigger WOULD do:

```sql
-- Confirm the function body handles the link path:
-- 1. Does an existing row match?
SELECT id, auth_user_id
FROM public.people
WHERE LOWER(email) = LOWER('jane@example.com')
  AND auth_user_id IS NULL
  AND deleted_at IS NULL;
-- Expected: the row you just inserted, auth_user_id = NULL

-- 2. Clean up test row
DELETE FROM public.people WHERE email = 'jane@example.com';
```

- [ ] **Step 4: Verify the unique index blocks a duplicate email insert**

```sql
INSERT INTO public.people (first_name, last_name, email)
VALUES ('Alice', 'A', 'alice@example.com');

-- This second insert should fail with a unique constraint violation:
INSERT INTO public.people (first_name, last_name, email)
VALUES ('Alice', 'Duplicate', 'ALICE@EXAMPLE.COM');
-- Expected: ERROR: duplicate key value violates unique constraint "people_email_unique"

-- Clean up:
DELETE FROM public.people WHERE email = 'alice@example.com';
```

- [ ] **Step 5: Verify soft-deleted row is not matched**

```sql
-- Insert and soft-delete a person
INSERT INTO public.people (first_name, last_name, email)
VALUES ('Bob', 'B', 'bob@example.com');

UPDATE public.people SET deleted_at = now() WHERE email = 'bob@example.com';

-- This insert should succeed (deleted row excluded from index):
INSERT INTO public.people (first_name, last_name, email)
VALUES ('Bob', 'New', 'bob@example.com');
-- Expected: succeeds (no conflict)

-- Clean up:
DELETE FROM public.people WHERE email = 'bob@example.com';
```

- [ ] **Step 6: Final commit (if any fixes were needed during verification)**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
git add -A
git commit -m "fix(db): address verification findings from migration 131"
# Only run this step if Step 2-5 required changes; skip if all passed cleanly.
```

- [ ] **Step 7: Push to remote**

```bash
git push
```
