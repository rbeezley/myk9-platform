-- MYK9-773 behavioral contract for
-- 20260926024300_myk9_773_inherited_refund_follows_payment.sql.
--
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/myk9_773_inherited_refund_follows_payment_test.sql
--
-- One $200 enrollment with six entries:
--   A  ordinary                        -> refunded BY THE ENROLLMENT, must follow
--   B  refunded on its own (Stripe stamp, origin 'entry')    -> stays refunded
--   C  refunded before the origin existed (NULL)             -> stays refunded
--   D  waived                                                -> untouched
--   F  refunded by the enrollment, THEN stamped by an entry-level refund
--                                                            -> stays refunded
--   G  origin 'enrollment' but carrying an entry-level refund stamp, a state
--      only a trigger-off write can produce  -> stays refunded (the cascade's
--      own refund_amount / refunded_at guard, independent of the trigger)
-- Sequence: Paid in Full -> B stamped -> enrollment refund -> F stamped ->
-- Paid in Full -> enrollment refund -> Payment Due. Also: the column's grants,
-- that a caller cannot write the origin, and that the RPC answers every entry's
-- resulting status. Every fixture rolls back.

BEGIN;

-- --- catalog ----------------------------------------------------------------
DO $$
BEGIN
  IF has_column_privilege('anon', 'public.entries', 'refund_origin', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon can read entries.refund_origin';
  END IF;
  IF has_column_privilege('authenticated', 'public.entries', 'refund_origin', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated can read entries.refund_origin (no reader needs it)';
  END IF;
  RAISE NOTICE 'PASS entries.refund_origin is readable by neither anon nor authenticated';

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.entries'::regclass
                    AND tgname = 'trg_entries_refund_origin' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'FAIL trg_entries_refund_origin is missing or disabled';
  END IF;
  RAISE NOTICE 'PASS trg_entries_refund_origin is installed';
END;
$$;

-- --- fixtures ---------------------------------------------------------------
INSERT INTO public.roles (id, name, description, is_system)
VALUES ('00000000-0000-0000-0000-000000773801', 'secretary', 'MYK9-773 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000773001', 'MYK9-773 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES ('00000000-0000-0000-0000-000000773011', 'MYK9-773 Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000000773001');

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000000773021', '00000000-0000-0000-0000-000000773011',
        'MYK9-773 Trial', current_date, 'AKC', 'Scent Work', 'America/Chicago');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000773051', 'Club', 'Secretary',
   '00000000-0000-0000-0000-000000773151'),
  ('00000000-0000-0000-0000-000000773053', 'Refund', 'Exhibitor', NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000773051', id, '00000000-0000-0000-0000-000000773001',
       true, '00000000-0000-0000-0000-000000773151'
  FROM public.roles WHERE name = 'secretary';

INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method, total_amount)
VALUES ('00000000-0000-0000-0000-000000773061', '00000000-0000-0000-0000-000000773011',
        '00000000-0000-0000-0000-000000773053', 'pending', 'cash', 20000);

INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES
  ('00000000-0000-0000-0000-00000077300a', '00000000-0000-0000-0000-000000773011',
   '00000000-0000-0000-0000-000000773021', '00000000-0000-0000-0000-000000773061',
   'submitted', 'pending', 'cash', 50),
  ('00000000-0000-0000-0000-00000077300b', '00000000-0000-0000-0000-000000773011',
   '00000000-0000-0000-0000-000000773021', '00000000-0000-0000-0000-000000773061',
   'submitted', 'pending', 'cash', 50),
  ('00000000-0000-0000-0000-00000077300d', '00000000-0000-0000-0000-000000773011',
   '00000000-0000-0000-0000-000000773021', '00000000-0000-0000-0000-000000773061',
   'submitted', 'waived', 'waived', 0),
  ('00000000-0000-0000-0000-00000077300f', '00000000-0000-0000-0000-000000773011',
   '00000000-0000-0000-0000-000000773021', '00000000-0000-0000-0000-000000773061',
   'submitted', 'pending', 'cash', 50);

-- C: refunded before refund_origin existed. Only a row written with the
-- trigger off can hold refunded + NULL now, which is exactly what every
-- pre-migration refunded row is.
ALTER TABLE public.entries DISABLE TRIGGER trg_entries_refund_origin;
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-00000077300c', '00000000-0000-0000-0000-000000773011',
        '00000000-0000-0000-0000-000000773021', '00000000-0000-0000-0000-000000773061',
        'submitted', 'refunded', 'cash', 50);
-- G: see the header. Written as the service role (the only writer of refund
-- columns) with the origin trigger off.
SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee,
                            refund_origin, refund_amount, refunded_at)
VALUES ('00000000-0000-0000-0000-00000077300e', '00000000-0000-0000-0000-000000773011',
        '00000000-0000-0000-0000-000000773021', '00000000-0000-0000-0000-000000773061',
        'submitted', 'refunded', 'cash', 50, 'enrollment', 50, now());
RESET ROLE;
ALTER TABLE public.entries ENABLE TRIGGER trg_entries_refund_origin;

CREATE TEMP TABLE myk9_773_steps (n serial, step text, got text);
GRANT ALL ON myk9_773_steps TO authenticated;
GRANT ALL ON SEQUENCE myk9_773_steps_n_seq TO authenticated;

