-- MYK9-538 behavioral contract, part 2 of public.seed_demo_assert_no_paid_strays()
-- (migration 20260916213500): the enrollments (MYK9-528) and stripe_orders
-- (MYK9-527) arms, plus the two remaining lenient-branch entry cases that did
-- not fit part 1. Part 1 — the entry cascade arms and the rest of the
-- substantiated/bare split — is
-- supabase/tests/seed_demo_paid_stray_guard_test.sql; the split exists only to
-- keep each file under the repo's 500-line ceiling. Both files are registered
-- in scripts/qa/run-behavioral-sql-tests.sh and in launchCriticalSqlTests.
--
-- All fixtures roll back.

BEGIN;

-- Traps the guard and returns its error message, or NULL when it stayed quiet.
CREATE FUNCTION pg_temp.guard_error() RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.seed_demo_assert_no_paid_strays();
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END;
$$;

-- Vacuity control for the "does NOT abort" cases: a lenient verdict only means
-- something if the row is still there, still paid, and still in scope. The show
-- ids are restated as literals rather than derived from the guard, so this
-- control cannot agree with a bug in the guard.
CREATE FUNCTION pg_temp.paid_row_in_scope(p_id uuid) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entries e
    WHERE e.id = p_id
      AND e.payment_status IN ('paid', 'refunded')
      AND e.show_id IN ('dededede-0000-0000-0000-000000000010',
                        'dededede-0000-0000-0000-000000000011',
                        'dededede-0000-0000-0000-000000000012')
  );
$$;

-- --- fixtures ---------------------------------------------------------------
-- Both arms are scoped by show alone, so only the shows the seed deletes (and
-- one it never touches) are needed here.
INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000538501', 'F538b Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES ('00000000-0000-0000-0000-000000538002', 'F538', 'Handler',
        'f538-handler@example.test', NULL);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('dededede-0000-0000-0000-000000000010', 'F538b Demo AKC', 'AKC',
   DATE '2026-11-01', DATE '2026-11-02', '00000000-0000-0000-0000-000000538501', 'draft'),
  ('dededede-0000-0000-0000-000000000011', 'F538b Demo UKC', 'UKC',
   DATE '2026-11-01', DATE '2026-11-02', '00000000-0000-0000-0000-000000538501', 'draft'),
  ('dededede-0000-0000-0000-000000000012', 'F538b Demo ASCA', 'ASCA',
   DATE '2026-11-01', DATE '2026-11-02', '00000000-0000-0000-0000-000000538501', 'draft'),
  ('00000000-0000-0000-0000-000000538503', 'F538b Unrelated Show', 'AKC',
   DATE '2026-11-01', DATE '2026-11-02', '00000000-0000-0000-0000-000000538501', 'draft');

-- A baseline: with fixtures but no strays the guard must stay quiet, or every
-- negative case below would pass for the wrong reason.
DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F538.17a the fixtures alone abort the guard: %', err;
  END IF;
  RAISE NOTICE 'PASS F538.17a the fixtures alone leave the guard quiet';
END;
$$;

-- --- the enrollments arm (MYK9-528) -----------------------------------------
-- No trail split here: enrollments.payment_status='paid_online' is what the
-- secretary's "Mark Paid Online" writes, with nothing else to see.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES ('00000000-0000-0000-0000-000000538201', 'dededede-0000-0000-0000-000000000011',
        '00000000-0000-0000-0000-000000538002', 'paid_online');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%paid or refunded enrollment(s)%' THEN
    RAISE EXCEPTION 'FAIL F538.17 a paid_online enrollment on a deleted show did not abort: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.17 a trail-free paid enrollment aborts the reseed';
END;
$$;
DELETE FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000538201';

