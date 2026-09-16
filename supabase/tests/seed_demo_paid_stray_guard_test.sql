-- MYK9-538 / MYK9-539 behavioral contract for
-- public.seed_demo_assert_no_paid_strays() (migration 20260916213500), the
-- guard supabase/seed-demo.sql calls before it deletes any parent that cascades
-- an entry.
--
-- Why this file exists: the guard used to be an anonymous DO $$ block inside
-- seed-demo.sql, so its only automated coverage was a source-text test. Ten
-- arm-neutering mutations run inside the guard left eight of them green. The
-- cases below run the guard and read its disposition instead.
--
-- The guard has two dispositions: ABORT (RAISE EXCEPTION) and WARN-then-cascade
-- (RAISE WARNING). A RAISE WARNING cannot be trapped from inside SQL, so "the
-- bare row warns" is asserted here as "the bare row does NOT abort" — the
-- disposition that decides whether the reseed destroys the row. The warning TEXT
-- is a source-text claim, pinned in apps/myk9show/src/test/database/
-- seedDemoSelfCleaningRelationshipDeleteContract.test.ts.
--
-- Scope of THIS file: the entries arms and the substantiated/bare split. The
-- enrollments (MYK9-528) and stripe_orders (MYK9-527) arms are in
-- supabase/tests/seed_demo_paid_stray_guard_scopes_test.sql; split only to keep
-- each file under the repo's 500-line ceiling. Both are registered in
-- scripts/qa/run-behavioral-sql-tests.sh.
--
-- All fixtures roll back.

BEGIN;

-- Traps the guard and returns its error message, or NULL when it stayed quiet.
-- The guard writes nothing, so the subtransaction this opens costs nothing.
CREATE FUNCTION pg_temp.guard_error() RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.seed_demo_assert_no_paid_strays();
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END;
$$;

-- Vacuity control for every "does NOT abort" case below. A lenient verdict is
-- only meaningful if the row is still THERE, still paid, and still inside the
-- guard's scope: if a future change dropped zero-fee paid rows out of the
-- `stray` CTE entirely, `err IS NULL` would go on passing while the guard had
-- stopped looking. The show ids are restated as literals on purpose — deriving
-- them from the guard would make this control agree with the bug.
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

-- --- F538.0 the guard is a seed-maintenance function, not a client RPC -------
DO $$
DECLARE
  v_proc pg_catalog.pg_proc%ROWTYPE;
