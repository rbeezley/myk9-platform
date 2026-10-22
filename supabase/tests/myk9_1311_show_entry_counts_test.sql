-- MYK9-1311: get_show_entry_counts(uuid[]) returns the live entry count (deleted_at IS NULL,
-- any status; the Entries page "Entries" total) for each requested show the caller can
-- manage, and NO row for any other show. anon cannot execute it.
--
-- Conventions match myk9_1008_show_requires_club_test.sql. Run with
-- psql -X -v ON_ERROR_STOP=1 after migrations; every fixture rolls back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000001311001', 'MYK9-1311 Secretary Club'),
  ('00000000-0000-0000-0000-000001311002', 'MYK9-1311 Other Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001311011', 'Sam', 'Secretary', '00000000-0000-0000-0000-000001311021'),
  ('00000000-0000-0000-0000-000001311012', 'Ellie', 'Exhibitor', '00000000-0000-0000-0000-000001311022');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000001311011',
  id,
  '00000000-0000-0000-0000-000001311001',
  true,
  '00000000-0000-0000-0000-000001311021'
FROM public.roles
WHERE name = 'secretary';

-- Show A (managed): 2 live entries + 1 withdrawn (still counted) + 1 soft-deleted (not)
-- + 1 superseded move-up source, status 'moved' (not; the Entries page drops it).
-- Show B (managed): no entries at all -> a real 0 row.
-- Show C (other club): 1 entry the secretary must not see counted.
INSERT INTO public.shows (id, name, organization, club_id, status, start_date, end_date)
VALUES
  ('00000000-0000-0000-0000-000001311031', 'MYK9-1311 Show A', 'AKC',
   '00000000-0000-0000-0000-000001311001', 'published', DATE '2026-09-01', DATE '2026-09-02'),
  ('00000000-0000-0000-0000-000001311032', 'MYK9-1311 Show B', 'AKC',
   '00000000-0000-0000-0000-000001311001', 'published', DATE '2026-09-01', DATE '2026-09-02'),
  ('00000000-0000-0000-0000-000001311033', 'MYK9-1311 Show C', 'AKC',
   '00000000-0000-0000-0000-000001311002', 'published', DATE '2026-09-01', DATE '2026-09-02');

INSERT INTO public.entries (id, show_id, armband, payment_status, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000001311051', '00000000-0000-0000-0000-000001311031', '101', 'paid', 25),
  ('00000000-0000-0000-0000-000001311052', '00000000-0000-0000-0000-000001311031', '102', 'paid', 25),
  ('00000000-0000-0000-0000-000001311053', '00000000-0000-0000-0000-000001311031', '103', 'paid', 25),
  ('00000000-0000-0000-0000-000001311054', '00000000-0000-0000-0000-000001311031', '104', 'paid', 25),
  ('00000000-0000-0000-0000-000001311055', '00000000-0000-0000-0000-000001311033', '201', 'paid', 25),
  ('00000000-0000-0000-0000-000001311056', '00000000-0000-0000-0000-000001311031', '105', 'paid', 25);

UPDATE public.entries SET entry_status = 'withdrawn'
 WHERE id = '00000000-0000-0000-0000-000001311053';
UPDATE public.entries SET deleted_at = now()
 WHERE id = '00000000-0000-0000-0000-000001311054';
UPDATE public.entries SET entry_status = 'moved'
 WHERE id = '00000000-0000-0000-0000-000001311056';

-- 1. A secretary gets the real count for each managed show (withdrawn counted,
--    soft-deleted not, empty show = real 0) and no row for the other club's show.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001311021', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001311021","role":"authenticated","app_metadata":{}}',
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_a integer;
  v_b integer;
  v_rows integer;
  v_c_rows integer;
BEGIN
  SELECT entry_count INTO v_a FROM public.get_show_entry_counts(ARRAY[
    '00000000-0000-0000-0000-000001311031'::uuid,
    '00000000-0000-0000-0000-000001311032'::uuid,
    '00000000-0000-0000-0000-000001311033'::uuid
  ]) WHERE show_id = '00000000-0000-0000-0000-000001311031';
  IF v_a IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FAIL 1.1 show A count % (want 3: 2 live + 1 withdrawn; soft-deleted and moved excluded)', v_a;
  END IF;
  RAISE NOTICE 'PASS 1.1 a managed show counts live entries of any status and excludes soft-deleted and moved';

  SELECT entry_count INTO v_b FROM public.get_show_entry_counts(ARRAY[
    '00000000-0000-0000-0000-000001311032'::uuid
  ]) WHERE show_id = '00000000-0000-0000-0000-000001311032';
  IF v_b IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FAIL 1.2 empty managed show returned % (want a real 0 row)', v_b;
  END IF;
  RAISE NOTICE 'PASS 1.2 a managed show with no entries returns a real 0 row';

  SELECT count(*) INTO v_c_rows FROM public.get_show_entry_counts(ARRAY[
    '00000000-0000-0000-0000-000001311031'::uuid,
    '00000000-0000-0000-0000-000001311033'::uuid
  ]) WHERE show_id = '00000000-0000-0000-0000-000001311033';
  IF v_c_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 1.3 a show in another club returned a row';
  END IF;
  RAISE NOTICE 'PASS 1.3 a show the caller cannot manage returns no row';

  -- Duplicated ids must not double the count.
  SELECT entry_count INTO v_a FROM public.get_show_entry_counts(ARRAY[
    '00000000-0000-0000-0000-000001311031'::uuid,
    '00000000-0000-0000-0000-000001311031'::uuid
  ]);
  IF v_a IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FAIL 1.4 duplicated ids returned % (want 3)', v_a;
  END IF;
  SELECT count(*) INTO v_rows FROM public.get_show_entry_counts(NULL);
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 1.4 a NULL array returned rows';
  END IF;
  RAISE NOTICE 'PASS 1.4 duplicate ids are counted once and a NULL array returns nothing';
END;
$$;

-- 2. An authenticated user with no management role gets no rows at all.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001311022', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001311022","role":"authenticated","app_metadata":{}}',
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows FROM public.get_show_entry_counts(ARRAY[
    '00000000-0000-0000-0000-000001311031'::uuid,
    '00000000-0000-0000-0000-000001311032'::uuid,
    '00000000-0000-0000-0000-000001311033'::uuid
  ]);
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 2.1 an exhibitor with no management role got % rows', v_rows;
  END IF;
  RAISE NOTICE 'PASS 2.1 a caller who manages no show gets no rows';
END;
$$;

-- 3. anon cannot execute it.
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.get_show_entry_counts(
      ARRAY['00000000-0000-0000-0000-000001311031'::uuid]
    );
    RAISE EXCEPTION 'FAIL 3.1 anon executed get_show_entry_counts';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 3.1 anon cannot execute get_show_entry_counts';
  END;
END;
$$;

RESET ROLE;
ROLLBACK;
