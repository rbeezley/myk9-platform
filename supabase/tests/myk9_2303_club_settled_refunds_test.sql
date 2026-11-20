-- MYK9-2303 behavioral contract for 20261121093700_myk9_2303_club_settled_refunds.sql.
--
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/myk9_2303_club_settled_refunds_test.sql
--
-- Covers: grants (anon nothing, authenticated SELECT only, no TRUNCATE), RESTRICT FKs,
-- who may record (the show's secretary, its club admin, a site admin; not another club's
-- admin, not an exhibitor), the card-paid and payout gates (absent, pending, processing,
-- failed refused; completed allowed), the cap ($40 entry, $15 Stripe refund, $25 club max,
-- earlier club rows, a reversal restoring the balance), a second reversal refused, the
-- retry key writing once, a direct UPDATE of club_refunded_amount refused, a sibling entry
-- of the same checkout untouched, and refund_amount / show_payouts unchanged by a write.
-- Every fixture rolls back.

BEGIN;

-- Run a statement and require it to fail with the stable code as its message.
CREATE FUNCTION public.t2303_expect(p_sql text, p_code text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = p_code AND SQLSTATE = 'P0001' THEN
      RAISE NOTICE 'PASS refused with %', p_code;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL expected % but got [%] %', p_code, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL expected % but the statement succeeded: %', p_code, p_sql;
END;
$$;

-- --- catalog ----------------------------------------------------------------
DO $$
DECLARE
  v_acl text;
BEGIN
  SELECT array_to_string(relacl, ',') INTO v_acl
    FROM pg_class WHERE oid = 'public.club_settled_refunds'::regclass;
  IF v_acl LIKE '%anon=%' THEN
    RAISE EXCEPTION 'FAIL anon holds privileges on club_settled_refunds: %', v_acl;
  END IF;
  IF (SELECT count(*) FROM unnest(
        (SELECT relacl FROM pg_class WHERE oid = 'public.club_settled_refunds'::regclass)) AS item
       WHERE item::text LIKE 'authenticated=r/%') <> 1 THEN
    RAISE EXCEPTION 'FAIL authenticated should hold exactly SELECT (r only, no TRUNCATE): %', v_acl;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = 'public.club_settled_refunds'::regclass AND a.attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL club_settled_refunds carries column-level grants';
  END IF;
  RAISE NOTICE 'PASS club_settled_refunds grants: anon none, authenticated SELECT only';

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.club_settled_refunds'::regclass) THEN
    RAISE EXCEPTION 'FAIL RLS is not enabled on club_settled_refunds';
  END IF;
  RAISE NOTICE 'PASS RLS enabled';

  IF (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'public.club_settled_refunds'::regclass
         AND contype = 'f' AND confdeltype = 'r') <> 3 THEN
    RAISE EXCEPTION 'FAIL FKs (show, entry, reverses_id) must all be ON DELETE RESTRICT';
  END IF;
  RAISE NOTICE 'PASS FKs are ON DELETE RESTRICT';

  IF has_function_privilege('anon',
       'public.record_club_settled_refund(uuid, numeric, date, text, text, text, uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.reverse_club_settled_refund(uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute a club settled refund RPC';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.record_club_settled_refund(uuid, numeric, date, text, text, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.reverse_club_settled_refund(uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute a club settled refund RPC';
  END IF;
  RAISE NOTICE 'PASS RPC execute: anon none, authenticated yes';
END;
$$;

-- --- fixtures ---------------------------------------------------------------
INSERT INTO public.roles (id, name, description, is_system)
VALUES
  ('00000000-0000-0000-0000-000000230801', 'secretary', 'MYK9-2303 fixture', true),
  ('00000000-0000-0000-0000-000000230802', 'club_admin', 'MYK9-2303 fixture', true),
  ('00000000-0000-0000-0000-000000230803', 'site_admin', 'MYK9-2303 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000230001', 'MYK9-2303 Club A'),
  ('00000000-0000-0000-0000-000000230002', 'MYK9-2303 Club B');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES ('00000000-0000-0000-0000-000000230011', 'MYK9-2303 Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000000230001');

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000000230021', '00000000-0000-0000-0000-000000230011',
        'MYK9-2303 Trial', current_date, 'AKC', 'Scent Work', 'America/Chicago');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000230051', 'Club A', 'Secretary',
   '00000000-0000-0000-0000-000000230151'),
  ('00000000-0000-0000-0000-000000230052', 'Club A', 'Admin',
   '00000000-0000-0000-0000-000000230152'),
  ('00000000-0000-0000-0000-000000230053', 'Site', 'Admin',
   '00000000-0000-0000-0000-000000230153'),
  ('00000000-0000-0000-0000-000000230054', 'Club B', 'Admin',
   '00000000-0000-0000-0000-000000230154'),
  ('00000000-0000-0000-0000-000000230055', 'Plain', 'Exhibitor',
   '00000000-0000-0000-0000-000000230155');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000230051', id, '00000000-0000-0000-0000-000000230001',
       true, '00000000-0000-0000-0000-000000230151'
  FROM public.roles WHERE name = 'secretary';
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000230052', id, '00000000-0000-0000-0000-000000230001',
       true, '00000000-0000-0000-0000-000000230152'
  FROM public.roles WHERE name = 'club_admin';
INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000230053', id, true, '00000000-0000-0000-0000-000000230153'
  FROM public.roles WHERE name = 'site_admin';
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000230054', id, '00000000-0000-0000-0000-000000230002',
       true, '00000000-0000-0000-0000-000000230154'
  FROM public.roles WHERE name = 'club_admin';

-- E1 and E2 are two $40 class entries of ONE card checkout (same payment intent).
-- E1 already carries a $15 Stripe partial refund, so the club may settle $25 at most.
-- E3 was paid in cash; E4 claims 'online' but has no payment intent.
-- Written as service_role: entries_protect_payment_fields_insert refuses a paid-online
-- entry or a payment intent from any other writer.
SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, show_id, trial_id, entry_status, payment_status,
                            payment_method, entry_fee, stripe_payment_intent_id, refund_amount)
VALUES
  ('00000000-0000-0000-0000-000000230091', '00000000-0000-0000-0000-000000230011',
   '00000000-0000-0000-0000-000000230021', 'submitted', 'paid', 'online', 40, 'pi_2303_a', 15),
  ('00000000-0000-0000-0000-000000230092', '00000000-0000-0000-0000-000000230011',
   '00000000-0000-0000-0000-000000230021', 'submitted', 'paid', 'online', 40, 'pi_2303_a', NULL),
  ('00000000-0000-0000-0000-000000230093', '00000000-0000-0000-0000-000000230011',
   '00000000-0000-0000-0000-000000230021', 'submitted', 'paid', 'cash', 40, NULL, NULL),
  ('00000000-0000-0000-0000-000000230094', '00000000-0000-0000-0000-000000230011',
   '00000000-0000-0000-0000-000000230021', 'submitted', 'paid', 'online', 40, NULL, NULL);
RESET ROLE;

-- --- no payout yet: refused for the secretary -------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230151', true);

SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       10, current_date, 'check', '1001', NULL, NULL)$q$,
  'payout_not_completed');

