-- MYK9-2182: the payout brake's daily reminder keeps one current, resolvable
-- operator alert per waiting payout (source 'cron-process-payouts', dedupe key
-- 'payout-awaiting-approval-<payout id>').
--   * Leaving awaiting_approval resolves it, whatever the route: approve, hold,
--     a claim into processing, and the payout run's full-refund close-out.
--   * A brake-off claim of a waiting payout keeps it waiting, so its alert stays open.
--   * A second reminder while waiting refreshes the one alert, never adds a row.
--   * A reminder that lands after the payout left waiting is recorded resolved.
--   * Entering awaiting_approval again clears approval_reminded_at.
--   * Another payout's alert is untouched; the trigger functions are not callable.
-- Migration: 20261126034519_myk9_2182_payout_approval_reminders.sql.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000002182001', 'MYK9-2182 fixture club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES ('00000000-0000-0000-0000-000002182009', 'MYK9', 'Admin', 'myk9-2182-admin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000002182109', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2182-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002182109'
WHERE id = '00000000-0000-0000-0000-000002182009';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002182009'::uuid, roles.id, NULL::uuid, true,
       '00000000-0000-0000-0000-000002182109'::uuid
FROM public.roles WHERE roles.name = 'site_admin';

-- Shows 2182020..2182027.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
SELECT ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'MYK9-2182 fixture ' || n, 'AKC', DATE '2026-09-01', DATE '2026-09-02',
       '00000000-0000-0000-0000-000002182001', 'draft'
FROM generate_series(2182020, 2182027) AS n;

INSERT INTO public.club_stripe_accounts (id, club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES ('00000000-0000-0000-0000-000002182002', '00000000-0000-0000-0000-000002182001',
        'acct_myk9_2182', true, true, false);

-- Payout 21830nn belongs to show 21820nn; every one starts waiting and reminded.
INSERT INTO public.show_payouts (id, show_id, club_stripe_account_id, amount_cents, status, approval_reminded_at)
SELECT ('00000000-0000-0000-0000-' || lpad((n + 1000)::text, 12, '0'))::uuid,
       ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000002182002', 10000, 'awaiting_approval', now() - interval '1 hour'
FROM generate_series(2182020, 2182027) AS n;

CREATE FUNCTION pg_temp.payout_id(p_show_suffix integer)
RETURNS uuid
LANGUAGE sql
AS $function$
  SELECT ('00000000-0000-0000-0000-' || lpad((p_show_suffix + 1000)::text, 12, '0'))::uuid;
$function$;

-- The reminder the payout run raises, as alertAdmin inserts it.
CREATE FUNCTION pg_temp.remind(p_show_suffix integer, p_title text DEFAULT 'Payout waiting for your approval')
RETURNS void
LANGUAGE sql
AS $function$
  INSERT INTO public.operator_alerts (source, severity, title, detail, dedupe_key)
  VALUES ('cron-process-payouts', 'warn', p_title, jsonb_build_object('html', p_title),
          'payout-awaiting-approval-' || pg_temp.payout_id(p_show_suffix)::text);
$function$;

CREATE FUNCTION pg_temp.open_alerts(p_show_suffix integer)
RETURNS integer
LANGUAGE sql
AS $function$
  SELECT count(*)::integer FROM public.operator_alerts a
   WHERE a.source = 'cron-process-payouts'
     AND a.dedupe_key = 'payout-awaiting-approval-' || pg_temp.payout_id(p_show_suffix)::text
     AND a.resolved_at IS NULL;
$function$;

CREATE FUNCTION pg_temp.all_alerts(p_show_suffix integer)
RETURNS integer
LANGUAGE sql
AS $function$
  SELECT count(*)::integer FROM public.operator_alerts a
   WHERE a.source = 'cron-process-payouts'
     AND a.dedupe_key = 'payout-awaiting-approval-' || pg_temp.payout_id(p_show_suffix)::text;
$function$;

CREATE FUNCTION pg_temp.as_admin()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002182109', true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object(
      'sub', '00000000-0000-0000-0000-000002182109', 'role', 'authenticated',
      'amr', jsonb_build_array(jsonb_build_object(
        'method', 'password', 'timestamp', extract(epoch FROM now())::bigint - 10))
    )::text, true);
END;
$function$;

DO $$
DECLARE
  v_n integer;
  v_alert public.operator_alerts;
  v_claim jsonb;
  v_row public.show_payouts;