BEGIN
  SELECT * INTO v_proc FROM pg_catalog.pg_proc
  WHERE oid = 'public.seed_demo_assert_no_paid_strays()'::regprocedure;

  IF v_proc.prosecdef THEN
    RAISE EXCEPTION 'FAIL F538.0 the guard is SECURITY DEFINER; the seed calls it as postgres and it must not carry owner rights';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(v_proc.proconfig, ARRAY[]::text[])) AS c
    WHERE c IN ('search_path=', 'search_path=""')
  ) THEN
    RAISE EXCEPTION 'FAIL F538.0 the guard does not pin an empty search_path: %', v_proc.proconfig;
  END IF;
  IF has_function_privilege('anon', v_proc.oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_proc.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL F538.0 anon or authenticated can EXECUTE the seed guard';
  END IF;

  RAISE NOTICE 'PASS F538.0 the guard is invoker-rights, search_path-pinned and unreachable from the API roles';
END;
$$;

-- --- fixtures ---------------------------------------------------------------
-- The guard names the seed's OWN fixed ids, so the in-scope fixtures have to
-- use them. Everything rolls back.
INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000538001', 'F538 Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES ('00000000-0000-0000-0000-000000538002', 'F538', 'Handler',
        'f538-handler@example.test', NULL);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  -- The three hand-authored demo shows the seed deletes.
  ('dededede-0000-0000-0000-000000000010', 'F538 Demo AKC', 'AKC',
   DATE '2026-11-01', DATE '2026-11-02', '00000000-0000-0000-0000-000000538001', 'draft'),
  ('dededede-0000-0000-0000-000000000011', 'F538 Demo UKC', 'UKC',
   DATE '2026-11-01', DATE '2026-11-02', '00000000-0000-0000-0000-000000538001', 'draft'),
  ('dededede-0000-0000-0000-000000000012', 'F538 Demo ASCA', 'ASCA',
   DATE '2026-11-01', DATE '2026-11-02', '00000000-0000-0000-0000-000000538001', 'draft'),
  -- One myk9_109 load show, inside the id RANGE arm rather than the id list.
  ('a1090000-0000-0000-0010-000000000001', 'F538 Load Show', 'AKC',
   DATE '2026-11-01', DATE '2026-11-02', '00000000-0000-0000-0000-000000538001', 'draft'),
  -- A show the seed never touches: the negative control for every arm.
  ('00000000-0000-0000-0000-000000538003', 'F538 Unrelated Show', 'AKC',
   DATE '2026-11-01', DATE '2026-11-02', '00000000-0000-0000-0000-000000538001', 'draft');

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('dededede-0000-0000-0000-000000000021', 'dededede-0000-0000-0000-000000000010',
   'F538 In-Scope Trial', DATE '2026-11-01'),
  ('00000000-0000-0000-0000-000000538004', '00000000-0000-0000-0000-000000538003',
   'F538 Out-Of-Scope Trial', DATE '2026-11-01');

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('dec1a55e-0000-0000-0000-000000000031', 'dededede-0000-0000-0000-000000000021',
   'F538 In-Scope Class'),
  ('00000000-0000-0000-0000-000000538005', '00000000-0000-0000-0000-000000538004',
   'F538 Out-Of-Scope Class');

INSERT INTO public.dogs (id, call_name, breed)
VALUES
  -- A hand-authored demo dog (the id-list arm).
  ('dededede-0000-0000-0000-000000000041', 'F538 Demo Dog', 'Labrador Retriever'),
  -- A myk9_109 load dog (the id-range arm).
  ('a1090000-0000-0000-0001-000000000001', 'F538 Load Dog', 'Labrador Retriever'),
  -- A dog the seed never deletes.
  ('00000000-0000-0000-0000-000000538006', 'F538 Unrelated Dog', 'Labrador Retriever');

-- --- F538.1 a scope holding no strays is quiet ------------------------------
-- The state the seed is actually in when it calls the guard: its own rows are
-- already deleted, so nothing it created can make it refuse its own rerun.
DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F538.1 the guard aborted on a scope with no strays: %', err;
  END IF;
  RAISE NOTICE 'PASS F538.1 an empty scope does not abort the reseed';
END;
$$;

-- --- the entry cascade arms, one corroboration column each ------------------
-- entries cascades from classes, dogs, shows and trials (confdeltype='c' on all
-- four) and the seed deletes all four, so every arm below is a live route to a
-- destroyed money row. Each case is in scope through exactly ONE column, so
-- neutering any single arm turns exactly one case red.

-- A. show_id + stripe_payment_intent_id. The intent column is service-role-only
--    on INSERT (trg_entries_protect_payment_fields_insert), so this fixture is
--    written as service_role and the role is reset before the guard runs.
SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, show_id, payment_status, entry_fee, stripe_payment_intent_id)
VALUES ('00000000-0000-0000-0000-000000538101', 'dededede-0000-0000-0000-000000000010',
        'paid', 30.00, 'pi_f538_show_arm');
RESET ROLE;

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL THEN
    RAISE EXCEPTION 'FAIL F538.2 a paid entry on a deleted show with a Stripe intent did not abort';
  END IF;
  IF err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.2 wrong refusal: %', err;
  END IF;
  RAISE NOTICE 'PASS F538.2 the show_id arm aborts on a Stripe-backed stray';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538101';

-- B. trial_id + payment_reference. show_id is NULL on purpose: nothing
--    constrains an entry's show_id to agree with its trial's show.
INSERT INTO public.entries (id, trial_id, payment_status, entry_fee, payment_reference)
VALUES ('00000000-0000-0000-0000-000000538102', 'dededede-0000-0000-0000-000000000021',
        'paid', 30.00, 'CHK-4417');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.3 the trial_id arm did not abort on a recorded payment reference: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.3 the trial_id arm aborts on a recorded payment reference';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538102';

-- C. class_id + payment_notes.
INSERT INTO public.entries (id, class_id, payment_status, entry_fee, payment_notes)
VALUES ('00000000-0000-0000-0000-000000538103', 'dec1a55e-0000-0000-0000-000000000031',
        'paid', 30.00, 'Collected at the desk Saturday morning');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.4 the class_id arm did not abort on operator payment notes: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.4 the class_id arm aborts on operator payment notes';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538103';

-- D. the myk9_109 dog RANGE + payment_received_on. class_id stays NULL so the
--    dog-registration insert trigger does not need a registration fixture.
INSERT INTO public.entries (id, dog_id, payment_status, entry_fee, payment_received_on)
VALUES ('00000000-0000-0000-0000-000000538104', 'a1090000-0000-0000-0001-000000000001',
        'paid', 30.00, DATE '2026-10-30');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.5 the load-dog range arm did not abort on a received-on date: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.5 the load-dog range arm aborts on a recorded received-on date';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538104';