RESET ROLE;
INSERT INTO public.show_payouts (id, show_id, amount_cents, status)
VALUES ('00000000-0000-0000-0000-000000230061', '00000000-0000-0000-0000-000000230011',
        3500, 'pending');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230151', true);

SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       10, current_date, 'check', '1001', NULL, NULL)$q$,
  'payout_not_completed');

RESET ROLE;
UPDATE public.show_payouts SET status = 'processing'
 WHERE id = '00000000-0000-0000-0000-000000230061';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230151', true);

SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       10, current_date, 'check', '1001', NULL, NULL)$q$,
  'payout_not_completed');

RESET ROLE;
UPDATE public.show_payouts SET status = 'failed', failure_reason = 'fixture'
 WHERE id = '00000000-0000-0000-0000-000000230061';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230151', true);

SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       10, current_date, 'check', '1001', NULL, NULL)$q$,
  'payout_not_completed');

-- Nothing was written by any refusal.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.club_settled_refunds) THEN
    RAISE EXCEPTION 'FAIL a refused record left a ledger row';
  END IF;
  RAISE NOTICE 'PASS absent, pending, processing and failed payouts write nothing';
END;
$$;

-- --- the payout completes ---------------------------------------------------
RESET ROLE;
UPDATE public.show_payouts SET status = 'completed', completed_at = now(), failure_reason = NULL
 WHERE id = '00000000-0000-0000-0000-000000230061';
