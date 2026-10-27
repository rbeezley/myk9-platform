-- MYK9-1407 behavioral contract for
-- 20261027003700_myk9_1407_comp_keeps_paid_status.sql.
--
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/myk9_1407_comp_keeps_paid_status_test.sql
--
-- Entries of one enrollment:
--   P  paid (cash)      -> comp refused (MKCMP), row keeps paid, not comped
--   R  refunded         -> comp refused (MKCMP), row keeps refunded
--   N  pending          -> comp: waived, remembers pending; undo: pending
--   W  waived, uncomped -> comp: remembers waived; undo restores waived
--   F  pending, comped, then money makes it paid -> undo keeps paid
--   G  inserted comped = true and paid             -> undo keeps paid
--      (id suffix 9, so it sorts first in the snapshot)
-- Also: a caller cannot plant the remembered status (UPDATE or INSERT), an
-- older client that still sends payment_status gets the trigger's answer, and
-- no client role can read the column. Every fixture rolls back.

BEGIN;

-- --- catalog ----------------------------------------------------------------
DO $$
BEGIN
  IF has_column_privilege('anon', 'public.entries', 'payment_status_before_comp', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon can read entries.payment_status_before_comp';
  END IF;
  IF has_column_privilege('authenticated', 'public.entries', 'payment_status_before_comp', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated can read entries.payment_status_before_comp (no reader needs it)';
  END IF;
  RAISE NOTICE 'PASS entries.payment_status_before_comp is readable by neither anon nor authenticated';

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.entries'::regclass
                    AND tgname = 'trg_entries_comp_payment_status' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'FAIL trg_entries_comp_payment_status is missing or disabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.entries'::regclass
                    AND tgname = 'trg_entries_comp_payment_status_insert' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'FAIL trg_entries_comp_payment_status_insert is missing or disabled';
  END IF;
  RAISE NOTICE 'PASS the comp payment-status triggers are installed';
END;
$$;

-- --- fixtures ---------------------------------------------------------------
INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001407001', 'MYK9-1407 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES ('00000000-0000-0000-0000-000001407011', 'MYK9-1407 Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000001407001');

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000001407021', '00000000-0000-0000-0000-000001407011',
        'MYK9-1407 Trial', current_date, 'AKC', 'Scent Work', 'America/Chicago');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES ('00000000-0000-0000-0000-000001407053', 'Comp', 'Exhibitor', NULL);

INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method, total_amount)
VALUES ('00000000-0000-0000-0000-000001407061', '00000000-0000-0000-0000-000001407011',
        '00000000-0000-0000-0000-000001407053', 'pending', 'cash', 20000);

INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES
  ('00000000-0000-0000-0000-00000140700a', '00000000-0000-0000-0000-000001407011',
   '00000000-0000-0000-0000-000001407021', '00000000-0000-0000-0000-000001407061',
   'submitted', 'paid', 'cash', 50),
  ('00000000-0000-0000-0000-00000140700b', '00000000-0000-0000-0000-000001407011',
   '00000000-0000-0000-0000-000001407021', '00000000-0000-0000-0000-000001407061',
   'submitted', 'refunded', 'cash', 50),
  ('00000000-0000-0000-0000-00000140700c', '00000000-0000-0000-0000-000001407011',
   '00000000-0000-0000-0000-000001407021', '00000000-0000-0000-0000-000001407061',
   'submitted', 'pending', 'cash', 50),
  ('00000000-0000-0000-0000-00000140700d', '00000000-0000-0000-0000-000001407011',
   '00000000-0000-0000-0000-000001407021', '00000000-0000-0000-0000-000001407061',
   'submitted', 'waived', 'waived', 0);

-- Snapshot: suffix=status/comped/remembered for every fixture entry
-- (a=P, b=R, c=N, d=W, e=inserted, f=F, 9=G).
CREATE FUNCTION pg_temp.myk9_1407_snapshot() RETURNS text
LANGUAGE sql AS $$
  SELECT string_agg(right(e.id::text, 1) || '=' || e.payment_status
                    || '/' || CASE WHEN COALESCE(e.comped, false) THEN 'comped' ELSE 'open' END
                    || '/' || COALESCE(e.payment_status_before_comp, '-'),
                    ' ' ORDER BY right(e.id::text, 1))
    FROM public.entries e
   WHERE e.registration_id = '00000000-0000-0000-0000-000001407061';
$$;

