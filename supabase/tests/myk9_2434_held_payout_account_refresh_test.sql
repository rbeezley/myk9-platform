-- MYK9-2434: a club reconnects Stripe while its payout is held.
-- claim_show_payout_for_send keeps the hold and its reason, and now also moves
-- the row to the club's current account (club_stripe_account_id), so
-- approve_show_payout checks the reviewed destination against the new bank
-- account, not the one the club left.
-- Migration: 20261125231345_myk9_2434_held_payout_account_refresh.sql.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000002434001', 'MYK9-2434 fixture club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES ('00000000-0000-0000-0000-000002434009', 'MYK9', 'Admin', 'myk9-2434-admin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000002434109', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2434-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002434109'
WHERE id = '00000000-0000-0000-0000-000002434009';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002434009'::uuid, roles.id, NULL::uuid, true,
       '00000000-0000-0000-0000-000002434109'::uuid
FROM public.roles WHERE roles.name = 'site_admin';

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000002434020', 'MYK9-2434 fixture show', 'AKC',
        DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000002434001', 'draft');

-- The account the payout was recorded against, and the one the club connects
-- later (a new club_stripe_accounts row, so a new id and a new destination).
INSERT INTO public.club_stripe_accounts (id, club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES
  ('00000000-0000-0000-0000-000002434002', '00000000-0000-0000-0000-000002434001',
   'acct_myk9_2434_old', true, true, false),
  ('00000000-0000-0000-0000-000002434003', '00000000-0000-0000-0000-000002434001',
   'acct_myk9_2434_new', true, true, true);

INSERT INTO public.show_payouts (id, show_id, club_stripe_account_id, amount_cents, status)
VALUES ('00000000-0000-0000-0000-000002435020', '00000000-0000-0000-0000-000002434020',
        '00000000-0000-0000-0000-000002434002', 20000, 'awaiting_approval');

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
    RAISE EXCEPTION 'FAIL MYK9-2434 %: expected SQLSTATE %, got % (%)',
      p_case, p_state, coalesce(v_state, 'no error'), v_message;
  END IF;
  RAISE NOTICE 'PASS MYK9-2434 % refused: %', p_case, v_message;
END;
$function$;

DO $$
DECLARE
  v_result text;
  v_claim jsonb;
  v_row public.show_payouts;
BEGIN
  -- Grants are unchanged: the claim is service_role only.
  IF pg_catalog.has_function_privilege('authenticated',
       'public.claim_show_payout_for_send(uuid, uuid, text, integer)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',
       'public.claim_show_payout_for_send(uuid, uuid, text, integer)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role',
       'public.claim_show_payout_for_send(uuid, uuid, text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL MYK9-2434: claim_show_payout_for_send is not service_role only';
  END IF;

  -- A site admin holds the payout.
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002434109');
  SET LOCAL ROLE authenticated;
  v_result := public.hold_show_payout('00000000-0000-0000-0000-000002435020', 'Waiting on the club');
  RESET ROLE;
  IF v_result <> 'held' THEN
    RAISE EXCEPTION 'FAIL MYK9-2434 hold returned %', v_result;
  END IF;

  -- The club reconnects Stripe; the next payout run claims with the new
  -- account and its destination (and a refund lowered the amount).
  v_claim := public.claim_show_payout_for_send(
    '00000000-0000-0000-0000-000002434020',
    '00000000-0000-0000-0000-000002434003',
    'acct_myk9_2434_new',
    18000
  );
  SELECT * INTO v_row FROM public.show_payouts sp
   WHERE sp.id = '00000000-0000-0000-0000-000002435020';
  IF v_claim ->> 'outcome' <> 'held' OR v_row.status <> 'held'
     OR v_row.hold_reason IS DISTINCT FROM 'Waiting on the club'
     OR v_row.amount_cents <> 18000 THEN
    RAISE EXCEPTION 'FAIL MYK9-2434 held claim after reconnect: % / % / % / %',
      v_claim, v_row.status, v_row.hold_reason, v_row.amount_cents;
  END IF;
  IF v_row.club_stripe_account_id IS DISTINCT FROM '00000000-0000-0000-0000-000002434003' THEN
    RAISE EXCEPTION 'FAIL MYK9-2434 a held payout kept the old account % after the club reconnected',
      v_row.club_stripe_account_id;
  END IF;
  RAISE NOTICE 'PASS MYK9-2434 a held payout follows the reconnected account and keeps its hold';

  -- Approval checks the new account: the old destination is refused, the new
  -- one is approved and bound.
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-000002434109');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_refusal(
    $q$SELECT public.approve_show_payout('00000000-0000-0000-0000-000002435020', 18000, 'acct_myk9_2434_old')$q$,
    '22023', 'approval to the account the club left'
  );
  v_result := public.approve_show_payout('00000000-0000-0000-0000-000002435020', 18000, 'acct_myk9_2434_new');
  RESET ROLE;
  SELECT * INTO v_row FROM public.show_payouts sp
   WHERE sp.id = '00000000-0000-0000-0000-000002435020';
  IF v_result <> 'approved' OR v_row.status <> 'approved'
     OR v_row.approved_stripe_account_id IS DISTINCT FROM 'acct_myk9_2434_new'
     OR v_row.approved_amount_cents IS DISTINCT FROM 18000 THEN
    RAISE EXCEPTION 'FAIL MYK9-2434 approve after reconnect: % / % / % / %',
      v_result, v_row.status, v_row.approved_stripe_account_id, v_row.approved_amount_cents;
  END IF;

  -- The next run sends to the new account within the approval.
  v_claim := public.claim_show_payout_for_send(
    '00000000-0000-0000-0000-000002434020',
    '00000000-0000-0000-0000-000002434003',
    'acct_myk9_2434_new',
    18000
  );
  IF v_claim ->> 'outcome' <> 'claimed'
     OR (SELECT sp.status FROM public.show_payouts sp
          WHERE sp.id = '00000000-0000-0000-0000-000002435020') <> 'processing' THEN
    RAISE EXCEPTION 'FAIL MYK9-2434 approved claim after reconnect: %', v_claim;
  END IF;
  RAISE NOTICE 'PASS MYK9-2434 approval binds the new account and the payout is claimed to it';

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

ROLLBACK;