-- The mirror of F538.22, for enrollments: a paid enrollment on a show the seed
-- never deletes is not this guard's business. Without this control, widening
-- the arm to every paid enrollment in the table would leave F538.17 green.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES ('00000000-0000-0000-0000-000000538203', '00000000-0000-0000-0000-000000538503',
        '00000000-0000-0000-0000-000000538002', 'paid_by_check');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.enrollments
                 WHERE id = '00000000-0000-0000-0000-000000538203'
                   AND payment_status = 'paid_by_check'
                   AND show_id = '00000000-0000-0000-0000-000000538503') THEN
    RAISE EXCEPTION 'FAIL F538.25 the fixture is not a paid enrollment on the unrelated show, so a quiet guard proves nothing';
  END IF;
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F538.25 the enrollments arm reached past scope_shows: %', err;
  END IF;
  RAISE NOTICE 'PASS F538.25 a paid enrollment on an unrelated show is left alone';
END;
$$;
DELETE FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000538203';

-- The seed's OWN multi-dog enrollment is paid by fixture and is still present
-- when the guard runs (its delete depends on a later registration_id clear), so
-- it is excluded by id. Without that exclusion every rerun refuses itself.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES ('dededede-0000-0000-0000-000000000070', 'dededede-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000538002', 'paid');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F538.18 the seed refuses its own paid enrollment (...070), so no rerun can succeed: %', err;
  END IF;
  RAISE NOTICE 'PASS F538.18 the seed''s own paid enrollment does not trip the guard';
END;
$$;

-- --- the stripe_orders arm (MYK9-527) ---------------------------------------
-- Both scope FKs are ON DELETE RESTRICT, so an in-scope order aborts the reseed
-- with a bare 23503 later if it is not refused here first.
INSERT INTO public.stripe_orders (id, amount_cents, status, show_id)
VALUES ('00000000-0000-0000-0000-000000538301', 5000, 'succeeded',
        'dededede-0000-0000-0000-000000000012');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%Stripe order(s) point at a show this reseed deletes%' THEN
    RAISE EXCEPTION 'FAIL F538.19 an order scoped to a deleted show did not abort: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.19 an order scoped to a deleted show aborts the reseed';
END;
$$;
DELETE FROM public.stripe_orders WHERE id = '00000000-0000-0000-0000-000000538301';

-- The second route: the order holds no show_id, but its enrollment sits on a
-- show that cascades. The enrollment is left unpaid so the arm under test is
-- unambiguously the orders one.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES ('00000000-0000-0000-0000-000000538202', 'dededede-0000-0000-0000-000000000011',
        '00000000-0000-0000-0000-000000538002', 'pending');
INSERT INTO public.stripe_orders (id, amount_cents, status, enrollment_id)
VALUES ('00000000-0000-0000-0000-000000538302', 5000, 'succeeded',
        '00000000-0000-0000-0000-000000538202');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%Stripe order(s) point at a show this reseed deletes%' THEN
    RAISE EXCEPTION 'FAIL F538.20 an order reached only through an in-scope enrollment did not abort: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.20 the shows -> enrollments -> order route aborts the reseed';
END;
$$;
DELETE FROM public.stripe_orders WHERE id = '00000000-0000-0000-0000-000000538302';
DELETE FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000538202';

-- A fully-orphaned order references no parent, so RESTRICT can never fire on it
-- and it blocks nothing. Matching it would wedge every reseed on the rows a
-- past reseed already nulled (22 of them on staging).
INSERT INTO public.stripe_orders (id, amount_cents, status, show_id, enrollment_id)
VALUES ('00000000-0000-0000-0000-000000538303', 5000, 'succeeded', NULL, NULL);

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F538.21 an already-orphaned Stripe order wedges the reseed: %', err;
  END IF;
  RAISE NOTICE 'PASS F538.21 an already-orphaned Stripe order is left for the seed''s WARNING, not an abort';
END;
$$;