SET LOCAL ROLE authenticated;

-- --- who may record ---------------------------------------------------------
-- An exhibitor and another club's admin are refused.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230155', true);
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       10, current_date, 'check', '1001', NULL, NULL)$q$,
  'not_authorized');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230154', true);
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       10, current_date, 'check', '1001', NULL, NULL)$q$,
  'not_authorized');

-- Neither can read the ledger (nothing exists yet; re-checked below with rows).

-- --- gates for the show's secretary -----------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230151', true);

SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230093',
       10, current_date, 'check', NULL, NULL, NULL)$q$,
  'not_card_paid');
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230094',
       10, current_date, 'check', NULL, NULL, NULL)$q$,
  'not_card_paid');
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230999',
       10, current_date, 'check', NULL, NULL, NULL)$q$,
  'entry_not_found');
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       0, current_date, 'check', NULL, NULL, NULL)$q$,
  'invalid_amount');
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       -5, current_date, 'check', NULL, NULL, NULL)$q$,
  'invalid_amount');
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       1.005, current_date, 'check', NULL, NULL, NULL)$q$,
  'invalid_amount');
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       10, current_date, 'venmo', NULL, NULL, NULL)$q$,
  'invalid_method');

-- Cap: $40 entry, $15 Stripe refund, so $25 is the most. $25.01 is refused.
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       25.01, current_date, 'check', NULL, NULL, NULL)$q$,
  'amount_exceeds_balance');

-- --- record: the secretary, partial, with a retry key ------------------------
DO $$
DECLARE
  v_first jsonb; v_retry jsonb;
BEGIN
  v_first := public.record_club_settled_refund(
    '00000000-0000-0000-0000-000000230091', 10, current_date, 'check', '1042', 'refund by check',
    '00000000-0000-0000-0000-000000230d01');
  IF (v_first->>'amount')::numeric <> 10
     OR (v_first->>'club_refunded_amount')::numeric <> 10
     OR v_first->>'method' <> 'check'
     OR v_first->>'reference' <> '1042'
     OR v_first->>'recorded_by' <> '00000000-0000-0000-0000-000000230051' THEN
    RAISE EXCEPTION 'FAIL first record returned %', v_first;
  END IF;
  RAISE NOTICE 'PASS the secretary recorded $10 (recorded_by is her person id)';

  -- The same key again writes nothing and returns the same row.
  v_retry := public.record_club_settled_refund(
    '00000000-0000-0000-0000-000000230091', 10, current_date, 'check', '1042', 'refund by check',
    '00000000-0000-0000-0000-000000230d01');
  IF v_retry->>'id' <> v_first->>'id'
     OR (SELECT count(*) FROM public.club_settled_refunds) <> 1
     OR (SELECT club_refunded_amount FROM public.entries
          WHERE id = '00000000-0000-0000-0000-000000230091') <> 10 THEN
    RAISE EXCEPTION 'FAIL the retry key wrote twice: %', v_retry;
  END IF;
  RAISE NOTICE 'PASS the retry key writes once and returns the original row';
END;
$$;

-- The same key for another entry is a conflict.
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230092',
       5, current_date, 'cash', NULL, NULL, '00000000-0000-0000-0000-000000230d01')$q$,
  'retry_key_conflict');

-- The sibling entry of the same checkout is untouched, and so are the Stripe columns
-- and the payout.
RESET ROLE;
DO $$
BEGIN
  IF (SELECT club_refunded_amount FROM public.entries
       WHERE id = '00000000-0000-0000-0000-000000230092') <> 0
     OR EXISTS (SELECT 1 FROM public.club_settled_refunds
                 WHERE entry_id = '00000000-0000-0000-0000-000000230092') THEN
    RAISE EXCEPTION 'FAIL recording on one entry touched its sibling in the same checkout';
  END IF;
  RAISE NOTICE 'PASS the sibling entry of the same checkout is untouched';

  IF (SELECT refund_amount FROM public.entries
       WHERE id = '00000000-0000-0000-0000-000000230091') <> 15
     OR (SELECT refund_notes FROM public.entries
          WHERE id = '00000000-0000-0000-0000-000000230091') IS NOT NULL
     OR (SELECT refunded_at FROM public.entries
          WHERE id = '00000000-0000-0000-0000-000000230091') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the Stripe refund columns changed';
  END IF;
  IF (SELECT status || ':' || amount_cents FROM public.show_payouts
       WHERE id = '00000000-0000-0000-0000-000000230061') <> 'completed:3500' THEN
    RAISE EXCEPTION 'FAIL show_payouts changed';
  END IF;
  RAISE NOTICE 'PASS refund_amount and show_payouts are unchanged after a write';
