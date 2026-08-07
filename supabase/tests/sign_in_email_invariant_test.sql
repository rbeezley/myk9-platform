-- Behavioral test for 20260805120000_enforce_sign_in_email_invariant.sql
-- (MYK9-136).
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/sign_in_email_invariant_test.sql
-- All fixtures roll back.
--
-- Fixture order matters: `people` rows are seeded BEFORE their `auth.users`
-- rows, so the signup trigger ADOPTS them. Inserting a linked person directly
-- would collide with `people_email_unique` against the row handle_new_user()
-- creates for the same address. Same reason the pull/refund fixture does it
-- this way, which the harness contract test pins.
--
-- The invariant is: for a person with an auth identity,
-- people.email = auth.users.email. A denial-only test would pass against a
-- trigger that simply froze the column, so this asserts both directions —
-- what must be refused AND what must keep working:
--
--   * a linked person's address cannot be moved away from their identity;
--   * an UNLINKED person's address is still freely editable;
--   * re-saving the same address on a linked person still works, including a
--     recased or padded variant, because nearly every save in the app assigns
--     `email` whether or not the user touched it;
--   * repair TOWARD the identity address is allowed;
--   * relinking cannot be used to smuggle in a mismatch;
--   * an auth-side email change carries onto the person row;
--   * adoption at signup will not link an identity to a person whose address
--     changed after it was matched.

BEGIN;

-- Seeded unlinked; the auth insert below adopts this row.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-0000000e1101', 'Linked', 'Person', 'signin-linked@example.test', NULL),
  ('00000000-0000-0000-0000-0000000e1102', 'Unlinked', 'Person', 'signin-unlinked@example.test', NULL);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous)
VALUES
  ('00000000-0000-0000-0000-0000000e1001','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','signin-linked@example.test','', now(), now(), now(), '{}','{}', false, false, false);

DO $$
DECLARE
  linked_person   CONSTANT uuid := '00000000-0000-0000-0000-0000000e1101';
  unlinked_person CONSTANT uuid := '00000000-0000-0000-0000-0000000e1102';
  linked_auth     CONSTANT uuid := '00000000-0000-0000-0000-0000000e1001';
  v_text          text;
  v_auth          uuid;
  v_drift         bigint;
  err             text;