-- E. the hand-authored demo dog LIST + a recorded cheque at a ZERO fee.
--    MYK9-539 narrows payment_method as corroboration for 'secretary_paid'
--    alone; a cheque is a recorded payment at any fee and must still abort.
INSERT INTO public.entries (id, dog_id, payment_status, entry_fee, payment_method)
VALUES ('00000000-0000-0000-0000-000000538105', 'dededede-0000-0000-0000-000000000041',
        'paid', 0.00, 'check');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.6 a recorded cheque on a demo dog did not abort at entry_fee 0.00: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.6 the demo-dog arm aborts on a recorded cheque regardless of fee (MYK9-539)';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538105';

-- --- the remaining corroboration columns ------------------------------------
-- refunded_at, refund_amount, refund_decided_at, entry_status_history and a
-- stripe_orders row naming the entry. Each is the ONLY trail on its row.

-- refund_amount / refund_notes / refunded_at are reserved for
-- stripe-refund-entry by trg_restrict_entry_refund_columns_insert, and
-- refund_decided_at for set_entry_refund_decision by
-- trg_restrict_entry_refund_decision_columns_insert. All three fixtures are
-- therefore written as service_role, the role the ops runbook uses for a manual
-- fix, and the role is reset before the guard runs.
SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, show_id, payment_status, entry_fee, refunded_at)
VALUES ('00000000-0000-0000-0000-000000538106', 'dededede-0000-0000-0000-000000000011',
        'refunded', 30.00, TIMESTAMPTZ '2026-10-31 12:00:00+00');
RESET ROLE;

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.7 a refunded entry with refunded_at did not abort: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.7 refunded_at alone substantiates a stray';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538106';

SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, show_id, payment_status, entry_fee, refund_amount)
VALUES ('00000000-0000-0000-0000-000000538107', 'dededede-0000-0000-0000-000000000012',
        'paid', 30.00, 15.00);
RESET ROLE;

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.8 a partially refunded entry did not abort: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.8 refund_amount alone substantiates a stray';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538107';

SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, show_id, payment_status, entry_fee, refund_decided_at)
VALUES ('00000000-0000-0000-0000-000000538108', 'a1090000-0000-0000-0010-000000000001',
        'paid', 30.00, TIMESTAMPTZ '2026-10-31 12:00:00+00');
RESET ROLE;

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.9 a decided refund on a load show did not abort: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.9 refund_decided_at alone substantiates a stray, on the load-show range';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538108';

-- entry_status_history is append-only through the status trigger, so the row is
-- created bare and then moved through a status change. dog_id stays NULL, which
-- is also what makes auto_assign_armband_on_accept step aside on the move into
-- 'confirmed' instead of minting an armband.
INSERT INTO public.entries (id, show_id, payment_status, entry_fee, entry_status)
VALUES ('00000000-0000-0000-0000-000000538109', 'dededede-0000-0000-0000-000000000010',
        'paid', 30.00, 'submitted');
UPDATE public.entries SET entry_status = 'confirmed'
WHERE id = '00000000-0000-0000-0000-000000538109';

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.entry_status_history
                 WHERE entry_id = '00000000-0000-0000-0000-000000538109') THEN
    RAISE EXCEPTION 'FAIL F538.10 the fixture produced no entry_status_history row, so this case proves nothing';
  END IF;
  IF err IS NULL OR err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.10 a stray with lifecycle history did not abort: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.10 entry_status_history alone substantiates a stray';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538109';

-- A Stripe order that names the entry in entry_ids. The order itself is scoped
-- to the UNRELATED show so the orders arm cannot be what aborts here.
INSERT INTO public.entries (id, show_id, payment_status, entry_fee)
VALUES ('00000000-0000-0000-0000-000000538110', 'dededede-0000-0000-0000-000000000010',
        'paid', 30.00);
INSERT INTO public.stripe_orders (id, amount_cents, status, show_id, entry_ids)
VALUES ('00000000-0000-0000-0000-000000538111', 3000, 'succeeded',
        '00000000-0000-0000-0000-000000538003',
        ARRAY['00000000-0000-0000-0000-000000538110'::uuid]);

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.11 a stray named by a Stripe order did not abort: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.11 a stripe_orders.entry_ids membership alone substantiates a stray';
END;
$$;
DELETE FROM public.stripe_orders WHERE id = '00000000-0000-0000-0000-000000538111';
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538110';

-- --- the bare / lenient side ------------------------------------------------
-- The split is the whole design: aborting on QA-walk artifacts put a mandatory
-- manual DELETE in front of the reseed, the tool used when staging is broken.
-- Every case here carries a vacuity control (pg_temp.paid_row_in_scope).

