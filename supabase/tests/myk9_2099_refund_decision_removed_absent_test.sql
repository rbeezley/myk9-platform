-- MYK9-2099: Deny refund on a paid secretary removal and a paid no-show.
--
-- Executes the INSTALLED public.set_entry_refund_decision (never a source-string
-- contract) from 20261117152900_myk9_2099_refund_decision_removed_absent.sql:
--   * a paid-online 'withdrawn' row with no reason code (a secretary removal)
--     and a paid-online 'absent' row (a no-show) can be marked denied;
--   * the paid-online, unresolved and authorization guards still refuse;
--   * a no-show that is marked present again loses its denial.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/myk9_2099_refund_decision_removed_absent_test.sql
--
-- The transaction rolls back every fixture. A clean run prints PASS notices.
-- Fixture pattern copied from pull_refund_decision_rls_test.sql (green in CI).

BEGIN;

-- Seed unlinked people first; handle_new_user() adopts each by email when the
-- auth row lands, so refund_decided_by (FK to auth.users) has a real target.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000002099011', 'Refund', 'Secretary',
    'myk9-2099-secretary@example.test', NULL),
  ('00000000-0000-0000-0000-000002099012', 'Other', 'Club Admin',
    'myk9-2099-club-admin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000002099001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-2099-secretary@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002099002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-2099-club-admin@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000002099021', 'MYK9-2099 Club'),
  ('00000000-0000-0000-0000-000002099022', 'MYK9-2099 Unrelated Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES
  ('00000000-0000-0000-0000-000002099031', 'MYK9-2099 Show', 'AKC',
    CURRENT_DATE, CURRENT_DATE, '00000000-0000-0000-0000-000002099021');

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
  id, show_id, entry_status, withdrawal_reason_code,
  payment_method, payment_status, entry_fee, refund_amount
)
VALUES
  -- 41: a paid-online secretary removal (withdrawn, no reason code)
  ('00000000-0000-0000-0000-000002099041', '00000000-0000-0000-0000-000002099031',
    'withdrawn', NULL, 'online', 'paid', 25, NULL),
  -- 42: a paid-online no-show
  ('00000000-0000-0000-0000-000002099042', '00000000-0000-0000-0000-000002099031',
    'absent', NULL, 'online', 'paid', 25, NULL),
  -- 43: a no-show paid by cash: no card payment to decide
  ('00000000-0000-0000-0000-000002099043', '00000000-0000-0000-0000-000002099031',
    'absent', NULL, 'cash', 'paid', 25, NULL),
  -- 44: a no-show not paid yet
  ('00000000-0000-0000-0000-000002099044', '00000000-0000-0000-0000-000002099031',
    'absent', NULL, 'online', 'pending', 25, NULL),
  -- 45: a no-show already refunded
  ('00000000-0000-0000-0000-000002099045', '00000000-0000-0000-0000-000002099031',
    'absent', NULL, 'online', 'paid', 25, 25),
  -- 46: a paid-online entry still running
  ('00000000-0000-0000-0000-000002099046', '00000000-0000-0000-0000-000002099031',
    'confirmed', NULL, 'online', 'paid', 25, NULL),
  -- 47: a paid-online no-show the unrelated club admin tries to deny
  ('00000000-0000-0000-0000-000002099047', '00000000-0000-0000-0000-000002099031',
    'absent', NULL, 'online', 'paid', 25, NULL);

RESET ROLE;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002099011', id,
  '00000000-0000-0000-0000-000002099021', true,
  '00000000-0000-0000-0000-000002099001'
FROM public.roles WHERE name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002099012', id,
  '00000000-0000-0000-0000-000002099022', true,
  '00000000-0000-0000-0000-000002099002'
FROM public.roles WHERE name = 'club_admin';

-- The show's secretary denies the removal and the no-show.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002099001', true);
SELECT public.set_entry_refund_decision('00000000-0000-0000-0000-000002099041', 'denied', 'Removed by the secretary.');
SELECT public.set_entry_refund_decision('00000000-0000-0000-0000-000002099042', 'denied', 'No-show.');
RESET ROLE;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, refund_decision, refund_decided_at, refund_decided_by
      FROM public.entries
     WHERE id IN ('00000000-0000-0000-0000-000002099041',
                  '00000000-0000-0000-0000-000002099042')
  LOOP
    IF r.refund_decision IS DISTINCT FROM 'denied'
       OR r.refund_decided_at IS NULL
       OR r.refund_decided_by IS DISTINCT FROM '00000000-0000-0000-0000-000002099001' THEN
      RAISE EXCEPTION 'FAIL % was not denied with its actor (decision=% at=% by=%)',
        r.id, r.refund_decision, r.refund_decided_at, r.refund_decided_by;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS a paid-online secretary removal and a paid-online no-show can be marked denied';
END;
$$;

-- Every refusal raises 22023 and writes nothing.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002099001', true);

DO $$
DECLARE
  v_id uuid;
  v_label text;
BEGIN
  FOR v_id, v_label IN
    VALUES
      ('00000000-0000-0000-0000-000002099043'::uuid, 'a no-show paid by cash'),
      ('00000000-0000-0000-0000-000002099044'::uuid, 'an unpaid no-show'),
      ('00000000-0000-0000-0000-000002099045'::uuid, 'a refunded no-show'),
      ('00000000-0000-0000-0000-000002099046'::uuid, 'an entry still running')
  LOOP
    BEGIN
      PERFORM public.set_entry_refund_decision(v_id, 'denied', 'No refund.');
      RAISE EXCEPTION 'FAIL % was accepted for a refund decision', v_label;
    EXCEPTION WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE 'entry % is not an unresolved paid-online pull, withdrawal, removal or no-show' THEN
        RAISE EXCEPTION 'FAIL % refused with the wrong message: %', v_label, SQLERRM;
      END IF;
    END;
  END LOOP;
  RAISE NOTICE 'PASS cash, unpaid, refunded and running entries are still refused';
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.entries
     WHERE id IN ('00000000-0000-0000-0000-000002099043',
                  '00000000-0000-0000-0000-000002099044',
                  '00000000-0000-0000-0000-000002099045',
                  '00000000-0000-0000-0000-000002099046')
       AND refund_decision IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL a refused row carries a decision anyway';
  END IF;
  RAISE NOTICE 'PASS refused rows carry no decision';
END;
$$;

-- Authorization is unchanged: a club admin of another club is refused.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002099002', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.set_entry_refund_decision('00000000-0000-0000-0000-000002099047', 'denied', 'No-show.');
    RAISE EXCEPTION 'FAIL unrelated club admin denied a no-show refund';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS unrelated club admin is refused on a no-show';
  END;
END;
$$;

RESET ROLE;

-- A denied no-show marked present again loses the denial, so a later no-show
-- needs a fresh decision.
UPDATE public.entries
   SET entry_status = 'confirmed'
 WHERE id = '00000000-0000-0000-0000-000002099042';

DO $$
DECLARE
  r record;
BEGIN
  SELECT refund_decision, refund_decided_at, refund_decided_by INTO r
    FROM public.entries
   WHERE id = '00000000-0000-0000-0000-000002099042';
  IF r.refund_decision IS NOT NULL
     OR r.refund_decided_at IS NOT NULL
     OR r.refund_decided_by IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a no-show marked present kept its decision (decision=% at=% by=%)',
      r.refund_decision, r.refund_decided_at, r.refund_decided_by;
  END IF;
  RAISE NOTICE 'PASS marking a denied no-show present clears the decision';
END;
$$;

ROLLBACK;