END;
$$;

-- --- the cap counts earlier club rows, the club admin may record --------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230152', true);

-- $15 of $25 remains.
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       15.01, current_date, 'cash', NULL, NULL, NULL)$q$,
  'amount_exceeds_balance');

DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.record_club_settled_refund(
    '00000000-0000-0000-0000-000000230091', 15, current_date, 'cash', NULL, NULL, NULL);
  IF (v->>'club_refunded_amount')::numeric <> 25
     OR v->>'recorded_by' <> '00000000-0000-0000-0000-000000230052' THEN
    RAISE EXCEPTION 'FAIL club admin record returned %', v;
  END IF;
  RAISE NOTICE 'PASS the show''s club admin recorded the remaining $15';
END;
$$;

-- Fully settled: even one cent more is refused.
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       0.01, current_date, 'cash', NULL, NULL, NULL)$q$,
  'amount_exceeds_balance');

-- --- reversal restores the balance; a second reversal is refused -------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230153', true);

-- A site admin reverses the $15 cash row.
DO $$
DECLARE
  v_orig uuid; v jsonb;
BEGIN
  SELECT id INTO v_orig FROM public.club_settled_refunds
   WHERE entry_id = '00000000-0000-0000-0000-000000230091' AND method = 'cash';
  v := public.reverse_club_settled_refund(
    v_orig, 'wrong exhibitor', '00000000-0000-0000-0000-000000230d02');
  IF (v->>'amount')::numeric <> -15
     OR v->>'reverses_id' <> v_orig::text
     OR (v->>'club_refunded_amount')::numeric <> 10
     OR v->>'paid_on' IS NOT NULL OR v->>'method' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL reversal returned %', v;
  END IF;
  RAISE NOTICE 'PASS a site admin reversed the $15 row; the entry total is back to $10';

  -- The same reversal key again returns the same row.
  IF (public.reverse_club_settled_refund(
        v_orig, 'wrong exhibitor', '00000000-0000-0000-0000-000000230d02'))->>'id' <> v->>'id'
     OR (SELECT count(*) FROM public.club_settled_refunds WHERE reverses_id = v_orig) <> 1 THEN
    RAISE EXCEPTION 'FAIL the reversal retry key wrote twice';
  END IF;
  RAISE NOTICE 'PASS the reversal retry key writes once';
END;
$$;

DO $$
DECLARE
  v_orig uuid; v_rev uuid;
BEGIN
  SELECT id INTO v_orig FROM public.club_settled_refunds
   WHERE entry_id = '00000000-0000-0000-0000-000000230091' AND method = 'cash';
  SELECT id INTO v_rev FROM public.club_settled_refunds WHERE reverses_id = v_orig;

  -- A second reversal (new key) of the same row is refused.
  PERFORM public.t2303_expect(
    format($q$SELECT public.reverse_club_settled_refund(%L, NULL, NULL)$q$, v_orig),
    'already_reversed');
  -- A reversal cannot be reversed.
  PERFORM public.t2303_expect(
    format($q$SELECT public.reverse_club_settled_refund(%L, NULL, NULL)$q$, v_rev),
    'not_reversible');
  -- An unknown row cannot be reversed.
  PERFORM public.t2303_expect(
    $q$SELECT public.reverse_club_settled_refund('00000000-0000-0000-0000-000000230998', NULL, NULL)$q$,
    'not_reversible');
  -- A record key cannot be reused as a reversal key.
  PERFORM public.t2303_expect(
    format($q$SELECT public.reverse_club_settled_refund(%L, NULL, '00000000-0000-0000-0000-000000230d01')$q$,
           (SELECT id FROM public.club_settled_refunds
             WHERE client_refund_id = '00000000-0000-0000-0000-000000230d01')),
    'retry_key_conflict');