INSERT INTO public.entries (id, show_id, payment_status, entry_fee)
VALUES ('00000000-0000-0000-0000-000000538112', 'dededede-0000-0000-0000-000000000010',
        'paid', 30.00);

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF NOT pg_temp.paid_row_in_scope('00000000-0000-0000-0000-000000538112') THEN
    RAISE EXCEPTION 'FAIL F538.12 the fixture is not a paid row inside the guard''s scope, so a quiet guard proves nothing';
  END IF;
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F538.12 a paid entry with no trail at all aborted the reseed: %', err;
  END IF;
  RAISE NOTICE 'PASS F538.12 a bare paid stray warns and lets the reseed continue';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538112';

-- MYK9-539: 'secretary_paid' is the wizard's DEFAULT method and is routinely
-- written on a zero-fee entry, where no money moved. It used to abort here.
INSERT INTO public.entries (id, show_id, payment_status, entry_fee, payment_method)
VALUES ('00000000-0000-0000-0000-000000538113', 'dededede-0000-0000-0000-000000000010',
        'paid', 0.00, 'secretary_paid');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF NOT pg_temp.paid_row_in_scope('00000000-0000-0000-0000-000000538113') THEN
    RAISE EXCEPTION 'FAIL F538.13 the fixture is not a paid row inside the guard''s scope, so a quiet guard proves nothing';
  END IF;
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F538.13 a zero-fee secretary_paid entry still aborts the reseed (MYK9-539): %', err;
  END IF;
  RAISE NOTICE 'PASS F538.13 a zero-fee secretary_paid entry warns instead of aborting (MYK9-539)';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538113';

-- …and the same method on a row that DID carry a fee is money again. The two
-- further lenient-branch cases — a NULL entry_fee, and payment_method='waived'
-- — live in seed_demo_paid_stray_guard_scopes_test.sql, which holds the rest of
-- the disposition split.
INSERT INTO public.entries (id, show_id, payment_status, entry_fee, payment_method)
VALUES ('00000000-0000-0000-0000-000000538114', 'dededede-0000-0000-0000-000000000010',
        'paid', 30.00, 'secretary_paid');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.14 a secretary_paid entry carrying a $30 fee did not abort (MYK9-539): %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.14 secretary_paid with a non-zero fee still aborts (MYK9-539)';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538114';

-- --- disposition and scope negatives ----------------------------------------
-- A pending entry is not money in either direction, however rich its trail.
INSERT INTO public.entries (id, show_id, payment_status, entry_fee, payment_reference, payment_notes)
VALUES ('00000000-0000-0000-0000-000000538115', 'dededede-0000-0000-0000-000000000010',
        'pending', 30.00, 'CHK-0001', 'promised at the desk');
-- …and an out-of-scope show is out of scope however rich its trail.
INSERT INTO public.entries (id, show_id, class_id, payment_status, entry_fee,
                            payment_reference, payment_notes, payment_method)
VALUES ('00000000-0000-0000-0000-000000538116', '00000000-0000-0000-0000-000000538003',
        '00000000-0000-0000-0000-000000538005', 'paid', 30.00, 'CHK-0002', 'real money', 'check');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.entries
                 WHERE id = '00000000-0000-0000-0000-000000538115'
                   AND payment_status = 'pending'
                   AND show_id = 'dededede-0000-0000-0000-000000000010') THEN
    RAISE EXCEPTION 'FAIL F538.15 the pending fixture is not a pending row on a deleted show, so a quiet guard proves nothing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entries
                 WHERE id = '00000000-0000-0000-0000-000000538116'
                   AND payment_status = 'paid'
                   AND show_id = '00000000-0000-0000-0000-000000538003') THEN
    RAISE EXCEPTION 'FAIL F538.15 the out-of-scope fixture is not a paid row on the unrelated show, so a quiet guard proves nothing';
  END IF;
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F538.15 the guard reached past its scope, or aborted on a pending entry: %', err;
  END IF;
  RAISE NOTICE 'PASS F538.15 pending entries and other shows'' paid entries are left alone';
END;
$$;
DELETE FROM public.entries
WHERE id IN ('00000000-0000-0000-0000-000000538115', '00000000-0000-0000-0000-000000538116');

-- A soft-deleted stray still CASCADES, so deleted_at must not filter it out.
INSERT INTO public.entries (id, show_id, payment_status, entry_fee, payment_reference, deleted_at)
VALUES ('00000000-0000-0000-0000-000000538117', 'dededede-0000-0000-0000-000000000010',
        'paid', 30.00, 'CHK-0003', TIMESTAMPTZ '2026-10-31 12:00:00+00');

DO $$
DECLARE err text := pg_temp.guard_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%with a real payment trail%' THEN
    RAISE EXCEPTION 'FAIL F538.16 a SOFT-DELETED substantiated stray did not abort; soft-deleting must not clear the guard: %',
      coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS F538.16 a soft-deleted stray still aborts — deleted_at does not filter the guard';
END;
$$;
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000538117';

ROLLBACK;
