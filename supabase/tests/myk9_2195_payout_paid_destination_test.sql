-- MYK9-2195: show_payouts records the Stripe account a transfer paid, or says
-- explicitly that the destination was not checked. The shape constraint keeps
-- the two columns honest: an account exactly when checked, and only on a
-- recorded transfer.
-- Migration: 20261121063745_myk9_2195_payout_paid_destination.sql.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000002195001', 'MYK9-2195 fixture club');

-- Shows 2195020..2195024.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
SELECT ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'MYK9-2195 fixture ' || n, 'AKC', DATE '2026-09-01', DATE '2026-09-02',
       '00000000-0000-0000-0000-000002195001', 'draft'
FROM generate_series(2195020, 2195024) AS n;

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
    RAISE EXCEPTION 'FAIL MYK9-2195 %: expected SQLSTATE %, got % (%)',
      p_case, p_state, coalesce(v_state, 'no error'), v_message;
  END IF;
  RAISE NOTICE 'PASS MYK9-2195 % refused: %', p_case, v_message;
END;
$function$;

DO $$
BEGIN
  -- 1. The three recorded states are accepted: paid to an account Stripe
  --    reported, not checked, and no transfer recorded yet.
  INSERT INTO public.show_payouts
    (show_id, amount_cents, status, stripe_transfer_id, paid_stripe_account_id, paid_destination_checked)
  VALUES
    ('00000000-0000-0000-0000-000002195020', 1000, 'completed', 'tr_2195_a', 'acct_2195', true),
    ('00000000-0000-0000-0000-000002195021', 1000, 'completed', 'tr_2195_b', NULL, false),
    ('00000000-0000-0000-0000-000002195022', 1000, 'pending', NULL, NULL, NULL);
  RAISE NOTICE 'PASS MYK9-2195 checked, unchecked and unrecorded rows are accepted';

  -- 2. Shapes that would blur "matched" and "not checked" are refused.
  PERFORM pg_temp.expect_refusal(
    $sql$INSERT INTO public.show_payouts
      (show_id, amount_cents, status, stripe_transfer_id, paid_stripe_account_id, paid_destination_checked)
      VALUES ('00000000-0000-0000-0000-000002195023', 1000, 'completed', 'tr_x', NULL, true)$sql$,
    '23514', 'checked with no account');
  PERFORM pg_temp.expect_refusal(
    $sql$INSERT INTO public.show_payouts
      (show_id, amount_cents, status, stripe_transfer_id, paid_stripe_account_id, paid_destination_checked)
      VALUES ('00000000-0000-0000-0000-000002195023', 1000, 'completed', 'tr_x', 'acct_2195', false)$sql$,
    '23514', 'an account marked not checked');
  PERFORM pg_temp.expect_refusal(
    $sql$INSERT INTO public.show_payouts
      (show_id, amount_cents, status, stripe_transfer_id, paid_stripe_account_id, paid_destination_checked)
      VALUES ('00000000-0000-0000-0000-000002195023', 1000, 'completed', 'tr_x', 'acct_2195', NULL)$sql$,
    '23514', 'an account with no checked flag');
  PERFORM pg_temp.expect_refusal(
    $sql$INSERT INTO public.show_payouts
      (show_id, amount_cents, status, stripe_transfer_id, paid_stripe_account_id, paid_destination_checked)
      VALUES ('00000000-0000-0000-0000-000002195023', 1000, 'completed', 'tr_x', '  ', true)$sql$,
    '23514', 'a blank account');
  PERFORM pg_temp.expect_refusal(
    $sql$INSERT INTO public.show_payouts
      (show_id, amount_cents, status, stripe_transfer_id, paid_stripe_account_id, paid_destination_checked)
      VALUES ('00000000-0000-0000-0000-000002195024', 1000, 'completed', NULL, NULL, false)$sql$,
    '23514', 'a destination recorded with no transfer');

  -- 3. The columns carry show_payouts' grants: a client session can read them
  --    and cannot write them; anon cannot read them.
  IF NOT has_column_privilege('authenticated', 'public.show_payouts', 'paid_stripe_account_id', 'SELECT')
     OR has_column_privilege('authenticated', 'public.show_payouts', 'paid_stripe_account_id', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.show_payouts', 'paid_destination_checked', 'UPDATE')
     OR has_column_privilege('anon', 'public.show_payouts', 'paid_stripe_account_id', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL MYK9-2195: the paid destination columns have the wrong grants';
  END IF;
  RAISE NOTICE 'PASS MYK9-2195 paid destination columns: authenticated reads, no client writes';
END;
$$;

ROLLBACK;
