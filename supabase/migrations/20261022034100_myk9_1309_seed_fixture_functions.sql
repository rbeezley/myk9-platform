-- MYK9-1309: move the two MYK9-1281 reseed behaviours out of anonymous DO
-- blocks in supabase/seed-demo.sql and into functions a behavioural SQL test
-- can call (supabase/tests/myk9_1309_seed_fixture_functions_test.sql).
--
-- WHY. Both behaviours were guarded only by vitest tests that read the seed's
-- source text, and three review rounds each found a rewrite that kept those
-- tests green while changing what the SQL does (a widened loop, a fifth show
-- the parser skipped, the postcondition moved above the fixture restore, an
-- AND flipped to OR). The same move was made for the paid-stray guard in
-- 20260916213500 (MYK9-538). The seed now makes two calls; the vitest contract
-- pins only where it makes them.
--
-- Seed maintenance only: the seed runs as postgres. Neither function is an
-- application RPC, so neither is SECURITY DEFINER and both are revoked from
-- PUBLIC, anon and authenticated.

-- ---------------------------------------------------------------------------
-- 1. Retire stale show-day fixture shows.
--
-- Body copied from seed-demo.sql section 0 (MYK9-1281). One change: entry_carts
-- joins the skip list (a cart carries the show and may carry a Stripe Checkout
-- session id), so the list only protects more.
--
-- public.seed_demo_restore_show_day_fixture() is insert-only (MYK9-731), and
-- the reseed deletes every entry it minted before calling it, so without this
-- every reseed added another "Heartland Scent Work Week" show to Find Shows.
--
-- Two layers, two jobs. The SKIP LIST protects data: a fixture show is left
-- alone when anything that carries money or a person's own work hangs off it,
-- matched by show_id OR through one of the show's classes or trials (a
-- waitlist join counts as a person's work; entries.show_id is nullable;
-- entry_cart_items hangs off classes with NO ACTION, which would block the
-- shows -> trials -> classes cascade with 23503). refund_requests is
-- ON DELETE SET NULL, so deleting would silently strip its show link. The
-- per-show EXCEPTION sub-block protects the RESEED: an FK nobody listed keeps
-- that one show and warns, and never aborts the run (ON_ERROR_STOP).
-- Everything else on a deleted show (trials, classes, armbands, judge
-- assignments, announcements, visibility settings, lifecycle email steps)
-- cascades from shows. Only the fixture id range dededede-0000-0000-0731-* is
-- in scope; the retired fixed show ...014 is outside it and never touched.
--
-- Returns the number of shows deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_demo_retire_stale_fixture_shows()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_show record;
  v_hangs boolean;
  v_retired integer := 0;
BEGIN
  FOR v_show IN
    SELECT s.id, s.name
    FROM public.shows s
    WHERE s.id >= 'dededede-0000-0000-0731-000000000000'::uuid
      AND s.id <  'dededede-0000-0000-0732-000000000000'::uuid
  LOOP
    SELECT
      EXISTS (SELECT 1 FROM public.entries e
              WHERE e.show_id = v_show.id
                 OR e.trial_id IN (SELECT t.id FROM public.trials t WHERE t.show_id = v_show.id)
                 OR e.class_id IN (SELECT c.id FROM public.classes c
                                   JOIN public.trials t ON t.id = c.trial_id
                                   WHERE t.show_id = v_show.id))
      OR EXISTS (SELECT 1 FROM public.enrollments en WHERE en.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.waitlist_entries we
                 WHERE we.class_id IN (SELECT c.id FROM public.classes c
                                       JOIN public.trials t ON t.id = c.trial_id
                                       WHERE t.show_id = v_show.id))
      OR EXISTS (SELECT 1 FROM public.entry_carts ec WHERE ec.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.entry_cart_items eci
                 WHERE eci.class_id IN (SELECT c.id FROM public.classes c
                                        JOIN public.trials t ON t.id = c.trial_id
                                        WHERE t.show_id = v_show.id))
      OR EXISTS (SELECT 1 FROM public.stripe_orders so WHERE so.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.show_payments sp WHERE sp.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.show_payouts spo WHERE spo.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.entry_payment_links epl WHERE epl.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.show_money_locks sml WHERE sml.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.refund_requests rr WHERE rr.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.trial_packet_snapshots tps WHERE tps.show_id = v_show.id)
    INTO v_hangs;

    IF NOT v_hangs THEN
      BEGIN
        DELETE FROM public.shows WHERE id = v_show.id;
        v_retired := v_retired + 1;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
        RAISE WARNING 'seed-demo: kept fixture show % (%): %', v_show.id, v_show.name, SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN v_retired;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Date-coherence postcondition.
