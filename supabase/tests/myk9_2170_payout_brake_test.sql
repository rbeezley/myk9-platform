-- MYK9-2170: the payout brake, server side.
-- platform_settings.payouts_require_approval defaults on and every switch is
-- recorded (who, when); the three new show_payouts statuses are live rows the
-- health probe does not count as failed; approve_show_payout and
-- hold_show_payout are site-admin only, change a row at most once (a second
-- approval reads back 'already_approved' and records nothing), keep a hold
-- reason, let a held payout be approved later, and resolve the daily reminder.
-- Money owed (financial_reconciliation_summary) and the health probe's
-- in-flight count include payouts waiting on the brake.
-- Round 3: approving and switching the brake off need a recent sign-in; an
-- approval binds the amount and destination, and the payout run's claim
-- (claim_show_payout_for_send) re-reads the brake and enforces the binding;
-- reopen_show_payout_approval sends a changed payout back; every exit from
-- awaiting_approval resolves its reminder.
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
-- Also the fixture club's admin, so the club-scoped money summary covers only these rows.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002170009'::uuid, roles.id,
       '00000000-0000-0000-0000-000002170001'::uuid, true,
       '00000000-0000-0000-0000-000002170109'::uuid
FROM public.roles WHERE roles.name = 'club_admin';

-- Shows 2170020..2170031, one payout each (026 and 030 start with none).
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
SELECT ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'MYK9-2170 fixture ' || n, 'AKC', DATE '2026-09-01', DATE '2026-09-02',
       '00000000-0000-0000-0000-000002170001', 'draft'
FROM generate_series(2170020, 2170031) AS n;

