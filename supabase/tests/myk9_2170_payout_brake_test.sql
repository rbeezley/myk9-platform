-- MYK9-2170: the payout brake, part A (fail closed).
-- platform_settings.payouts_require_approval defaults on; a switch stamps who
-- and when, and switching it off needs a recent sign-in. claim_show_payout_for_send
-- (the payout run's only way into 'processing') records awaiting_approval while
-- the brake is on, never claims a waiting or held row, claims an approved row
-- only within its approval, and claims as before with the brake off.
-- approve_show_payout / hold_show_payout are site-admin only; two approvals
-- change the row once and the payout is claimed once.
-- Money owed and the health probe count the new statuses as not yet sent.
-- Migration: 20261118211700_myk9_2170_payout_brake.sql.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000002170001', 'MYK9-2170 fixture club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000002170009', 'MYK9', 'Admin', 'myk9-2170-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000002170010', 'MYK9', 'NoAdmin', 'myk9-2170-noadmin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000002170109', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2170-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002170110', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2170-noadmin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002170109'
WHERE id = '00000000-0000-0000-0000-000002170009';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002170110'
WHERE id = '00000000-0000-0000-0000-000002170010';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002170009'::uuid, roles.id, NULL::uuid, true,
       '00000000-0000-0000-0000-000002170109'::uuid
FROM public.roles WHERE roles.name = 'site_admin';

-- Shows 2170020..2170029.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
SELECT ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'MYK9-2170 fixture ' || n, 'AKC', DATE '2026-09-01', DATE '2026-09-02',
       '00000000-0000-0000-0000-000002170001', 'draft'
FROM generate_series(2170020, 2170029) AS n;

INSERT INTO public.club_stripe_accounts (id, club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES ('00000000-0000-0000-0000-000002170002', '00000000-0000-0000-0000-000002170001',
        'acct_myk9_2170', true, true, false);

INSERT INTO public.show_payouts (id, show_id, club_stripe_account_id, amount_cents, status)
VALUES
  -- approved twice, then claimed once
  ('00000000-0000-0000-0000-000002171020', '00000000-0000-0000-0000-000002170020',
   '00000000-0000-0000-0000-000002170002', 10000, 'awaiting_approval'),
  -- held, then approved later
  ('00000000-0000-0000-0000-000002171021', '00000000-0000-0000-0000-000002170021',
   '00000000-0000-0000-0000-000002170002', 20000, 'awaiting_approval'),
  -- pending (club was not onboarded), brake on
  ('00000000-0000-0000-0000-000002171023', '00000000-0000-0000-0000-000002170023',
   '00000000-0000-0000-0000-000002170002', 30000, 'pending'),
  -- waiting: the amount the approver saw changes
  ('00000000-0000-0000-0000-000002171024', '00000000-0000-0000-0000-000002170024',
   '00000000-0000-0000-0000-000002170002', 40000, 'awaiting_approval'),
  -- approved, then the amount rises
  ('00000000-0000-0000-0000-000002171025', '00000000-0000-0000-0000-000002170025',
   '00000000-0000-0000-0000-000002170002', 5000, 'awaiting_approval'),
  -- approved, then the club's bank account changes
  ('00000000-0000-0000-0000-000002171026', '00000000-0000-0000-0000-000002170026',
   '00000000-0000-0000-0000-000002170002', 7000, 'awaiting_approval'),
  -- waiting with no destination account
  ('00000000-0000-0000-0000-000002171027', '00000000-0000-0000-0000-000002170027',
   NULL, 1000, 'awaiting_approval'),
  -- pending, brake off
  ('00000000-0000-0000-0000-000002171029', '00000000-0000-0000-0000-000002170029',
   '00000000-0000-0000-0000-000002170002', 9000, 'pending');

-- p_signed_in_seconds_ago: when the session last confirmed its password
-- (require_recent_reauth allows 300 seconds).
CREATE FUNCTION pg_temp.as_user(p_auth_user_id uuid, p_signed_in_seconds_ago integer DEFAULT 10)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object(
      'sub', p_auth_user_id, 'role', 'authenticated',
      'amr', jsonb_build_array(jsonb_build_object(
        'method', 'password',
        'timestamp', extract(epoch FROM now())::bigint - p_signed_in_seconds_ago))
    )::text, true);
END;
$function$;

CREATE FUNCTION pg_temp.expect_refusal(p_sql text, p_state text, p_case text)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  END;
  IF v_state IS DISTINCT FROM p_state THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 %: expected SQLSTATE %, got % (%)',
      p_case, p_state, coalesce(v_state, 'no error'), v_message;
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 % refused: %', p_case, v_message;
END;
$function$;

-- The payout run's claim, as the cron calls it.
CREATE FUNCTION pg_temp.claim(p_show_suffix integer, p_amount integer, p_destination text DEFAULT 'acct_myk9_2170')
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT public.claim_show_payout_for_send(
    ('00000000-0000-0000-0000-' || lpad(p_show_suffix::text, 12, '0'))::uuid,
    '00000000-0000-0000-0000-000002170002'::uuid,
    p_destination,
    p_amount
  );
$function$;

CREATE FUNCTION pg_temp.live(p_show_suffix integer)
RETURNS public.show_payouts
LANGUAGE sql
AS $function$
  SELECT sp.* FROM public.show_payouts sp
   WHERE sp.show_id = ('00000000-0000-0000-0000-' || lpad(p_show_suffix::text, 12, '0'))::uuid
     AND sp.status <> 'failed';
$function$;

DO $$
DECLARE
  v_result text;
  v_claim jsonb;
  v_row public.show_payouts;
  v_approved_at timestamptz;
  v_settings public.platform_settings;
  v_in_flight integer;
  v_pending_cents bigint;
BEGIN
  -- 1. The setting: on by default, not nullable, not anon's to read.
  IF NOT (SELECT ps.payouts_require_approval FROM public.platform_settings ps WHERE ps.id) THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: payouts_require_approval is not on by default';
  END IF;
  IF (SELECT a.attnotnull FROM pg_attribute a
       WHERE a.attrelid = 'public.platform_settings'::regclass
         AND a.attname = 'payouts_require_approval') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: payouts_require_approval is nullable';
  END IF;
  IF pg_catalog.has_column_privilege('anon', 'public.platform_settings', 'payouts_require_approval', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: anon can read payouts_require_approval';
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 the brake is on by default and hidden from anon';

  -- 2. Grants: approve/hold are not anon's; the claim is service_role only.
  IF pg_catalog.has_function_privilege('anon', 'public.approve_show_payout(uuid, integer)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.hold_show_payout(uuid, text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.approve_show_payout(uuid, integer)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.hold_show_payout(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: approve/hold grants are wrong';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated',
       'public.claim_show_payout_for_send(uuid, uuid, text, integer)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',
       'public.claim_show_payout_for_send(uuid, uuid, text, integer)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role',
       'public.claim_show_payout_for_send(uuid, uuid, text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: claim_show_payout_for_send is not service_role only';
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 grants';

  -- 3. Switching the brake: a non-admin cannot; a stale session cannot switch
  --    it off; a site admin's switch is stamped with who and when.
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170110');
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings SET payouts_require_approval = false WHERE id;
  RESET ROLE;
  IF NOT (SELECT ps.payouts_require_approval FROM public.platform_settings ps WHERE ps.id) THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: a non-admin switched the brake off';
  END IF;

  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109', 3600);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_refusal(
    'UPDATE public.platform_settings SET payouts_require_approval = false WHERE id',
    'MKAUT', 'brake off from a stale session'
  );
  RESET ROLE;
  IF NOT (SELECT ps.payouts_require_approval FROM public.platform_settings ps WHERE ps.id) THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: a stale session switched the brake off';
  END IF;

  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109');
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings SET payouts_require_approval = false WHERE id;
  RESET ROLE;
  SELECT * INTO v_settings FROM public.platform_settings ps WHERE ps.id;
  IF v_settings.payouts_require_approval
     OR v_settings.payouts_require_approval_changed_by IS DISTINCT FROM '00000000-0000-0000-0000-000002170009'
     OR v_settings.payouts_require_approval_changed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: switching the brake off was not stamped (% / % / %)',
      v_settings.payouts_require_approval, v_settings.payouts_require_approval_changed_by,
      v_settings.payouts_require_approval_changed_at;
  END IF;

  -- The stamp is the trigger's alone.
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings
     SET payouts_require_approval_changed_by = '00000000-0000-0000-0000-000002170010',
         payouts_require_approval_changed_at = now() - interval '1 year'
   WHERE id;
  RESET ROLE;
  SELECT * INTO v_settings FROM public.platform_settings ps WHERE ps.id;
  IF v_settings.payouts_require_approval_changed_by IS DISTINCT FROM '00000000-0000-0000-0000-000002170009'
     OR v_settings.payouts_require_approval_changed_at < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: a client wrote the brake stamp directly';
  END IF;
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings SET payouts_require_approval = true WHERE id;
  RESET ROLE;
  SELECT * INTO v_settings FROM public.platform_settings ps WHERE ps.id;
  IF NOT v_settings.payouts_require_approval
     OR v_settings.payouts_require_approval_changed_by IS DISTINCT FROM '00000000-0000-0000-0000-000002170009'
     OR v_settings.payouts_require_approval_changed_at < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: the brake stamp was forged or switching it on was not stamped';
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 brake switches are stamped with who and when';

  -- 4. Statuses: still one live row per show; unknown status refused.
  BEGIN
    INSERT INTO public.show_payouts (show_id, amount_cents, status)
    VALUES ('00000000-0000-0000-0000-000002170020', 1, 'awaiting_approval');
    RAISE EXCEPTION 'FAIL MYK9-2170: a second live payout row was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS MYK9-2170 one live payout per show still holds';
  END;
  PERFORM pg_temp.expect_refusal(
    $q$INSERT INTO public.show_payouts (show_id, amount_cents, status)
       VALUES ('00000000-0000-0000-0000-000002170028', 1, 'bogus')$q$,
    '23514', 'unknown status'
  );
  PERFORM pg_temp.expect_refusal(
    $q$UPDATE public.show_payouts SET approved_at = now()
        WHERE id = '00000000-0000-0000-0000-000002171024'$q$,
    '23514', 'a partial approval binding'
  );

  -- 5. Brake ON: the claim records awaiting_approval and never claims.
  v_claim := pg_temp.claim(2170022, 22000);
  v_row := pg_temp.live(2170022);
  IF v_claim ->> 'outcome' <> 'awaiting_approval' OR v_row.status <> 'awaiting_approval'
     OR v_row.amount_cents <> 22000 THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 brake on, new payout: % / %', v_claim, v_row.status;
  END IF;
  v_claim := pg_temp.claim(2170023, 31000);
  v_row := pg_temp.live(2170023);
  IF v_claim ->> 'outcome' <> 'awaiting_approval' OR v_row.status <> 'awaiting_approval'
     OR v_row.amount_cents <> 31000 THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 brake on, pending payout: % / %', v_claim, v_row.status;
  END IF;
  v_claim := pg_temp.claim(2170024, 41000);
  v_row := pg_temp.live(2170024);
  IF v_claim ->> 'outcome' <> 'awaiting_approval' OR v_row.status <> 'awaiting_approval'
     OR v_row.amount_cents <> 41000 THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 brake on, waiting payout: % / % / %',
      v_claim, v_row.status, v_row.amount_cents;
  END IF;
  v_claim := pg_temp.claim(2170022, 22000, 'acct_someone_else');
  IF v_claim ->> 'outcome' <> 'account_mismatch' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 claim to another destination: %', v_claim;
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 brake on: the claim records awaiting_approval and claims nothing';

  -- 6. Approval is a site admin's, with a recent sign-in, for the stored amount.
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170110');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002171020', 10000)$q$,
    '42501', 'non-admin approval'
  );
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.hold_show_payout('00000000-0000-0000-0000-000002171020', 'no')$q$,
    '42501', 'non-admin hold'
  );
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109', 3600);
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002171020', 10000)$q$,
    'MKAUT', 'approval from a stale session'
  );
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109');
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002171024', 40000)$q$,
    '22023', 'approval of an amount that has changed'
  );
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002171027', 1000)$q$,
    '22023', 'approval with no destination account'
  );
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002171029', 9000)$q$,
    '22023', 'approval of a payout that is not waiting'
  );
  RESET ROLE;
  IF (pg_temp.live(2170020)).status <> 'awaiting_approval'
     OR (pg_temp.live(2170024)).approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: a refused approval changed a payout';
  END IF;

  -- 7. Approve twice: the row changes once; the payout is claimed once.
  SET LOCAL ROLE authenticated;
  v_result := public.approve_show_payout('00000000-0000-0000-0000-000002171020', 10000);
  RESET ROLE;
  IF v_result <> 'approved' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve: returned %', v_result;
  END IF;
  v_row := pg_temp.live(2170020);
  IF v_row.status <> 'approved' OR v_row.approved_at IS NULL
     OR v_row.approved_by IS DISTINCT FROM '00000000-0000-0000-0000-000002170009'
     OR v_row.approved_amount_cents IS DISTINCT FROM 10000
     OR v_row.approved_stripe_account_id IS DISTINCT FROM 'acct_myk9_2170' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve: binding is % / % / % / %',
      v_row.status, v_row.approved_by, v_row.approved_amount_cents, v_row.approved_stripe_account_id;
  END IF;
  v_approved_at := v_row.approved_at;

  SET LOCAL ROLE authenticated;
  v_result := public.approve_show_payout('00000000-0000-0000-0000-000002171020', 10000);
  RESET ROLE;
  IF v_result <> 'already_approved' OR (pg_temp.live(2170020)).approved_at <> v_approved_at THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve twice: second call returned % or re-stamped', v_result;
  END IF;
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002171020', 9000)$q$,
    '22023', 'second approval with a different amount'
  );

  v_claim := pg_temp.claim(2170020, 10000);
  v_row := pg_temp.live(2170020);
  IF v_claim ->> 'outcome' <> 'claimed'
     OR (v_claim ->> 'payout_id')::uuid <> '00000000-0000-0000-0000-000002171020'
     OR (v_claim ->> 'approved_amount_cents')::integer <> 10000
     OR v_row.status <> 'processing' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approved claim: % / %', v_claim, v_row.status;
  END IF;
  v_claim := pg_temp.claim(2170020, 10000);
  SET LOCAL ROLE authenticated;
  v_result := public.approve_show_payout('00000000-0000-0000-0000-000002171020', 10000);
  RESET ROLE;
  IF v_claim ->> 'outcome' <> 'busy' OR v_result <> 'already_approved'
     OR (SELECT count(*) FROM public.show_payouts sp
          WHERE sp.show_id = '00000000-0000-0000-0000-000002170020') <> 1 THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve twice: a second claim was possible (%, %)', v_claim, v_result;
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 two approvals change the row once and it is claimed once';

  -- 8. Hold keeps it waiting with a reason; the claim leaves it; approve later.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.hold_show_payout('00000000-0000-0000-0000-000002171021', '   ')$q$,
    '22023', 'hold with a blank reason'
  );
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.hold_show_payout('00000000-0000-0000-0000-000002171020', 'too late')$q$,
    '22023', 'hold of a payout already being sent'
  );
  v_result := public.hold_show_payout('00000000-0000-0000-0000-000002171021', '  Check the club''s bank change  ');
  RESET ROLE;
  v_row := pg_temp.live(2170021);
  IF v_result <> 'held' OR v_row.status <> 'held'
     OR v_row.hold_reason IS DISTINCT FROM 'Check the club''s bank change' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 hold: % / % / %', v_result, v_row.status, v_row.hold_reason;
  END IF;
  v_claim := pg_temp.claim(2170021, 20000);
  IF v_claim ->> 'outcome' <> 'held' OR (pg_temp.live(2170021)).status <> 'held' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 a held payout was claimed: %', v_claim;
  END IF;
  SET LOCAL ROLE authenticated;
  v_result := public.approve_show_payout('00000000-0000-0000-0000-000002171021', 20000);
  RESET ROLE;
  v_row := pg_temp.live(2170021);
  IF v_result <> 'approved' OR v_row.status <> 'approved' OR v_row.hold_reason IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve after hold: % / % / %', v_result, v_row.status, v_row.hold_reason;
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 a held payout stays waiting with its reason and can be approved later';

  -- 9. An approval covers its amount and destination only.
  SET LOCAL ROLE authenticated;
  PERFORM public.approve_show_payout('00000000-0000-0000-0000-000002171025', 5000);
  PERFORM public.approve_show_payout('00000000-0000-0000-0000-000002171026', 7000);
  RESET ROLE;
  v_claim := pg_temp.claim(2170025, 6000);
  v_row := pg_temp.live(2170025);
  IF v_claim ->> 'outcome' <> 'approval_reset' OR v_row.status <> 'awaiting_approval'
     OR v_row.approved_at IS NOT NULL OR v_row.amount_cents <> 6000
     OR v_row.approval_reset_reason NOT LIKE '%rose from 5000 to 6000%' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 a larger amount kept its approval: % / % / %',
      v_claim, v_row.status, v_row.approval_reset_reason;
  END IF;

  UPDATE public.club_stripe_accounts SET stripe_account_id = 'acct_myk9_2170_new'
   WHERE id = '00000000-0000-0000-0000-000002170002';
  v_claim := pg_temp.claim(2170026, 7000, 'acct_myk9_2170_new');
  v_row := pg_temp.live(2170026);
  IF v_claim ->> 'outcome' <> 'approval_reset' OR v_row.status <> 'awaiting_approval'
     OR v_row.approved_stripe_account_id IS NOT NULL
     OR v_row.approval_reset_reason NOT LIKE '%bank account changed%' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 a new destination kept its approval: % / %', v_claim, v_row.status;
  END IF;
  UPDATE public.club_stripe_accounts SET stripe_account_id = 'acct_myk9_2170'
   WHERE id = '00000000-0000-0000-0000-000002170002';
  RAISE NOTICE 'PASS MYK9-2170 a larger amount or a new destination waits for a new approval';

  -- 10. Money owed and the health probe count the new statuses as not yet sent.
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109');
  SET LOCAL ROLE authenticated;
  SELECT f.payout_pending_cents INTO v_pending_cents
    FROM public.financial_reconciliation_summary('show', NULL, '00000000-0000-0000-0000-000002170024') f;
  RESET ROLE;
  IF v_pending_cents <> 41000 THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: money owed for a waiting payout is %, expected 41000', v_pending_cents;
  END IF;
  SELECT count(*) INTO v_in_flight FROM (
    SELECT DISTINCT ON (p.show_id) p.status
      FROM public.show_payouts p ORDER BY p.show_id, p.created_at DESC
  ) latest
   WHERE latest.status IN ('pending', 'processing', 'awaiting_approval', 'approved', 'held');
  IF (public.system_health_probe() -> 'payout_ledger' ->> 'in_flight')::integer <> v_in_flight
     OR (public.system_health_probe(false) -> 'payout_ledger' ->> 'in_flight')::integer <> v_in_flight THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: health probe in_flight differs from the % payouts not yet sent', v_in_flight;
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 money owed and the health probe count waiting payouts as not yet sent';

  -- 11. Brake OFF: new and pending payouts claim as before; a waiting payout
  --     still never sends without approval.
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109');
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings SET payouts_require_approval = false WHERE id;
  RESET ROLE;
  v_claim := pg_temp.claim(2170028, 8000);
  v_row := pg_temp.live(2170028);
  IF v_claim ->> 'outcome' <> 'claimed' OR v_row.status <> 'processing'
     OR v_claim ? 'approved_amount_cents' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 brake off, new payout: % / %', v_claim, v_row.status;
  END IF;
  v_claim := pg_temp.claim(2170029, 9000);
  IF v_claim ->> 'outcome' <> 'claimed' OR (pg_temp.live(2170029)).status <> 'processing' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 brake off, pending payout: %', v_claim;
  END IF;
  v_claim := pg_temp.claim(2170024, 41000);
  IF v_claim ->> 'outcome' <> 'awaiting_approval' OR (pg_temp.live(2170024)).status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 brake off released a waiting payout: %', v_claim;
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 brake off: claims as before, waiting payouts still wait';

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

ROLLBACK;