END;
$$;

-- The reversal restored the $15: recording $15 works again, $15.01 does not.
SELECT public.t2303_expect(
  $q$SELECT public.record_club_settled_refund('00000000-0000-0000-0000-000000230091',
       15.01, current_date, 'other', NULL, NULL, NULL)$q$,
  'amount_exceeds_balance');
SELECT public.record_club_settled_refund(
  '00000000-0000-0000-0000-000000230091', 15, current_date, 'other', NULL, 'right one', NULL);

DO $$
BEGIN
  IF (SELECT club_refunded_amount FROM public.entries
       WHERE id = '00000000-0000-0000-0000-000000230091') <> 25
     OR (SELECT sum(amount) FROM public.club_settled_refunds
          WHERE entry_id = '00000000-0000-0000-0000-000000230091') <> 25 THEN
    RAISE EXCEPTION 'FAIL the cached total does not equal the ledger net';
  END IF;
  RAISE NOTICE 'PASS a reversal restored the balance and the cached total equals the ledger net';
END;
$$;

-- --- reads: officials see rows, an unrelated admin and an exhibitor see none ---
DO $$
BEGIN
  IF (SELECT count(*) FROM public.club_settled_refunds) <> 4 THEN
    RAISE EXCEPTION 'FAIL a site admin should read all four rows';
  END IF;
  RAISE NOTICE 'PASS a site admin reads the ledger';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230151', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.club_settled_refunds) <> 4 THEN
    RAISE EXCEPTION 'FAIL the show''s secretary cannot read its ledger';
  END IF;
  RAISE NOTICE 'PASS the show''s secretary reads the ledger';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230152', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.club_settled_refunds) <> 4 THEN
    RAISE EXCEPTION 'FAIL the show''s club admin cannot read its ledger';
  END IF;
  RAISE NOTICE 'PASS the show''s club admin reads the ledger';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230154', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.club_settled_refunds) THEN
    RAISE EXCEPTION 'FAIL another club''s admin can read the ledger';
  END IF;
  RAISE NOTICE 'PASS another club''s admin reads no ledger rows';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230155', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.club_settled_refunds) THEN
    RAISE EXCEPTION 'FAIL an exhibitor can read the ledger';
  END IF;
  RAISE NOTICE 'PASS an exhibitor reads no ledger rows';
END;
$$;

-- --- direct writes are refused ----------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000230151', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.club_settled_refunds (show_id, entry_id, amount, paid_on, method)
    VALUES ('00000000-0000-0000-0000-000000230011', '00000000-0000-0000-0000-000000230092',
            5, current_date, 'cash');
    RAISE EXCEPTION 'FAIL a secretary inserted a ledger row directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS a direct ledger INSERT is refused';
  END;
  BEGIN
    UPDATE public.club_settled_refunds SET amount = 1;
    RAISE EXCEPTION 'FAIL a secretary updated a ledger row directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS a direct ledger UPDATE is refused';
  END;
  BEGIN
    DELETE FROM public.club_settled_refunds;
    RAISE EXCEPTION 'FAIL a secretary deleted a ledger row directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS a direct ledger DELETE is refused';
  END;
END;
$$;

-- A direct UPDATE of the cached total by an authenticated user is refused. Either the
-- guard trigger raises, or the entries RLS policy hides the row (zero rows changed);
-- in neither case may the total move. The guard itself is proven below as the table
-- owner, which no RLS policy can mask.
DO $$
DECLARE
  v_rows int;
