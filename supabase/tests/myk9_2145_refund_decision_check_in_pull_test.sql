-- MYK9-2145: Deny refund on a paid entry pulled at ringside or by the exhibitor's
-- own check-in (check_in_status 'pulled', entry_status still 'confirmed').
--
-- Executes the INSTALLED public.set_entry_refund_decision and the reinstate
-- trigger (never a source-string contract) from
-- 20261118174500_myk9_2145_refund_decision_check_in_pull.sql:
--   * a paid-online check-in pull can be marked denied by the show's secretary;
--   * a cash-paid check-in pull and a paid entry merely checked in are refused;
--   * clearing the check-in pull clears the denial;
--   * the desk scratching the same pull keeps the denial.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/myk9_2145_refund_decision_check_in_pull_test.sql
--
-- The transaction rolls back every fixture. A clean run prints PASS notices.
-- Fixture pattern copied from myk9_2099_refund_decision_removed_absent_test.sql.

BEGIN;

-- Seed an unlinked person first; handle_new_user() adopts it by email when the
-- auth row lands, so refund_decided_by (FK to auth.users) has a real target.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000002145011', 'Refund', 'Secretary',
    'myk9-2145-secretary@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000002145001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-2145-secretary@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000002145021', 'MYK9-2145 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES
  ('00000000-0000-0000-0000-000002145031', 'MYK9-2145 Show', 'AKC',
    CURRENT_DATE, CURRENT_DATE, '00000000-0000-0000-0000-000002145021');

-- Paid-online rows are written as the payment service writes them.
GRANT INSERT ON public.entries TO service_role;
SET LOCAL ROLE service_role;

-- As in pull_refund_decision_rls_test.sql: trg_entries_require_dog_registration
-- (20260828210000) must not refuse a fixture over something this file is not about.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC (American Kennel Club)', 'SR' || upper(substr(md5(d.id::text), 1, 8)), true
FROM public.dogs d
WHERE NOT EXISTS (
  SELECT 1 FROM public.dog_registrations r WHERE r.dog_id = d.id
);

INSERT INTO public.entries (
  id, show_id, entry_status, check_in_status,
  payment_method, payment_status, entry_fee, refund_amount
)
VALUES
  -- 41: a paid-online entry pulled at ringside (check-in flag only)
  ('00000000-0000-0000-0000-000002145041', '00000000-0000-0000-0000-000002145031',
    'confirmed', 'pulled', 'online', 'paid', 25, NULL),
  -- 42: a paid-online entry the exhibitor pulled at their own check-in
  ('00000000-0000-0000-0000-000002145042', '00000000-0000-0000-0000-000002145031',
    'confirmed', 'pulled', 'online', 'paid', 25, NULL),
  -- 43: a check-in pull paid by cash: no card payment to decide
  ('00000000-0000-0000-0000-000002145043', '00000000-0000-0000-0000-000002145031',
    'confirmed', 'pulled', 'cash', 'paid', 25, NULL),
  -- 44: a paid-online entry checked in, still running
  ('00000000-0000-0000-0000-000002145044', '00000000-0000-0000-0000-000002145031',
    'confirmed', 'checked-in', 'online', 'paid', 25, NULL);

RESET ROLE;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002145011', id,
  '00000000-0000-0000-0000-000002145021', true,
  '00000000-0000-0000-0000-000002145001'
FROM public.roles WHERE name = 'secretary';

-- The show's secretary denies both check-in pulls.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002145001', true);
SELECT public.set_entry_refund_decision('00000000-0000-0000-0000-000002145041', 'denied');
SELECT public.set_entry_refund_decision('00000000-0000-0000-0000-000002145042', 'denied');
RESET ROLE;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, refund_decision, refund_decided_at, refund_decided_by
      FROM public.entries
     WHERE id IN ('00000000-0000-0000-0000-000002145041',
                  '00000000-0000-0000-0000-000002145042')
  LOOP
    IF r.refund_decision IS DISTINCT FROM 'denied'
       OR r.refund_decided_at IS NULL
       OR r.refund_decided_by IS DISTINCT FROM '00000000-0000-0000-0000-000002145001' THEN
      RAISE EXCEPTION 'FAIL % was not denied with its actor (decision=% at=% by=%)',
        r.id, r.refund_decision, r.refund_decided_at, r.refund_decided_by;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS a paid-online check-in pull can be marked denied';
END;
$$;

-- Every refusal raises 22023 and writes nothing.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002145001', true);

DO $$
DECLARE
  v_id uuid;
  v_label text;
BEGIN
  FOR v_id, v_label IN
    VALUES
      ('00000000-0000-0000-0000-000002145043'::uuid, 'a check-in pull paid by cash'),
      ('00000000-0000-0000-0000-000002145044'::uuid, 'a paid entry checked in')
  LOOP
    BEGIN
      PERFORM public.set_entry_refund_decision(v_id, 'denied');
      RAISE EXCEPTION 'FAIL % was accepted for a refund decision', v_label;
    EXCEPTION WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE 'entry % is not an unresolved paid-online pull, withdrawal, removal or no-show' THEN
        RAISE EXCEPTION 'FAIL % refused with the wrong message: %', v_label, SQLERRM;
      END IF;
    END;
  END LOOP;
  RAISE NOTICE 'PASS a cash check-in pull and a checked-in entry are still refused';
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.entries
     WHERE id IN ('00000000-0000-0000-0000-000002145043',
                  '00000000-0000-0000-0000-000002145044')
       AND refund_decision IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL a refused row carries a decision anyway';
  END IF;
  RAISE NOTICE 'PASS refused rows carry no decision';
END;
$$;

-- Clearing the ringside pull (the entry runs again) clears its denial, so a
-- later pull needs a fresh decision. The desk scratching the exhibitor's pull
-- is the same pull, so its denial stays.
UPDATE public.entries
   SET check_in_status = 'checked-in'
 WHERE id = '00000000-0000-0000-0000-000002145041';

UPDATE public.entries
   SET entry_status = 'scratched'
 WHERE id = '00000000-0000-0000-0000-000002145042';

DO $$
DECLARE
  r record;
BEGIN
  SELECT refund_decision, refund_decided_at, refund_decided_by INTO r
    FROM public.entries
   WHERE id = '00000000-0000-0000-0000-000002145041';
  IF r.refund_decision IS NOT NULL
     OR r.refund_decided_at IS NOT NULL
     OR r.refund_decided_by IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a cleared check-in pull kept its decision (decision=% at=% by=%)',
      r.refund_decision, r.refund_decided_at, r.refund_decided_by;
  END IF;
  RAISE NOTICE 'PASS clearing a denied check-in pull clears the decision';

  SELECT refund_decision INTO r
    FROM public.entries
   WHERE id = '00000000-0000-0000-0000-000002145042';
  IF r.refund_decision IS DISTINCT FROM 'denied' THEN
    RAISE EXCEPTION 'FAIL the desk scratching a denied check-in pull dropped its decision (decision=%)',
      r.refund_decision;
  END IF;
  RAISE NOTICE 'PASS the desk scratching a denied check-in pull keeps the decision';
END;
$$;

ROLLBACK;