BEGIN
  -- 0. Grants: the trigger functions are nobody's to call.
  IF pg_catalog.has_function_privilege('anon', 'public.show_payouts_approval_reminder()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.show_payouts_approval_reminder()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.operator_alerts_payout_approval_reminder()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.operator_alerts_payout_approval_reminder()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL MYK9-2182: a reminder trigger function is callable by a client role';
  END IF;

  FOR v_n IN 2182020..2182027 LOOP
    PERFORM pg_temp.remind(v_n);
  END LOOP;

  -- 1. A second reminder while waiting refreshes the one alert.
  PERFORM pg_temp.remind(2182020, 'Payout waiting for your approval (refreshed)');
  IF pg_temp.all_alerts(2182020) <> 1 THEN
    RAISE EXCEPTION 'FAIL MYK9-2182: a second reminder added a row (% rows)', pg_temp.all_alerts(2182020);
  END IF;
  SELECT * INTO v_alert FROM public.operator_alerts a
   WHERE a.dedupe_key = 'payout-awaiting-approval-' || pg_temp.payout_id(2182020)::text;
  IF v_alert.title <> 'Payout waiting for your approval (refreshed)'
     OR v_alert.detail ->> 'html' <> 'Payout waiting for your approval (refreshed)' THEN
    RAISE EXCEPTION 'FAIL MYK9-2182: the open alert was not refreshed (%)', v_alert.title;
  END IF;
  RAISE NOTICE 'PASS MYK9-2182 one current alert per waiting payout';

  -- 2. Approve.
  PERFORM pg_temp.as_admin();
  SET LOCAL ROLE authenticated;
  PERFORM public.approve_show_payout(pg_temp.payout_id(2182020), 10000, 'acct_myk9_2182');
  RESET ROLE;
  SELECT * INTO v_alert FROM public.operator_alerts a
   WHERE a.dedupe_key = 'payout-awaiting-approval-' || pg_temp.payout_id(2182020)::text;
  IF v_alert.resolved_at IS NULL
     OR v_alert.resolved_by IS DISTINCT FROM '00000000-0000-0000-0000-000002182109' THEN
    RAISE EXCEPTION 'FAIL MYK9-2182 approve: the reminder is not resolved by the approver (% / %)',
      v_alert.resolved_at, v_alert.resolved_by;
  END IF;
  IF pg_temp.open_alerts(2182021) <> 1 THEN
    RAISE EXCEPTION 'FAIL MYK9-2182 approve: resolved another payout''s reminder';
  END IF;
  RAISE NOTICE 'PASS MYK9-2182 approving resolves the reminder';

  -- 3. Hold.
  SET LOCAL ROLE authenticated;
  PERFORM public.hold_show_payout(pg_temp.payout_id(2182021), 'Checking the club''s bank details');
  RESET ROLE;
  IF pg_temp.open_alerts(2182021) <> 0 THEN
    RAISE EXCEPTION 'FAIL MYK9-2182 hold: the reminder is still open';
  END IF;
  RAISE NOTICE 'PASS MYK9-2182 holding resolves the reminder';

  -- 4. Brake off: a claim of a waiting payout keeps it waiting, and its alert open.
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings SET payouts_require_approval = false WHERE id;
  RESET ROLE;
  IF (SELECT ps.payouts_require_approval FROM public.platform_settings ps WHERE ps.id) THEN
    RAISE EXCEPTION 'FAIL MYK9-2182 fixture: the brake did not switch off';
  END IF;
  v_claim := public.claim_show_payout_for_send(
    '00000000-0000-0000-0000-000002182022', '00000000-0000-0000-0000-000002182002',
    'acct_myk9_2182', 9000);
  IF v_claim ->> 'outcome' <> 'awaiting_approval' OR pg_temp.open_alerts(2182022) <> 1 THEN
    RAISE EXCEPTION 'FAIL MYK9-2182 brake off: a still-waiting payout lost its reminder (%)', v_claim;
  END IF;
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_settings SET payouts_require_approval = true WHERE id;
  RESET ROLE;

  -- 5. Any claim that takes a waiting row into processing resolves it.
  UPDATE public.show_payouts SET status = 'processing' WHERE id = pg_temp.payout_id(2182022);
  IF pg_temp.open_alerts(2182022) <> 0 THEN
    RAISE EXCEPTION 'FAIL MYK9-2182 claim: a payout taken into processing kept its reminder';
  END IF;
  RAISE NOTICE 'PASS MYK9-2182 a claim out of waiting resolves the reminder';

  -- 6. The payout run's full-refund close-out (processShow: amount 0, completed).
  UPDATE public.show_payouts
     SET amount_cents = 0, status = 'completed', completed_at = now()
   WHERE id = pg_temp.payout_id(2182023)
     AND status IN ('pending', 'awaiting_approval', 'approved', 'held');
  IF pg_temp.open_alerts(2182023) <> 0 THEN
    RAISE EXCEPTION 'FAIL MYK9-2182 close-out: a fully refunded payout kept its reminder';
  END IF;
  RAISE NOTICE 'PASS MYK9-2182 a full-refund close-out resolves the reminder';

  -- 7. A reminder that lands after the payout left waiting is recorded resolved.
  PERFORM pg_temp.remind(2182020, 'Late reminder');
  IF pg_temp.open_alerts(2182020) <> 0 OR pg_temp.all_alerts(2182020) <> 2 THEN
    RAISE EXCEPTION 'FAIL MYK9-2182: a reminder for an approved payout is open (% open, % rows)',
      pg_temp.open_alerts(2182020), pg_temp.all_alerts(2182020);
  END IF;
  RAISE NOTICE 'PASS MYK9-2182 a late reminder lands resolved';

  -- 8. Entering awaiting_approval again (approval withdrawn by the claim) clears
  --    the reminder stamp, so the next run reminds at once; the stamp is
  --    untouched by a claim that keeps the payout waiting.
  SELECT * INTO v_row FROM public.show_payouts sp WHERE sp.id = pg_temp.payout_id(2182024);
  IF v_row.approval_reminded_at IS NULL THEN
    RAISE EXCEPTION 'FAIL MYK9-2182: fixture payout has no reminder stamp';
  END IF;
  v_claim := public.claim_show_payout_for_send(
    '00000000-0000-0000-0000-000002182024', '00000000-0000-0000-0000-000002182002',
    'acct_myk9_2182', 9500);
  IF (SELECT sp.approval_reminded_at FROM public.show_payouts sp
       WHERE sp.id = pg_temp.payout_id(2182024)) IS DISTINCT FROM v_row.approval_reminded_at THEN
    RAISE EXCEPTION 'FAIL MYK9-2182: a claim that kept the payout waiting reset its reminder stamp';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM public.approve_show_payout(pg_temp.payout_id(2182024), 9500, 'acct_myk9_2182');
  RESET ROLE;
  v_claim := public.claim_show_payout_for_send(
    '00000000-0000-0000-0000-000002182024', '00000000-0000-0000-0000-000002182002',
    'acct_myk9_2182', 12000);
  SELECT * INTO v_row FROM public.show_payouts sp WHERE sp.id = pg_temp.payout_id(2182024);
  IF v_claim ->> 'outcome' <> 'approval_reset' OR v_row.status <> 'awaiting_approval'
     OR v_row.approval_reminded_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL MYK9-2182: re-entering waiting kept the reminder stamp (% / % / %)',
      v_claim, v_row.status, v_row.approval_reminded_at;
  END IF;
  -- Its new reminder opens a fresh alert (the old one resolved on approval).
  PERFORM pg_temp.remind(2182024);
  IF pg_temp.open_alerts(2182024) <> 1 THEN
    RAISE EXCEPTION 'FAIL MYK9-2182: a payout waiting again has % open reminders', pg_temp.open_alerts(2182024);
  END IF;
  RAISE NOTICE 'PASS MYK9-2182 waiting again starts a new reminder';

  -- 9. Payouts still waiting keep their reminders; other alerts are untouched.
  IF pg_temp.open_alerts(2182025) <> 1 OR pg_temp.open_alerts(2182026) <> 1
     OR pg_temp.open_alerts(2182027) <> 1 THEN
    RAISE EXCEPTION 'FAIL MYK9-2182: a still-waiting payout lost its reminder';
  END IF;
  INSERT INTO public.operator_alerts (source, severity, title, dedupe_key)
  VALUES ('cron-process-payouts', 'error', 'Other alert', 'payout-claim-error-myk9-2182');
  IF NOT EXISTS (SELECT 1 FROM public.operator_alerts a
                  WHERE a.dedupe_key = 'payout-claim-error-myk9-2182' AND a.resolved_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL MYK9-2182: an unrelated payout alert was changed on insert';
  END IF;
  RAISE NOTICE 'PASS MYK9-2182 waiting payouts keep their reminders';

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

ROLLBACK;