--
-- Body copied from the end of seed-demo.sql (MYK9-1281). Two changes:
--
-- THE OWNED SET is derived from the seed's own id namespace instead of a fixed
-- list of four ids. seed-demo.sql mints every show it inserts in 'dededede-'
-- (its DESTRUCTIVE SCOPE header; gen_random_uuid() cannot produce it), so a
-- show the seed adds later is covered however its literal is written, and a
-- club's own show (a random v4 id) never is. Two parts of that namespace are
-- not the seed's to fail on, exactly as before: the retired fixed show ...014
-- (a walk can add trials to it, and it can share a name with a same-day
-- fixture) and the show-day fixture range dededede-0000-0000-0731-*, of which
-- only the ONE show public.seed_demo_show_day_fixture_today() returns is
-- owned. A surviving older fixture show (kept because a walk or club touched
-- it) is not owned.
--
-- The set is an array, not an ON COMMIT DROP temp table, so the function can
-- run more than once in one transaction.
--
-- Close-before-start and trial-in-range are EXCEPTIONs over the owned set
-- only. A duplicate name + start date is an EXCEPTION only when BOTH shows are
-- owned; a pair with a surviving fixture show or a club's show is a WARNING
-- naming both ids, so a reseed is never blocked by a show a person touched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_demo_assert_date_coherence()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_bad text;
  v_fixture uuid := public.seed_demo_show_day_fixture_today();
  v_owned uuid[];
  r record;
BEGIN
  v_owned := ARRAY(
    SELECT s.id
    FROM public.shows s
    WHERE s.deleted_at IS NULL
      AND ((s.id >= 'dededede-0000-0000-0000-000000000000'::uuid
            AND s.id <= 'dededede-ffff-ffff-ffff-ffffffffffff'::uuid
            AND NOT (s.id >= 'dededede-0000-0000-0731-000000000000'::uuid
                     AND s.id <  'dededede-0000-0000-0732-000000000000'::uuid)
            AND s.id <> 'dededede-0000-0000-0000-000000000014'::uuid)
           OR s.id = v_fixture));

  SELECT s.name INTO v_bad
  FROM public.shows s
  WHERE s.id = ANY (v_owned)
    AND (s.entry_close_date AT TIME ZONE 'UTC')::date > (s.start_date AT TIME ZONE 'UTC')::date
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'seed-demo show "%" closes entries after it starts (MYK9-1281)', v_bad;
  END IF;

  SELECT s.name INTO v_bad
  FROM public.shows s
  JOIN public.trials t ON t.show_id = s.id
  WHERE s.id = ANY (v_owned)
    AND t.deleted_at IS NULL
    AND (t.date < (s.start_date AT TIME ZONE 'UTC')::date
         OR t.date > (s.end_date AT TIME ZONE 'UTC')::date)
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'seed-demo show "%" has a trial dated outside its start/end range (MYK9-1281)', v_bad;
  END IF;

  FOR r IN
    SELECT a.id AS a_id, b.id AS b_id, a.name,
           (a.id = ANY (v_owned) AND b.id = ANY (v_owned)) AS both_owned
    FROM public.shows a
    JOIN public.shows b ON b.id > a.id AND b.name = a.name
     AND b.start_date = a.start_date AND b.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
      AND (a.id = ANY (v_owned)
           OR b.id = ANY (v_owned)
           OR (a.id >= 'dededede-0000-0000-0731-000000000000'::uuid
               AND a.id < 'dededede-0000-0000-0732-000000000000'::uuid))
  LOOP
    IF r.both_owned THEN
      RAISE EXCEPTION 'seed-demo: two live shows share the name "%" and a start date (MYK9-1281)', r.name;
    ELSE
      RAISE WARNING 'seed-demo: shows % and % share the name "%" and a start date; one is a surviving fixture show a person touched (MYK9-1281)', r.a_id, r.b_id, r.name;
    END IF;
  END LOOP;
END;
$fn$;

COMMENT ON FUNCTION public.seed_demo_retire_stale_fixture_shows() IS
  'Seed maintenance (MYK9-1309, from MYK9-1281). Deletes show-day fixture shows (id range dededede-0000-0000-0731-*) that nothing of a person or of money hangs off; keeps and warns on an unlisted FK. Returns the number deleted. Called by supabase/seed-demo.sql section 0; never by a client.';
COMMENT ON FUNCTION public.seed_demo_assert_date_coherence() IS
  'Seed maintenance (MYK9-1309, from MYK9-1281). Raises when a seed-owned show (dededede- namespace, minus the fixture range and ...014, plus today''s fixture) closes entries after it starts, holds a trial outside its dates, or shares a name and start date with another seed-owned show. Called last by supabase/seed-demo.sql; never by a client.';

-- Not application RPCs: the postgres owner (and service_role) only.
REVOKE ALL ON FUNCTION public.seed_demo_retire_stale_fixture_shows() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_demo_assert_date_coherence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_retire_stale_fixture_shows() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_demo_assert_date_coherence() TO service_role;
