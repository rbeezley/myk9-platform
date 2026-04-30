-- Migration 178: Recreate broken auth.users rows for test exhibitor accounts
--
-- Migration 152 inserted exhibitor1-5 directly into auth.users with a raw
-- pgcrypto bcrypt hash. GoTrue cannot load these users ("Database error loading
-- user") — likely because direct SQL insertion skips GoTrue's internal user
-- setup. The fix is to delete the broken rows and recreate them via the Admin
-- API (see the companion shell script or manual step below).
--
-- This migration only handles the SQL cleanup. After running this migration,
-- recreate the 5 users via the Supabase Admin API so GoTrue initialises them
-- correctly.
--
-- After recreation, the handle_new_user trigger will:
--   1. Find the existing people row by email (auth_user_id IS NULL) and re-link it
--   2. Re-create exhibitor_profiles via ON CONFLICT DO NOTHING
--   3. Re-activate or insert the exhibitor user_role row
--
-- Safe to re-run: all deletes/updates are idempotent WHERE clauses.

DO $$
DECLARE
  v_uuids uuid[] := ARRAY[
    'a1000001-0000-0000-0000-000000000001'::uuid,
    'a1000002-0000-0000-0000-000000000002'::uuid,
    'a1000003-0000-0000-0000-000000000003'::uuid,
    'a1000004-0000-0000-0000-000000000004'::uuid,
    'a1000005-0000-0000-0000-000000000005'::uuid
  ];
BEGIN
  -- Step 1: unlink people rows so handle_new_user trigger can re-link on email match
  UPDATE public.people
    SET auth_user_id = NULL
    WHERE auth_user_id = ANY(v_uuids);

  -- Step 2: remove exhibitor_profiles (NOT NULL FK blocks auth.users delete)
  DELETE FROM public.exhibitor_profiles
    WHERE auth_user_id = ANY(v_uuids);

  -- Step 3: remove auth.identities (FK cascades from auth.users, but be explicit)
  DELETE FROM auth.identities
    WHERE user_id = ANY(v_uuids);

  -- Step 4: delete the broken auth.users rows
  DELETE FROM auth.users
    WHERE id = ANY(v_uuids);
END $$;
