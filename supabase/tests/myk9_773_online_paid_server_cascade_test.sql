-- MYK9-773 follow-up behavioral contract for
-- 20260926124700_myk9_773_online_paid_server_cascade.sql.
--
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/myk9_773_online_paid_server_cascade_test.sql
--
-- "Paid in Full: Online" (public.mark_enrollment_paid_online) runs the same
-- entries cascade as record_enrollment_payment. One $200 enrollment:
--   A  ordinary                                   -> refunded by the enrollment, follows
--   B  refunded on its own (Stripe stamp, 'entry') -> stays refunded
--   C  refunded before the origin existed (NULL)   -> stays refunded
--   D  waived                                     -> untouched
-- Sequence: desk Paid in Full -> B stamped -> enrollment refund -> an outsider
-- is refused -> Paid in Full: Online. Also: EXECUTE grants, that the online
-- call writes no show_payments row and no money column, and that it answers
-- every entry's resulting status. Every fixture rolls back.

BEGIN;

-- --- catalog ----------------------------------------------------------------
DO $$
DECLARE
  v_fn constant text := 'public.mark_enrollment_paid_online(uuid)';
BEGIN
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute mark_enrollment_paid_online';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute mark_enrollment_paid_online';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = v_fn::regprocedure AND a.grantee = 0) THEN
    RAISE EXCEPTION 'FAIL PUBLIC holds EXECUTE on mark_enrollment_paid_online';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn::regprocedure) THEN
    RAISE EXCEPTION 'FAIL mark_enrollment_paid_online is not SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'PASS mark_enrollment_paid_online: authenticated only, SECURITY DEFINER';

  IF has_function_privilege('authenticated',
       'private.cascade_enrollment_entry_payment_status(uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'private.enrollment_payment_answer(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL a client role can execute a private payment helper';
  END IF;
  RAISE NOTICE 'PASS the private cascade/answer helpers are not client-executable';
END;
$$;

-- --- fixtures ---------------------------------------------------------------
INSERT INTO public.roles (id, name, description, is_system)
VALUES ('00000000-0000-0000-0000-0000a7730801', 'secretary', 'MYK9-773 online fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-0000a7730001', 'MYK9-773 Online Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES ('00000000-0000-0000-0000-0000a7730011', 'MYK9-773 Online Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-0000a7730001');

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-0000a7730021', '00000000-0000-0000-0000-0000a7730011',
        'MYK9-773 Online Trial', current_date, 'AKC', 'Scent Work', 'America/Chicago');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-0000a7730051', 'Club', 'Secretary',
   '00000000-0000-0000-0000-0000a7730151'),
  ('00000000-0000-0000-0000-0000a7730052', 'Not', 'Staff',
   '00000000-0000-0000-0000-0000a7730152'),
  ('00000000-0000-0000-0000-0000a7730053', 'Online', 'Exhibitor', NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-0000a7730051', id, '00000000-0000-0000-0000-0000a7730001',
       true, '00000000-0000-0000-0000-0000a7730151'
  FROM public.roles WHERE name = 'secretary';

INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method, total_amount)
VALUES ('00000000-0000-0000-0000-0000a7730061', '00000000-0000-0000-0000-0000a7730011',
        '00000000-0000-0000-0000-0000a7730053', 'pending', 'cash', 20000);

INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES
  ('00000000-0000-0000-0000-0000a773000a', '00000000-0000-0000-0000-0000a7730011',
   '00000000-0000-0000-0000-0000a7730021', '00000000-0000-0000-0000-0000a7730061',
   'submitted', 'pending', 'cash', 50),
  ('00000000-0000-0000-0000-0000a773000b', '00000000-0000-0000-0000-0000a7730011',
   '00000000-0000-0000-0000-0000a7730021', '00000000-0000-0000-0000-0000a7730061',
   'submitted', 'pending', 'cash', 50),
  ('00000000-0000-0000-0000-0000a773000d', '00000000-0000-0000-0000-0000a7730011',
   '00000000-0000-0000-0000-0000a7730021', '00000000-0000-0000-0000-0000a7730061',
   'submitted', 'waived', 'waived', 0);

-- C: refunded before refund_origin existed (only a trigger-off write can hold
-- refunded + NULL now, which is what every pre-migration refunded row is).
ALTER TABLE public.entries DISABLE TRIGGER trg_entries_refund_origin;
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-0000a773000c', '00000000-0000-0000-0000-0000a7730011',
        '00000000-0000-0000-0000-0000a7730021', '00000000-0000-0000-0000-0000a7730061',
        'submitted', 'refunded', 'cash', 50);
ALTER TABLE public.entries ENABLE TRIGGER trg_entries_refund_origin;

CREATE TEMP TABLE myk9_773o_steps (step text, got text);
GRANT ALL ON myk9_773o_steps TO authenticated;