INSERT INTO public.club_stripe_accounts (id, club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES ('00000000-0000-0000-0000-000002170002', '00000000-0000-0000-0000-000002170001',
        'acct_myk9_2170', true, true, false);

INSERT INTO public.show_payouts (id, show_id, amount_cents, status)
VALUES
  -- awaiting: approved twice
  ('00000000-0000-0000-0000-000002171020', '00000000-0000-0000-0000-000002170020', 10000, 'awaiting_approval'),
  -- awaiting: held, then approved
  ('00000000-0000-0000-0000-000002171021', '00000000-0000-0000-0000-000002170021', 20000, 'awaiting_approval'),
  -- not waiting for approval
  ('00000000-0000-0000-0000-000002171022', '00000000-0000-0000-0000-000002170022', 30000, 'pending'),
  ('00000000-0000-0000-0000-000002171023', '00000000-0000-0000-0000-000002170023', 40000, 'processing'),
  ('00000000-0000-0000-0000-000002171024', '00000000-0000-0000-0000-000002170024', 50000, 'completed'),
  -- awaiting: approved, then held before the run sent it
  ('00000000-0000-0000-0000-000002171025', '00000000-0000-0000-0000-000002170025', 60000, 'awaiting_approval'),
  -- awaiting with no destination account (left NULL below)
  ('00000000-0000-0000-0000-000002171027', '00000000-0000-0000-0000-000002170027', 1000, 'awaiting_approval'),
  -- awaiting: claimed by the payout run once the brake is off
  ('00000000-0000-0000-0000-000002171028', '00000000-0000-0000-0000-000002170028', 2000, 'awaiting_approval'),
  -- awaiting: fully refunded, closed out by the payout run
  ('00000000-0000-0000-0000-000002171031', '00000000-0000-0000-0000-000002170031', 500, 'awaiting_approval');
UPDATE public.show_payouts SET club_stripe_account_id = '00000000-0000-0000-0000-000002170002'
 WHERE show_id IN (SELECT s.id FROM public.shows s WHERE s.club_id = '00000000-0000-0000-0000-000002170001')
   AND id <> '00000000-0000-0000-0000-000002171027';
-- approved for 3000 to acct_myk9_2170: the claim's approval binding and the reopen RPC
INSERT INTO public.show_payouts (
  id, show_id, club_stripe_account_id, amount_cents, status,
  approved_at, approved_amount_cents, approved_stripe_account_id
)
VALUES ('00000000-0000-0000-0000-000002171029', '00000000-0000-0000-0000-000002170029',
        '00000000-0000-0000-0000-000002170002', 3000, 'approved', now(), 3000, 'acct_myk9_2170');
-- An earlier failed attempt for show 020, superseded by its live brake row.
INSERT INTO public.show_payouts (id, show_id, amount_cents, status, failure_reason, created_at)
VALUES ('00000000-0000-0000-0000-000002171030', '00000000-0000-0000-0000-000002170020', 5000,
        'failed', 'account_closed', now() - interval '2 days');

-- The daily reminders the cron raised for the three awaiting payouts.
INSERT INTO public.operator_alerts (source, severity, title, dedupe_key)
VALUES
  ('cron-process-payouts', 'error', 'Payout waiting 020', 'payout-awaiting-approval-00000000-0000-0000-0000-000002171020'),
  ('cron-process-payouts', 'error', 'Payout waiting 021', 'payout-awaiting-approval-00000000-0000-0000-0000-000002171021'),
  ('cron-process-payouts', 'error', 'Payout waiting 025', 'payout-awaiting-approval-00000000-0000-0000-0000-000002171025'),
  ('cron-process-payouts', 'warn', 'Payout waiting 028', 'payout-awaiting-approval-00000000-0000-0000-0000-000002171028'),
  ('cron-process-payouts', 'warn', 'Payout waiting 031', 'payout-awaiting-approval-00000000-0000-0000-0000-000002171031');

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

DO $$
DECLARE
  v_result text;
  v_count integer;
  v_failed_before integer;
  v_failed_after integer;
  v_in_flight integer;
  v_pending_cents bigint;
  v_failed_cents bigint;
  v_completed_cents bigint;
  v_row public.show_payouts;
  v_claimed uuid;
BEGIN
  -- 1. The setting: on by default, readable by the service role's select.
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

  -- 2. Access: anon gets nothing, the RPCs are not anon's, events are site-admin reads.
  IF pg_catalog.has_table_privilege('anon', 'public.payout_approval_events', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'public.payout_approval_events', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.payout_approval_events', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.payout_approval_events', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.payout_approval_events', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: payout_approval_events is writable by a client role or readable by anon';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'public.approve_show_payout(uuid, integer)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.hold_show_payout(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: anon can execute a payout approval RPC';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated',
       'public.claim_show_payout_for_send(uuid, uuid, text, uuid, text, integer, timestamptz, integer, text)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',
       'public.claim_show_payout_for_send(uuid, uuid, text, uuid, text, integer, timestamptz, integer, text)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated',
       'public.reopen_show_payout_approval(uuid, text, integer, uuid, text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role',
       'public.claim_show_payout_for_send(uuid, uuid, text, uuid, text, integer, timestamptz, integer, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: the payout run''s claim or reopen RPC is not service_role only';
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 grants';

  -- 3. Switching the brake is recorded, with who; a non-admin cannot switch it.
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170110');
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings SET payouts_require_approval = false WHERE id;
  RESET ROLE;
  IF NOT (SELECT ps.payouts_require_approval FROM public.platform_settings ps WHERE ps.id)
     OR EXISTS (SELECT 1 FROM public.payout_approval_events e WHERE e.event IN ('brake_on', 'brake_off')) THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: a non-admin switched the brake, or a switch was recorded';
  END IF;

  -- A site admin whose sign-in is stale cannot switch the brake off.
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109', 3600);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_refusal(
    'UPDATE public.platform_settings SET payouts_require_approval = false WHERE id',
    'MKAUT', 'brake off from a stale session'
  );
  RESET ROLE;
  IF NOT (SELECT ps.payouts_require_approval FROM public.platform_settings ps WHERE ps.id)
     OR EXISTS (SELECT 1 FROM public.payout_approval_events) THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: a stale session switched the brake off';
  END IF;

  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109');
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings SET payouts_require_approval = false WHERE id;
  -- A save that leaves the value alone records nothing.
  UPDATE public.platform_settings SET payouts_require_approval = false WHERE id;
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.payout_approval_events e
   WHERE e.event = 'brake_off'
     AND e.actor_person_id = '00000000-0000-0000-0000-000002170009'
     AND e.actor_role = 'authenticated'
     AND e.created_at IS NOT NULL;
  IF v_count <> 1 OR (SELECT count(*) FROM public.payout_approval_events) <> 1 THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: switching the brake off recorded % matching events', v_count;
  END IF;

  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings SET payouts_require_approval = true WHERE id;
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.payout_approval_events e
                  WHERE e.event = 'brake_on'
                    AND e.actor_person_id = '00000000-0000-0000-0000-000002170009') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: switching the brake back on was not recorded';
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 brake switches are recorded with who and when';

  -- 4. New statuses are live rows: still one per show, and not failures to the health probe.
  BEGIN
    INSERT INTO public.show_payouts (show_id, amount_cents, status)
    VALUES ('00000000-0000-0000-0000-000002170020', 1, 'awaiting_approval');
    RAISE EXCEPTION 'FAIL MYK9-2170: a second live payout row was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS MYK9-2170 one live payout per show still holds';
  END;
  PERFORM pg_temp.expect_refusal(
    $q$INSERT INTO public.show_payouts (show_id, amount_cents, status)
       VALUES ('00000000-0000-0000-0000-000002170026', 1, 'bogus')$q$,
    '23514', 'unknown status'
  );

  -- 5. Approval is a site admin's.
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170110');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002171020')$q$,
    '42501', 'non-admin approval'
  );
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.hold_show_payout('00000000-0000-0000-0000-000002171020', 'no')$q$,
    '42501', 'non-admin hold'
  );
  IF EXISTS (SELECT 1 FROM public.payout_approval_events) THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: a non-admin can read payout_approval_events';
  END IF;
  RESET ROLE;

  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109');
  SET LOCAL ROLE authenticated;

  -- 6. Approve needs a recent sign-in and binds the amount the approver saw.
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109', 3600);
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002171020')$q$,
    'MKAUT', 'approval from a stale session'
  );
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109');
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002171020', 9999)$q$,
    '22023', 'approval of an amount that has changed'
  );
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002171027')$q$,
    '22023', 'approval with no destination account'
  );
  RESET ROLE;
  IF (SELECT sp.status FROM public.show_payouts sp
       WHERE sp.id = '00000000-0000-0000-0000-000002171020') <> 'awaiting_approval'
     OR EXISTS (SELECT 1 FROM public.payout_approval_events e WHERE e.event = 'approved') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: a refused approval changed the payout';
  END IF;
  SET LOCAL ROLE authenticated;

  -- Approve, then approve again: the row changes once, one event, alert resolved.
  v_result := public.approve_show_payout('00000000-0000-0000-0000-000002171020', 10000);
  IF v_result <> 'approved' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve: returned %', v_result;
  END IF;
  v_result := public.approve_show_payout('00000000-0000-0000-0000-000002171020');
  IF v_result <> 'already_approved' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve twice: second call returned %', v_result;
  END IF;
  RESET ROLE;

  SELECT * INTO v_row FROM public.show_payouts WHERE id = '00000000-0000-0000-0000-000002171020';
  IF v_row.status <> 'approved' OR v_row.approved_at IS NULL OR v_row.amount_cents <> 10000
     OR v_row.approved_amount_cents IS DISTINCT FROM 10000
     OR v_row.approved_stripe_account_id IS DISTINCT FROM 'acct_myk9_2170' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve: row is % / % / % / % / %',
      v_row.status, v_row.approved_at, v_row.amount_cents,
      v_row.approved_amount_cents, v_row.approved_stripe_account_id;
  END IF;
  SELECT count(*) INTO v_count FROM public.payout_approval_events e
   WHERE e.event = 'approved'
     AND e.show_payout_id = '00000000-0000-0000-0000-000002171020'
     AND e.actor_person_id = '00000000-0000-0000-0000-000002170009';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve twice: % approval events, expected 1', v_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.operator_alerts a
              WHERE a.dedupe_key = 'payout-awaiting-approval-00000000-0000-0000-0000-000002171020'
                AND (a.resolved_at IS NULL
                     OR a.resolved_by IS DISTINCT FROM '00000000-0000-0000-0000-000002170109')) THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve: the daily reminder alert is still unresolved';
  END IF;
  -- Another payout's reminder is untouched.
  IF NOT EXISTS (SELECT 1 FROM public.operator_alerts a
                  WHERE a.dedupe_key = 'payout-awaiting-approval-00000000-0000-0000-0000-000002171021'
                    AND a.resolved_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve: resolved another payout''s reminder';
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 approve and approve-twice';

  -- 7. Hold with a reason; it stays waiting and can be approved later.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.hold_show_payout('00000000-0000-0000-0000-000002171021', '   ')$q$,
    '22023', 'blank hold reason'
  );
  v_result := public.hold_show_payout('00000000-0000-0000-0000-000002171021', '  Club bank details under review  ');
  RESET ROLE;
  IF v_result <> 'held'
     OR (SELECT sp.status FROM public.show_payouts sp
          WHERE sp.id = '00000000-0000-0000-0000-000002171021') <> 'held' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 hold: returned %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payout_approval_events e
                  WHERE e.event = 'held'
                    AND e.show_payout_id = '00000000-0000-0000-0000-000002171021'
                    AND e.reason = 'Club bank details under review'
                    AND e.actor_person_id = '00000000-0000-0000-0000-000002170009') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 hold: the reason was not recorded';
  END IF;
  IF EXISTS (SELECT 1 FROM public.operator_alerts a
              WHERE a.dedupe_key = 'payout-awaiting-approval-00000000-0000-0000-0000-000002171021'
                AND a.resolved_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 hold: the daily reminder alert is still unresolved';
  END IF;

  SET LOCAL ROLE authenticated;
  v_result := public.approve_show_payout('00000000-0000-0000-0000-000002171021');
  RESET ROLE;
  IF v_result <> 'approved'
     OR (SELECT sp.status FROM public.show_payouts sp
          WHERE sp.id = '00000000-0000-0000-0000-000002171021') <> 'approved' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 approve after hold: returned %', v_result;
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 hold with a reason, then approve';

  -- 8. An approved payout not yet sent can be held again; its approval is withdrawn.
  SET LOCAL ROLE authenticated;
  PERFORM public.approve_show_payout('00000000-0000-0000-0000-000002171025');
  v_result := public.hold_show_payout('00000000-0000-0000-0000-000002171025', 'Second look');
  RESET ROLE;
  SELECT * INTO v_row FROM public.show_payouts WHERE id = '00000000-0000-0000-0000-000002171025';
  IF v_result <> 'held' OR v_row.status <> 'held' OR v_row.approved_at IS NOT NULL
     OR v_row.approved_amount_cents IS NOT NULL OR v_row.approved_stripe_account_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 hold after approve: % / % / %',
      v_result, v_row.status, v_row.approved_at;
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 hold after approve withdraws the approval';

  -- 9. Rows that are not waiting for approval.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002171022')$q$,
    '22023', 'approve a pending payout'
  );
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.hold_show_payout('00000000-0000-0000-0000-000002171023', 'too late')$q$,
    '22023', 'hold a payout being sent'
  );
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002179999')$q$,
    'P0002', 'approve a missing payout'
  );
  IF public.approve_show_payout('00000000-0000-0000-0000-000002171024') <> 'already_approved' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: approving a sent payout did not read back already_approved';
  END IF;
  RESET ROLE;
  IF (SELECT sp.status FROM public.show_payouts sp
       WHERE sp.id = '00000000-0000-0000-0000-000002171022') <> 'pending'
     OR (SELECT sp.status FROM public.show_payouts sp
          WHERE sp.id = '00000000-0000-0000-0000-000002171023') <> 'processing'
     OR (SELECT sp.status FROM public.show_payouts sp
          WHERE sp.id = '00000000-0000-0000-0000-000002171024') <> 'completed' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: a refused approval or hold changed a row';
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 only waiting payouts are approved or held';

  -- 9a. The payout run's claim re-reads the brake (it is on here).
  SET LOCAL ROLE service_role;
  v_claimed := public.claim_show_payout_for_send(
    '00000000-0000-0000-0000-000002170028', '00000000-0000-0000-0000-000002171028',
    'awaiting_approval', '00000000-0000-0000-0000-000002170002', 'acct_myk9_2170', 2000);
  IF v_claimed IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 claim: an unapproved payout was claimed with the brake on';
  END IF;
  v_claimed := public.claim_show_payout_for_send(
    '00000000-0000-0000-0000-000002170030', NULL, NULL,
    '00000000-0000-0000-0000-000002170002', 'acct_myk9_2170', 4000);
  IF v_claimed IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 claim: a new unapproved payout was claimed with the brake on';
  END IF;
  RESET ROLE;

  -- Brake off (fresh session): the waiting payout is claimed, and its reminder resolves.
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109');
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings SET payouts_require_approval = false WHERE id;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  v_claimed := public.claim_show_payout_for_send(
    '00000000-0000-0000-0000-000002170028', '00000000-0000-0000-0000-000002171028',
    'awaiting_approval', '00000000-0000-0000-0000-000002170002', 'acct_myk9_2170', 2000);
  RESET ROLE;
  IF v_claimed IS DISTINCT FROM '00000000-0000-0000-0000-000002171028'
     OR (SELECT sp.status FROM public.show_payouts sp WHERE sp.id = v_claimed) <> 'processing' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 claim: brake off did not claim the waiting payout (%)', v_claimed;
  END IF;
  IF EXISTS (SELECT 1 FROM public.operator_alerts a
              WHERE a.dedupe_key = 'payout-awaiting-approval-00000000-0000-0000-0000-000002171028'
                AND a.resolved_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: a payout claimed with the brake off kept its reminder';
  END IF;
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002170109');
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings SET payouts_require_approval = true WHERE id;
  RESET ROLE;
  RAISE NOTICE 'PASS MYK9-2170 the claim re-reads the brake';

  -- 9b. An approval covers its destination and at most its amount.
  SET LOCAL ROLE service_role;
  IF public.claim_show_payout_for_send(
       '00000000-0000-0000-0000-000002170029', '00000000-0000-0000-0000-000002171029',
       'approved', '00000000-0000-0000-0000-000002170002', 'acct_other', 3000) IS NOT NULL
     OR public.claim_show_payout_for_send(
       '00000000-0000-0000-0000-000002170029', '00000000-0000-0000-0000-000002171029',
       'approved', '00000000-0000-0000-0000-000002170002', 'acct_myk9_2170', 3500) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 claim: an approval was used for another destination or a larger amount';
  END IF;
  -- A carried approval (self-healing retry) inserts the retry row with it.
  IF public.claim_show_payout_for_send(
       '00000000-0000-0000-0000-000002170030', NULL, NULL,
       '00000000-0000-0000-0000-000002170002', 'acct_myk9_2170', 4500,
       now(), 4000, 'acct_myk9_2170') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 claim: a carried approval was used for a larger amount';
  END IF;
  v_claimed := public.claim_show_payout_for_send(
    '00000000-0000-0000-0000-000002170030', NULL, NULL,
    '00000000-0000-0000-0000-000002170002', 'acct_myk9_2170', 4000,
    now(), 4000, 'acct_myk9_2170');
  RESET ROLE;
  SELECT * INTO v_row FROM public.show_payouts WHERE id = v_claimed;
  IF v_row.status IS DISTINCT FROM 'processing' OR v_row.approved_amount_cents IS DISTINCT FROM 4000
     OR v_row.approved_stripe_account_id IS DISTINCT FROM 'acct_myk9_2170' THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 claim: the carried approval was not claimed with its binding';
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 an approval is bound to its destination and amount';

  -- 9c. reopen_show_payout_approval sends an approved payout back, with the reason.
  SET LOCAL ROLE service_role;
  IF NOT public.reopen_show_payout_approval(
       '00000000-0000-0000-0000-000002171029', 'approved', 3000,
       '00000000-0000-0000-0000-000002170002', 'the destination account changed') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 reopen: the approved payout was not reopened';
  END IF;
  IF public.reopen_show_payout_approval(
       '00000000-0000-0000-0000-000002171029', 'approved', 3000,
       '00000000-0000-0000-0000-000002170002', 'again') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 reopen: reopened a payout that was no longer approved';
  END IF;
  RESET ROLE;
  SELECT * INTO v_row FROM public.show_payouts WHERE id = '00000000-0000-0000-0000-000002171029';
  IF v_row.status <> 'awaiting_approval' OR v_row.approved_at IS NOT NULL
     OR v_row.approved_amount_cents IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public.payout_approval_events e
                     WHERE e.event = 'reopened'
                       AND e.show_payout_id = '00000000-0000-0000-0000-000002171029'
                       AND e.reason = 'the destination account changed'
                       AND e.actor_role = 'service_role') THEN
    RAISE EXCEPTION 'FAIL MYK9-2170 reopen: row or event wrong';
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 reopen sends an approved payout back for approval';

  -- 9d. A waiting payout closed out as fully refunded resolves its reminder.
  UPDATE public.show_payouts
     SET status = 'completed', amount_cents = 0, completed_at = now()
   WHERE id = '00000000-0000-0000-0000-000002171031' AND status = 'awaiting_approval';
  IF EXISTS (SELECT 1 FROM public.operator_alerts a
              WHERE a.dedupe_key = 'payout-awaiting-approval-00000000-0000-0000-0000-000002171031'
                AND a.resolved_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: a fully refunded waiting payout kept its reminder';
  END IF;
  PERFORM pg_temp.expect_refusal(
    $q$INSERT INTO public.show_payouts (show_id, amount_cents, status, approved_at)
       VALUES ('00000000-0000-0000-0000-000002170026', 1, 'approved', now())$q$,
    '23514', 'an approval with no amount or destination'
  );
  RAISE NOTICE 'PASS MYK9-2170 every exit from awaiting_approval resolves its reminder';

  -- 10. Money owed counts every payout not yet sent, the brake statuses included:
  --     020 approved 10000, 021 approved 20000, 022 pending 30000,
  --     023 processing 40000, 025 held 60000, 026 awaiting 70000,
  --     027 awaiting 1000, 028 processing 2000, 029 awaiting 3000,
  --     030 processing 4000; 031 closed out at 0.
  INSERT INTO public.show_payouts (id, show_id, amount_cents, status)
  VALUES ('00000000-0000-0000-0000-000002171026', '00000000-0000-0000-0000-000002170026', 70000, 'awaiting_approval');
  SET LOCAL ROLE authenticated;
  SELECT f.payout_pending_cents, f.payout_failed_cents, f.payout_completed_cents
    INTO v_pending_cents, v_failed_cents, v_completed_cents
    FROM public.financial_reconciliation_summary('club', '00000000-0000-0000-0000-000002170001') f;
  RESET ROLE;
  IF v_pending_cents <> 240000 OR v_failed_cents <> 0 OR v_completed_cents <> 50000 THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: money summary pending/failed/completed = %/%/%, expected 240000/0/50000',
      v_pending_cents, v_failed_cents, v_completed_cents;
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 money owed includes payouts awaiting approval, approved or held';

  -- 11. The health probe reads the brake statuses as in flight, never as failed.
  SELECT count(*) INTO v_failed_before FROM (
    SELECT DISTINCT ON (p.show_id) p.status
      FROM public.show_payouts p ORDER BY p.show_id, p.created_at DESC
  ) latest WHERE latest.status = 'failed';
  v_failed_after := (public.system_health_probe() -> 'payout_ledger' ->> 'failed')::integer;
  IF v_failed_after <> v_failed_before THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: health probe reports % failed payouts, the ledger has %',
      v_failed_after, v_failed_before;
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 health probe does not count waiting, approved or held payouts as failed';

  SELECT count(*) INTO v_in_flight FROM (
    SELECT DISTINCT ON (p.show_id) p.status, p.show_id
      FROM public.show_payouts p ORDER BY p.show_id, p.created_at DESC
  ) latest
   WHERE latest.status IN ('pending', 'processing', 'awaiting_approval', 'approved', 'held');
  IF (SELECT count(*) FROM public.show_payouts sp
       WHERE sp.show_id IN (SELECT s.id FROM public.shows s
                             WHERE s.club_id = '00000000-0000-0000-0000-000002170001')
         AND sp.status IN ('awaiting_approval', 'approved', 'held')) <> 6 THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: fixture does not hold the six brake-status rows the in-flight check needs';
  END IF;
  IF (public.system_health_probe() -> 'payout_ledger' ->> 'in_flight')::integer <> v_in_flight
     OR (public.system_health_probe(false) -> 'payout_ledger' ->> 'in_flight')::integer <> v_in_flight THEN
    RAISE EXCEPTION 'FAIL MYK9-2170: health probe in_flight is %/%, the ledger has % not yet sent',
      public.system_health_probe() -> 'payout_ledger' ->> 'in_flight',
      public.system_health_probe(false) -> 'payout_ledger' ->> 'in_flight', v_in_flight;
  END IF;
  RAISE NOTICE 'PASS MYK9-2170 health probe counts waiting, approved and held payouts as in flight';

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

ROLLBACK;