BEGIN
  BEGIN
    UPDATE public.entries SET club_refunded_amount = 0
     WHERE id = '00000000-0000-0000-0000-000000230091';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'FAIL a secretary rewrote club_refunded_amount directly';
    END IF;
    RAISE NOTICE 'PASS the entries policy hides the row from a direct UPDATE (guard proven below)';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
      RAISE NOTICE 'PASS a direct UPDATE of club_refunded_amount is refused';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS a direct UPDATE of club_refunded_amount is refused (privilege)';
  END;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  BEGIN
    UPDATE public.entries SET club_refunded_amount = 999
     WHERE id = '00000000-0000-0000-0000-000000230092';
    RAISE EXCEPTION 'FAIL an UPDATE of club_refunded_amount off its ledger succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS the guard refuses an UPDATE of club_refunded_amount off its ledger';
  END;
  -- Codex #4292: a caller-settable setting is no way through. The old write flag,
  -- set by hand, still does not let the total leave its ledger.
  BEGIN
    PERFORM set_config('myk9.club_settled_refund_write', 'on', true);
    UPDATE public.entries SET club_refunded_amount = 999
     WHERE id = '00000000-0000-0000-0000-000000230091';
    RAISE EXCEPTION 'FAIL a flagged direct UPDATE of club_refunded_amount succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS a flagged direct UPDATE of club_refunded_amount is still refused';
  END;
  BEGIN
    INSERT INTO public.entries (show_id, trial_id, entry_status, payment_status,
                                payment_method, entry_fee, club_refunded_amount)
    VALUES ('00000000-0000-0000-0000-000000230011', '00000000-0000-0000-0000-000000230021',
            'submitted', 'paid', 'cash', 40, 5);
    RAISE EXCEPTION 'FAIL an INSERT planted club_refunded_amount';
  EXCEPTION WHEN insufficient_privilege THEN
    -- A cash entry, so only this guard (not the paid-online insert guard) can refuse it.
    IF SQLERRM NOT LIKE 'club_refunded_amount must equal%' THEN
      RAISE EXCEPTION 'FAIL the planted INSERT was refused by another guard: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS the guard refuses an INSERT with a non-zero club_refunded_amount';
  END;
  IF (SELECT club_refunded_amount FROM public.entries
       WHERE id = '00000000-0000-0000-0000-000000230091') <> 25 THEN
    RAISE EXCEPTION 'FAIL the cached total moved';
  END IF;
END;
$$;

-- --- service role is held to the same ledger invariant; shape CHECKs hold ------
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  -- Rewriting the value the ledger already sums to (25) is allowed ...
  UPDATE public.entries SET club_refunded_amount = 25
   WHERE id = '00000000-0000-0000-0000-000000230091';
  RAISE NOTICE 'PASS service_role may rewrite club_refunded_amount to its ledger sum';
  -- ... any other value is not.
  BEGIN
    UPDATE public.entries SET club_refunded_amount = 30
     WHERE id = '00000000-0000-0000-0000-000000230091';
    RAISE EXCEPTION 'FAIL service_role moved club_refunded_amount off its ledger';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS service_role cannot move club_refunded_amount off its ledger';
  END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  -- A payment must carry paid_on and method.
  BEGIN
    INSERT INTO public.club_settled_refunds (show_id, entry_id, amount)
    VALUES ('00000000-0000-0000-0000-000000230011', '00000000-0000-0000-0000-000000230092', 5);
    RAISE EXCEPTION 'FAIL a payment without paid_on and method was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS a payment needs paid_on and method';
  END;
  -- A reversal must be negative and name its original.
  BEGIN
    INSERT INTO public.club_settled_refunds (show_id, entry_id, amount)
    VALUES ('00000000-0000-0000-0000-000000230011', '00000000-0000-0000-0000-000000230092', -5);
    RAISE EXCEPTION 'FAIL a reversal without reverses_id was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS a negative row must name reverses_id';
  END;
  -- Zero is never valid.
  BEGIN
    INSERT INTO public.club_settled_refunds (show_id, entry_id, amount, paid_on, method)
    VALUES ('00000000-0000-0000-0000-000000230011', '00000000-0000-0000-0000-000000230092',
            0, current_date, 'cash');
    RAISE EXCEPTION 'FAIL a zero amount was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS a zero amount is refused';
  END;
  -- An unknown method is refused.
  BEGIN
    INSERT INTO public.club_settled_refunds (show_id, entry_id, amount, paid_on, method)
    VALUES ('00000000-0000-0000-0000-000000230011', '00000000-0000-0000-0000-000000230092',
            5, current_date, 'venmo');
    RAISE EXCEPTION 'FAIL an unknown method was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS an unknown method is refused';
  END;
  -- Append-only even for the table owner.
  BEGIN
    UPDATE public.club_settled_refunds SET note = 'edited';
    RAISE EXCEPTION 'FAIL a ledger row was edited';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS ledger rows cannot be edited';
  END;
END;
$$;

ROLLBACK;
