-- Restore people + exhibitor_profiles rows for the five E2E exhibitor test accounts
-- (exhibitor1-5@myk9t.com). The June 2026 DB hard-wipe deleted their people rows
-- (they were not in the protected-accounts list), which also cascade-deleted their
-- exhibitor_profiles rows. This migration restores them.
--
-- Safe to re-run: both INSERTs use ON CONFLICT DO NOTHING.
-- Auth prerequisite: auth.users rows for exhibitor1-5@myk9t.com must exist.
-- If an auth row is missing, the INSERT is silently skipped (LEFT JOIN + WHERE u.id IS NOT NULL).

DO $$
DECLARE
  v_accounts jsonb := '[
    {"email":"exhibitor1@myk9t.com","first":"Alice","last":"Martin"},
    {"email":"exhibitor2@myk9t.com","first":"Bob","last":"Chen"},
    {"email":"exhibitor3@myk9t.com","first":"Carol","last":"Davis"},
    {"email":"exhibitor4@myk9t.com","first":"Dan","last":"Okafor"},
    {"email":"exhibitor5@myk9t.com","first":"Eva","last":"Torres"}
  ]';
  v_item   jsonb;
  v_email  text;
  v_first  text;
  v_last   text;
  v_auth_id uuid;
  v_person_id uuid;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_accounts) LOOP
    v_email  := v_item->>'email';
    v_first  := v_item->>'first';
    v_last   := v_item->>'last';

    -- Look up the auth.users row (may not exist if Admin API recreation was skipped)
    SELECT id INTO v_auth_id FROM auth.users WHERE email = v_email;
    IF v_auth_id IS NULL THEN
      RAISE NOTICE 'restore_exhibitor_test_accounts: no auth.users row for %, skipping', v_email;
      CONTINUE;
    END IF;

    -- Restore the people row (idempotent on auth_user_id or email unique index)
    INSERT INTO public.people (first_name, last_name, email, auth_user_id)
    VALUES (v_first, v_last, v_email, v_auth_id)
    ON CONFLICT DO NOTHING;

    -- Fetch the (possibly just-inserted) person_id
    SELECT id INTO v_person_id FROM public.people WHERE lower(email) = lower(v_email);
    IF v_person_id IS NULL THEN
      RAISE NOTICE 'restore_exhibitor_test_accounts: people row still missing for %, skipping exhibitor_profiles', v_email;
      CONTINUE;
    END IF;

    -- Restore the exhibitor_profiles row
    INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
    VALUES (v_person_id, v_auth_id)
    ON CONFLICT (auth_user_id) DO NOTHING;
  END LOOP;
END $$;