CREATE FUNCTION pg_temp.myk9_1407_expect(p_step text, p_want text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_got text := pg_temp.myk9_1407_snapshot();
BEGIN
  IF v_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'FAIL %: want [%], got [%]', p_step, p_want, v_got;
  END IF;
  RAISE NOTICE 'PASS %: %', p_step, v_got;
END;
$$;

-- Comp an entry and require the MKCMP refusal.
CREATE FUNCTION pg_temp.myk9_1407_expect_refused(p_entry uuid, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    UPDATE public.entries SET comped = true, comped_reason = 'MYK9-1407 fixture'
     WHERE id = p_entry;
  EXCEPTION WHEN SQLSTATE 'MKCMP' THEN
    RAISE NOTICE 'PASS comp on a % entry is refused (MKCMP)', p_label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL comp on a % entry was accepted', p_label;
END;
$$;

SELECT pg_temp.myk9_1407_expect('fixtures',
  'a=paid/open/- b=refunded/open/- c=pending/open/- d=waived/open/-');

-- --- 1. comp on paid and refunded entries is refused -------------------------
SELECT pg_temp.myk9_1407_expect_refused('00000000-0000-0000-0000-00000140700a', 'paid');
SELECT pg_temp.myk9_1407_expect_refused('00000000-0000-0000-0000-00000140700b', 'refunded');
SELECT pg_temp.myk9_1407_expect('paid and refunded keep their status',
  'a=paid/open/- b=refunded/open/- c=pending/open/- d=waived/open/-');

-- --- 2. comp on pending and on an uncomped waived entry --------------------
UPDATE public.entries SET comped = true, comped_reason = 'Judge error'
 WHERE id IN ('00000000-0000-0000-0000-00000140700c', '00000000-0000-0000-0000-00000140700d');
SELECT pg_temp.myk9_1407_expect('comped',
  'a=paid/open/- b=refunded/open/- c=waived/comped/pending d=waived/comped/waived');

-- --- 3. a caller cannot plant the remembered status --------------------------
UPDATE public.entries SET payment_status_before_comp = 'paid'
 WHERE id = '00000000-0000-0000-0000-00000140700c';
SELECT pg_temp.myk9_1407_expect('planted value discarded',
  'a=paid/open/- b=refunded/open/- c=waived/comped/pending d=waived/comped/waived');

-- --- 4. undo restores the pre-comp status ------------------------------------
-- N: a planted value in the undo statement itself is ignored too.
UPDATE public.entries
   SET comped = false, comped_reason = NULL, payment_status_before_comp = 'paid'
 WHERE id = '00000000-0000-0000-0000-00000140700c';
-- W: an older client still sends payment_status = 'pending' on undo.
UPDATE public.entries SET comped = false, comped_reason = NULL, payment_status = 'pending'
 WHERE id = '00000000-0000-0000-0000-00000140700d';
SELECT pg_temp.myk9_1407_expect('undo restores',
  'a=paid/open/- b=refunded/open/- c=pending/open/- d=waived/open/-');

-- --- 5. an older client that sends payment_status on comp --------------------
UPDATE public.entries SET comped = true, comped_reason = 'Judge error', payment_status = 'paid'
 WHERE id = '00000000-0000-0000-0000-00000140700c';
SELECT pg_temp.myk9_1407_expect('client-sent status overridden on comp',
  'a=paid/open/- b=refunded/open/- c=waived/comped/pending d=waived/open/-');

-- --- 6. an INSERT cannot plant the remembered status -------------------------
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee,
                            comped, payment_status_before_comp)
VALUES ('00000000-0000-0000-0000-00000140700e', '00000000-0000-0000-0000-000001407011',
        '00000000-0000-0000-0000-000001407021', '00000000-0000-0000-0000-000001407061',
        'submitted', 'waived', 'waived', 0, true, 'paid');
UPDATE public.entries SET comped = false
 WHERE id = '00000000-0000-0000-0000-00000140700e';
SELECT pg_temp.myk9_1407_expect('insert cannot plant',
  'a=paid/open/- b=refunded/open/- c=waived/comped/pending d=waived/open/- e=pending/open/-');

-- --- 7. money moved a comped row: undo keeps the payment ---------------------
-- F is comped from pending, then a privileged writer (as the enrollment
-- cascade or a service_role webhook would) marks it paid. Undo must not write
-- the remembered 'pending' over the payment, and the column is still cleared.
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-00000140700f', '00000000-0000-0000-0000-000001407011',
        '00000000-0000-0000-0000-000001407021', '00000000-0000-0000-0000-000001407061',
        'submitted', 'pending', 'cash', 50);
UPDATE public.entries SET comped = true, comped_reason = 'Judge error'
 WHERE id = '00000000-0000-0000-0000-00000140700f';
UPDATE public.entries SET payment_status = 'paid'
 WHERE id = '00000000-0000-0000-0000-00000140700f';
SELECT pg_temp.myk9_1407_expect('comped row paid afterwards',
  'a=paid/open/- b=refunded/open/- c=waived/comped/pending d=waived/open/- e=pending/open/- f=paid/comped/pending');
UPDATE public.entries SET comped = false, comped_reason = NULL
 WHERE id = '00000000-0000-0000-0000-00000140700f';
SELECT pg_temp.myk9_1407_expect('undo keeps a payment made after the comp',
  'a=paid/open/- b=refunded/open/- c=waived/comped/pending d=waived/open/- e=pending/open/- f=paid/open/-');

-- --- 8. a row inserted comped and paid: undo keeps the payment ---------------
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee, comped)
VALUES ('00000000-0000-0000-0000-000001407009', '00000000-0000-0000-0000-000001407011',
        '00000000-0000-0000-0000-000001407021', '00000000-0000-0000-0000-000001407061',
        'submitted', 'paid', 'cash', 50, true);
UPDATE public.entries SET comped = false
 WHERE id = '00000000-0000-0000-0000-000001407009';
SELECT pg_temp.myk9_1407_expect('undo keeps an inserted paid status',
  '9=paid/open/- a=paid/open/- b=refunded/open/- c=waived/comped/pending d=waived/open/- e=pending/open/- f=paid/open/-');

ROLLBACK;