-- …and the mirror image: an order scoped to a show the seed never deletes is
-- not this guard's business. Without this control, F538.19 and F538.20 would
-- still pass if the orders arm simply matched every order in the table.
INSERT INTO public.stripe_orders (id, amount_cents, status, show_id)
VALUES ('00000000-0000-0000-0000-000000538304', 5000, 'succeeded',
        '00000000-0000-0000-0000-000000538503');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F538.22 the orders arm reached past scope_shows: %', err;
  END IF;
  RAISE NOTICE 'PASS F538.22 an order on an unrelated show is left alone';
END;
$$;

-- MYK9-748: the seed deletes its own enrollment ...070 BY ID, wherever it sits.
-- Reassigned to a show outside the seed's set, an order on it matched neither
-- route above, and the reseed died on the raw RESTRICT error instead.
UPDATE public.enrollments SET show_id = '00000000-0000-0000-0000-000000538503'
 WHERE id = 'dededede-0000-0000-0000-000000000070';
INSERT INTO public.stripe_orders (id, amount_cents, status, enrollment_id)
VALUES ('00000000-0000-0000-0000-000000538305', 5000, 'succeeded',
        'dededede-0000-0000-0000-000000000070');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.enrollments
                 WHERE id = 'dededede-0000-0000-0000-000000000070'
                   AND show_id = '00000000-0000-0000-0000-000000538503') THEN
    RAISE EXCEPTION 'FAIL F538.26 precondition: ...070 was not moved outside the seed''s shows';
  END IF;
  IF err IS NULL OR err NOT LIKE '%Stripe order(s) point at a show this reseed deletes%' THEN
    RAISE EXCEPTION 'FAIL F538.26 an order on the seed''s own enrollment, moved off its show, did not abort: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.26 an order on enrollment ...070 aborts the reseed wherever that enrollment sits';
END;
$$;
DELETE FROM public.stripe_orders WHERE id = '00000000-0000-0000-0000-000000538305';
UPDATE public.enrollments SET show_id = 'dededede-0000-0000-0000-000000000010'
 WHERE id = 'dededede-0000-0000-0000-000000000070';

-- --- the remaining lenient-branch entry cases (MYK9-539) --------------------
-- entry_fee IS NULL folds to the LENIENT branch, because the corroboration test
-- is `coalesce(entry_fee, 0) > 0`. Defensible — an unpriced entry is not a
-- payment — but pin it, so it is a decision and not an accident of coalesce.
INSERT INTO public.entries (id, show_id, payment_status, entry_fee, payment_method)
VALUES ('00000000-0000-0000-0000-000000538118', 'dededede-0000-0000-0000-000000000010',
        'paid', NULL, 'secretary_paid');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF NOT pg_temp.paid_row_in_scope('00000000-0000-0000-0000-000000538118') THEN
    RAISE EXCEPTION 'FAIL F538.23 the fixture is not a paid row inside the guard''s scope, so a quiet guard proves nothing';
  END IF;
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F538.23 a secretary_paid entry with a NULL entry_fee aborts the reseed; decide it deliberately if that is wanted: %', err;
  END IF;
  RAISE NOTICE 'PASS F538.23 secretary_paid with a NULL entry_fee is treated as unpriced, not as money (MYK9-539)';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538118';

-- 'waived' is excluded by name, at any fee: a waived entry is the one method
-- that asserts NO money changed hands. Without this case the method arm could
-- be rewritten to match every non-null method and stay green.
INSERT INTO public.entries (id, show_id, payment_status, entry_fee, payment_method)
VALUES ('00000000-0000-0000-0000-000000538119', 'dededede-0000-0000-0000-000000000010',
        'paid', 30.00, 'waived');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF NOT pg_temp.paid_row_in_scope('00000000-0000-0000-0000-000000538119') THEN
    RAISE EXCEPTION 'FAIL F538.24 the fixture is not a paid row inside the guard''s scope, so a quiet guard proves nothing';
  END IF;
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F538.24 a waived entry carrying a fee aborts the reseed: %', err;
  END IF;
  RAISE NOTICE 'PASS F538.24 payment_method = waived is not corroboration, even at a non-zero fee';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538119';

ROLLBACK;