-- Every entry as status(origin), by id suffix. SECURITY DEFINER because no
-- client role may read refund_origin.
CREATE FUNCTION pg_temp.myk9_773o_snapshot() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT string_agg(right(e.id::text, 1) || '=' || e.payment_status
                    || '(' || COALESCE(e.refund_origin, '-') || ')', ' ' ORDER BY right(e.id::text, 1))
    FROM public.entries e
   WHERE e.registration_id = '00000000-0000-0000-0000-0000a7730061';
$$;

-- The enrollment's money figures and its ledger row count, in one string.
CREATE FUNCTION pg_temp.myk9_773o_money() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.payment_status || ' paid=' || COALESCE(e.paid_amount::text, '-')
         || ' refund=' || COALESCE(e.refund_amount::text, '-')
         || ' ledger=' || (SELECT count(*) FROM public.show_payments sp
                            WHERE sp.enrollment_id = e.id)::text
    FROM public.enrollments e
   WHERE e.id = '00000000-0000-0000-0000-0000a7730061';
$$;

CREATE FUNCTION pg_temp.myk9_773o_expect(p_step text, p_want text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_got text := pg_temp.myk9_773o_snapshot();
BEGIN
  IF v_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'FAIL %: want [%], got [%]', p_step, p_want, v_got;
  END IF;
  RAISE NOTICE 'PASS %: %', p_step, v_got;
END;
$$;

-- --- 1. desk Paid in Full, B refunded on its own, the enrollment refunded ---
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000a7730151', true);
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-0000a7730061', 'payment', NULL, 'check', NULL, '3001', NULL);

RESET ROLE;
SET LOCAL ROLE service_role;
-- An entry-level refund stamp, as stripe-refund-entry writes it.
UPDATE public.entries
   SET refund_amount = 50, refunded_at = now(), refund_notes = 'Stripe (fixture)',
       payment_status = 'refunded'
 WHERE id = '00000000-0000-0000-0000-0000a773000b';

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000a7730151', true);
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-0000a7730061', 'refund', 200, 'check', NULL, NULL, 'Returned');
SELECT pg_temp.myk9_773o_expect('enrollment refunded',
  'a=refunded(enrollment) b=refunded(entry) c=refunded(-) d=waived(-)');

INSERT INTO myk9_773o_steps SELECT 'money before', pg_temp.myk9_773o_money();

-- --- 2. an outsider is refused, and changes nothing -------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000a7730152', true);
DO $$
BEGIN
  PERFORM public.mark_enrollment_paid_online('00000000-0000-0000-0000-0000a7730061');
  RAISE EXCEPTION 'FAIL an outsider marked the enrollment paid online';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS an outsider is refused (42501)';
END;
$$;
SELECT pg_temp.myk9_773o_expect('outsider changed nothing',
  'a=refunded(enrollment) b=refunded(entry) c=refunded(-) d=waived(-)');

-- --- 3. Paid in Full: Online ------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000a7730151', true);
INSERT INTO myk9_773o_steps
SELECT 'answer', (
  SELECT (r->>'payment_status') || ' ' || string_agg(
           right(x->>'id', 1) || '=' || (x->>'payment_status'), ' ' ORDER BY right(x->>'id', 1))
    FROM (SELECT public.mark_enrollment_paid_online('00000000-0000-0000-0000-0000a7730061') AS r) q,
         jsonb_array_elements(q.r -> 'entries') x
   GROUP BY r->>'payment_status');

SELECT pg_temp.myk9_773o_expect('paid in full online after the refund',
  'a=paid(-) b=refunded(entry) c=refunded(-) d=waived(-)');

INSERT INTO myk9_773o_steps SELECT 'money after', pg_temp.myk9_773o_money();

RESET ROLE;

DO $$
DECLARE
  v_answer text;
  v_before text;
  v_after text;
BEGIN
  SELECT got INTO v_answer FROM myk9_773o_steps WHERE step = 'answer';
  IF v_answer IS DISTINCT FROM 'paid_online a=paid b=refunded c=refunded d=waived' THEN
    RAISE EXCEPTION 'FAIL the online answer does not carry the enrollment and every entry: %', v_answer;
  END IF;
  RAISE NOTICE 'PASS the online answer carries every entry''s resulting status: %', v_answer;

  SELECT got INTO v_before FROM myk9_773o_steps WHERE step = 'money before';
  SELECT got INTO v_after FROM myk9_773o_steps WHERE step = 'money after';
  -- Only the status moves: no money column, no cash-box ledger row.
  IF v_after IS DISTINCT FROM replace(v_before, 'refunded paid=', 'paid_online paid=') THEN
    RAISE EXCEPTION 'FAIL the online mark moved money: before [%], after [%]', v_before, v_after;
  END IF;
  RAISE NOTICE 'PASS the online mark moves only the status: [%] -> [%]', v_before, v_after;

  IF COALESCE(current_setting('myk9.entry_refund_origin', true), '') <> '' THEN
    RAISE EXCEPTION 'FAIL the enrollment-refund flag outlived the cascade';
  END IF;
  RAISE NOTICE 'PASS the enrollment-refund flag is clear after the online cascade';
END;
$$;

ROLLBACK;