-- Snapshot helper: every entry as status(origin), by id suffix (a b c d e f;
-- e is G). SECURITY
-- DEFINER because no client role may read refund_origin (asserted above).
CREATE FUNCTION pg_temp.myk9_773_snapshot() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT string_agg(right(e.id::text, 1) || '=' || e.payment_status
                    || '(' || COALESCE(e.refund_origin, '-') || ')', ' ' ORDER BY right(e.id::text, 1))
    FROM public.entries e
   WHERE e.registration_id = '00000000-0000-0000-0000-000000773061';
$$;

CREATE FUNCTION pg_temp.myk9_773_expect(p_step text, p_want text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_got text := pg_temp.myk9_773_snapshot();
BEGIN
  IF v_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'FAIL %: want [%], got [%]', p_step, p_want, v_got;
  END IF;
  RAISE NOTICE 'PASS %: %', p_step, v_got;
END;
$$;

-- An entry-level refund stamp, as stripe-refund-entry writes it (service role).
CREATE FUNCTION pg_temp.myk9_773_stripe_stamp(p_entry uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.entries
     SET refund_amount = 50, refunded_at = now(), refund_notes = 'Stripe (fixture)',
         payment_status = 'refunded'
   WHERE id = p_entry;
END;
$$;

-- --- 1. Paid in Full --------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000773151', true);

SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000773061', 'payment', NULL, 'check', NULL, '2001', NULL);
SELECT pg_temp.myk9_773_expect('paid in full',
  'a=paid(-) b=paid(-) c=refunded(-) d=waived(-) e=refunded(enrollment) f=paid(-)');

-- --- 2. B refunded on its own (entry level) ---------------------------------
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.myk9_773_stripe_stamp('00000000-0000-0000-0000-00000077300b');
SELECT pg_temp.myk9_773_expect('B refunded on its own',
  'a=paid(-) b=refunded(entry) c=refunded(-) d=waived(-) e=refunded(enrollment) f=paid(-)');

-- --- 3. the enrollment is refunded ------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000773151', true);
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000773061', 'refund', 150, 'cash', NULL, NULL, 'Cash Returned');
SELECT pg_temp.myk9_773_expect('enrollment refunded',
  'a=refunded(enrollment) b=refunded(entry) c=refunded(-) d=waived(-) e=refunded(enrollment) f=refunded(enrollment)');

-- The flag lives for the cascade statement only.
DO $$
BEGIN
  IF COALESCE(current_setting('myk9.entry_refund_origin', true), '') <> '' THEN
    RAISE EXCEPTION 'FAIL the enrollment-refund flag outlived the cascade: %',
      current_setting('myk9.entry_refund_origin', true);
  END IF;
  RAISE NOTICE 'PASS the enrollment-refund flag is cleared after the cascade';
END;
$$;

-- --- 4. F gets an entry-level refund on top, and callers cannot write the origin
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.myk9_773_stripe_stamp('00000000-0000-0000-0000-00000077300f');
-- A forged origin is replaced, whatever the caller sends.
UPDATE public.entries SET refund_origin = 'enrollment'
 WHERE id = '00000000-0000-0000-0000-00000077300c';
UPDATE public.entries SET refund_origin = 'entry'
 WHERE id = '00000000-0000-0000-0000-00000077300a';
SELECT pg_temp.myk9_773_expect('F stamped, origins not writable',
  'a=refunded(enrollment) b=refunded(entry) c=refunded(-) d=waived(-) e=refunded(enrollment) f=refunded(entry)');

-- --- 5. Paid in Full again: only the inherited refund follows ---------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000773151', true);

INSERT INTO myk9_773_steps (step, got)
SELECT 'answer', (
  SELECT string_agg(right(x->>'id', 1) || '=' || (x->>'payment_status'), ' '
                    ORDER BY right(x->>'id', 1))
    FROM jsonb_array_elements(public.record_enrollment_payment(
           '00000000-0000-0000-0000-000000773061', 'payment', NULL, 'cash', NULL, NULL, NULL
         ) -> 'entries') x);

SELECT pg_temp.myk9_773_expect('paid in full after the refund',
  'a=paid(-) b=refunded(entry) c=refunded(-) d=waived(-) e=refunded(enrollment) f=refunded(entry)');

DO $$
DECLARE
  v_answer text;
BEGIN
  SELECT got INTO v_answer FROM myk9_773_steps WHERE step = 'answer';
  IF v_answer IS DISTINCT FROM 'a=paid b=refunded c=refunded d=waived e=refunded f=refunded' THEN
    RAISE EXCEPTION 'FAIL the RPC answer does not carry every entry''s status: %', v_answer;
  END IF;
  RAISE NOTICE 'PASS the RPC answers every entry''s resulting status: %', v_answer;
END;
$$;

-- --- 6. refunded again, then "Payment Due" ----------------------------------
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000773061', 'refund', 100, NULL, NULL, NULL, 'Stripe (manual)');
SELECT pg_temp.myk9_773_expect('enrollment refunded again',
  'a=refunded(enrollment) b=refunded(entry) c=refunded(-) d=waived(-) e=refunded(enrollment) f=refunded(entry)');

SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000773061', 'reversal', NULL, NULL, NULL, NULL, NULL);
SELECT pg_temp.myk9_773_expect('payment due after the refund',
  'a=pending(-) b=refunded(entry) c=refunded(-) d=waived(-) e=refunded(enrollment) f=refunded(entry)');

RESET ROLE;
ROLLBACK;