BEGIN
  ----------------------------------------------------------------------------
  -- Precondition: the signup trigger adopted the seeded person rather than
  -- creating a second one. If this fails, nothing below means what it says.
  ----------------------------------------------------------------------------
  SELECT auth_user_id INTO v_auth FROM public.people WHERE id = linked_person;
  IF v_auth IS DISTINCT FROM linked_auth THEN
    RAISE EXCEPTION 'FAIL fixture: seeded person was not adopted at signup (auth_user_id=%)', v_auth;
  END IF;

  ----------------------------------------------------------------------------
  -- Refused: moving a linked person's address away from their identity.
  ----------------------------------------------------------------------------
  BEGIN
    UPDATE public.people SET email = 'corrected@example.test' WHERE id = linked_person;
    RAISE EXCEPTION 'FAIL a linked person''s email was changed away from their sign-in identity';
  EXCEPTION WHEN SQLSTATE 'MK002' THEN
    NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
      RAISE EXCEPTION 'FAIL sign-in email guard raised unexpected error: %', err;
  END;

  SELECT email INTO v_text FROM public.people WHERE id = linked_person;
  IF v_text <> 'signin-linked@example.test' THEN
    RAISE EXCEPTION 'FAIL linked person''s email is now %, expected it untouched', v_text;
  END IF;

  ----------------------------------------------------------------------------
  -- Refused: clearing it is a divergence too.
  ----------------------------------------------------------------------------
  BEGIN
    UPDATE public.people SET email = NULL WHERE id = linked_person;
    RAISE EXCEPTION 'FAIL a linked person''s email was cleared';
  EXCEPTION WHEN SQLSTATE 'MK002' THEN
    NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
      RAISE EXCEPTION 'FAIL clearing raised unexpected error: %', err;
  END;

  ----------------------------------------------------------------------------
  -- Allowed: re-saving the same address, including recased and padded. Every
  -- ordinary profile save assigns `email` whether or not it changed, so a
  -- trigger that refused these would break every save by a signed-up user.
  -- The padded write must also be STORED trimmed: people_email_unique and the
  -- adoption lookup both index LOWER(email) with no trim, so a padded value is
  -- a different address to everything downstream.
  ----------------------------------------------------------------------------
  UPDATE public.people SET email = 'signin-linked@example.test', city = 'Same'
   WHERE id = linked_person;

  UPDATE public.people SET email = 'SignIn-Linked@Example.TEST', city = 'Recased'
   WHERE id = linked_person;

  UPDATE public.people SET email = '  signin-linked@example.test  ', city = 'Padded'
   WHERE id = linked_person;

  SELECT city INTO v_text FROM public.people WHERE id = linked_person;
  IF v_text <> 'Padded' THEN
    RAISE EXCEPTION 'FAIL unchanged-address saves did not go through (city=%)', v_text;
  END IF;

  SELECT email INTO v_text FROM public.people WHERE id = linked_person;
  IF v_text <> 'signin-linked@example.test' THEN
    RAISE EXCEPTION 'FAIL padded address was stored unnormalized as [%]', v_text;
  END IF;

  ----------------------------------------------------------------------------
  -- Refused: relinking cannot smuggle in a mismatch. Unlink, move the address,
  -- then relink — the linkage is half the invariant, so the relink is checked.
  ----------------------------------------------------------------------------
  UPDATE public.people SET auth_user_id = NULL WHERE id = linked_person;
  UPDATE public.people SET email = 'smuggled@example.test' WHERE id = linked_person;

  BEGIN
    UPDATE public.people SET auth_user_id = linked_auth WHERE id = linked_person;
    RAISE EXCEPTION 'FAIL relinking restored an identity onto a mismatched address';
  EXCEPTION WHEN SQLSTATE 'MK002' THEN
    NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
      RAISE EXCEPTION 'FAIL relink guard raised unexpected error: %', err;
  END;

  -- Put it back the only legal way: match the identity, then relink.
  UPDATE public.people SET email = 'signin-linked@example.test' WHERE id = linked_person;
  UPDATE public.people SET auth_user_id = linked_auth WHERE id = linked_person;

  ----------------------------------------------------------------------------
  -- The other side of the invariant: an auth-side change carries across.
  -- `supabase.auth.updateUser({ email })` writes auth.users directly, with no
  -- write to `people` for the enforcing trigger to see.
  ----------------------------------------------------------------------------
  UPDATE auth.users SET email = 'signin-moved@example.test' WHERE id = linked_auth;

  SELECT email INTO v_text FROM public.people WHERE id = linked_person;
  IF v_text <> 'signin-moved@example.test' THEN
    RAISE EXCEPTION 'FAIL person row did not follow the auth email change (got %)', v_text;
  END IF;

  ----------------------------------------------------------------------------
  -- Allowed: an unlinked person's address is ordinary directory data.
  ----------------------------------------------------------------------------
  UPDATE public.people SET email = 'moved@example.test' WHERE id = unlinked_person;

  SELECT email INTO v_text FROM public.people WHERE id = unlinked_person;
  IF v_text <> 'moved@example.test' THEN
    RAISE EXCEPTION 'FAIL an unlinked person''s email could not be edited (got %)', v_text;
  END IF;

  ----------------------------------------------------------------------------
  -- Adoption is atomic with respect to the address it matched on.
  --
  -- The unlinked person now carries 'moved@example.test'. A signup at their
  -- ORIGINAL address must not adopt them — that is precisely the write that
  -- would link an identity to a row bearing a different address. It must
  -- create a new person instead.
  ----------------------------------------------------------------------------
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous)
  VALUES ('00000000-0000-0000-0000-0000000e1002','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','signin-unlinked@example.test','', now(), now(), now(), '{}','{}', false, false, false);

  SELECT auth_user_id INTO v_auth FROM public.people WHERE id = unlinked_person;
  IF v_auth IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL signup adopted a person whose address had moved on (auth_user_id=%)', v_auth;
  END IF;

  SELECT email INTO v_text
    FROM public.people
   WHERE auth_user_id = '00000000-0000-0000-0000-0000000e1002';
  IF v_text <> 'signin-unlinked@example.test' THEN
    RAISE EXCEPTION 'FAIL signup did not create a person at its own address (got %)', v_text;
  END IF;

  ----------------------------------------------------------------------------
  -- Everything above satisfies the invariant, so the fact the health probe
  -- reports must be zero.
  ----------------------------------------------------------------------------
  SELECT (public.sign_in_email_drift()->>'drifted')::bigint INTO v_drift;
  IF v_drift <> 0 THEN
    RAISE EXCEPTION 'FAIL sign_in_email_drift reported % drifted people, expected 0', v_drift;
  END IF;

  RAISE NOTICE 'PASS linked email cannot diverge from the sign-in identity by edit or relink; unchanged, repairing and unlinked writes still work; auth-side changes carry across; adoption will not link a moved address';
END;
$$;

ROLLBACK;
