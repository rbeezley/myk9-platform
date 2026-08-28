-- Behavioral contract: entry-exposing views hide soft-deleted entries from
-- non-owners; the authenticated own-entry surface deliberately retains the
-- exhibitor's tombstone so payment and entry history stay reconciled.
--
-- Companion to anon_tv_entry_soft_delete_test.sql, which covers the ANON
-- surfaces. The views exercised here are authenticated-only, and their
-- protection is a row predicate in the view body -- NOT RLS: entries'
-- authenticated SELECT policy (entries_select) carries no deleted_at
-- predicate, so a missing predicate in the view is the whole exposure.
--
-- The first three views are asserted as the OWNER (no SET ROLE), not as
-- service_role. RLS is bypassed either way, which is the point -- it isolates
-- the view's own predicate from any policy that might mask a regression. But
-- service_role cannot read these views in a migrations-only rebuild: migration
-- 116 grants them to `authenticated` only, and NO migration grants
-- view_entry_with_results to anybody at all. The live database disguises this,
-- because ALTER DEFAULT PRIVILEGES in schema public hands service_role and
-- authenticated full CRUD on every new relation -- so a service_role assertion
-- passes against live and fails in CI.
--
-- view_stats_summary is asserted both directly and through two of its four
-- dependent views, because those inherit the predicate transitively rather
-- than declaring it -- a regression in the base view is invisible unless the
-- dependents are checked too.
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000181001', 'Soft Delete Views Club');

INSERT INTO public.shows (
  id, name, organization, start_date, end_date, club_id, status
)
VALUES (
  '00000000-0000-0000-0000-000000181002',
  'Soft Delete Views Show',
  'AKC',
  current_date,
  current_date + 1,
  '00000000-0000-0000-0000-000000181001',
  'published'
);

INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-000000181003',
  '00000000-0000-0000-0000-000000181002',
  'Soft Delete Views Trial',
  current_date
);

INSERT INTO public.classes (id, trial_id, name, status, element, level)
VALUES (
  '00000000-0000-0000-0000-000000181004',
  '00000000-0000-0000-0000-000000181003',
  'Container Novice',
  'in_progress',
  'Container',
  'Novice'
);

-- auth_user_id matters for view_authenticated_entry_results only: that view is
-- owner-run, so it resolves the caller through
-- private.entry_results_caller_context(), which maps auth.uid() to
-- people.auth_user_id. Handing this person the live entry and one tombstone
-- makes its is_own_entry branch true, while the third tombstone belongs to a
-- different owner and proves the owner-only exception.
INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  (
    '00000000-0000-0000-0000-000000181005',
    'Views',
    'Handler',
    '00000000-0000-0000-0000-000000181101'
  ),
  (
    '00000000-0000-0000-0000-000000181010',
    'Other',
    'Owner',
    '00000000-0000-0000-0000-000000181102'
  );

-- Three dogs for the same reason as anon_tv_entry_soft_delete_test.sql:
-- entries_dog_class_unique_idx is UNIQUE (dog_id, class_id) WHERE entry_status
-- NOT IN ('withdrawn','scratched') and does NOT exclude soft-deleted rows, so
-- each fixture entry uses its own dog. Same breed on purpose -- view_breed_stats
-- groups by dog_breed, so leaked tombstones show up as inflated totals.
INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES
  (
    '00000000-0000-0000-0000-000000181006',
    'Views Dog One',
    'Live',
    'Beagle',
    '00000000-0000-0000-0000-000000181005'
  ),
  (
    '00000000-0000-0000-0000-000000181009',
    'Views Dog Two',
    'Gone',
    'Beagle',
    '00000000-0000-0000-0000-000000181005'
  ),
  (
    '00000000-0000-0000-0000-000000181011',
    'Other Owner Dog',
    'Unowned',
    'Beagle',
    '00000000-0000-0000-0000-000000181010'
  );

-- Armbands MUST be numeric: view_myk9q_entries and view_stats_summary both
-- select e.armband::INTEGER, so a non-numeric armband fails the cast before
-- any soft-delete assertion is reached.
--
-- Both entries are scored and qualified: view_stats_summary filters
-- is_scored = true, and view_fastest_times additionally requires
-- result_status = 'qualified' AND search_time_seconds > 0.
-- `trg_entries_require_dog_registration` (20260828210000) refuses an entry whose dog
-- holds no registration for the trial's registry. These fixtures predate that rule
-- and are about something else entirely, so give every dog an AKC number -- every
-- trial in this file is AKC -- rather than reshaping the test around it.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC (American Kennel Club)', 'SR' || upper(substr(md5(d.id::text), 1, 8)), true
FROM public.dogs d
WHERE NOT EXISTS (
  SELECT 1 FROM public.dog_registrations r WHERE r.dog_id = d.id
);

INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband,
  is_in_ring, is_scored, result_status, search_time_seconds, final_placement
)
VALUES
  (
    '00000000-0000-0000-0000-000000181007',
    '00000000-0000-0000-0000-000000181006',
    '00000000-0000-0000-0000-000000181004',
    '00000000-0000-0000-0000-000000181002',
    '00000000-0000-0000-0000-000000181003',
    '00000000-0000-0000-0000-000000181005',
    'confirmed',
    '181001',
    false,
    true,
    'qualified',
    42.5,
    1
  ),
  (
    '00000000-0000-0000-0000-000000181008',
    '00000000-0000-0000-0000-000000181009',
    '00000000-0000-0000-0000-000000181004',
    '00000000-0000-0000-0000-000000181002',
    '00000000-0000-0000-0000-000000181003',
    '00000000-0000-0000-0000-000000181005',
    'confirmed',
    '181002',
    false,
    true,
    'qualified',
    30.0,
    2
  ),
  (
    '00000000-0000-0000-0000-000000181012',
    '00000000-0000-0000-0000-000000181011',
    '00000000-0000-0000-0000-000000181004',
    '00000000-0000-0000-0000-000000181002',
    '00000000-0000-0000-0000-000000181003',
    '00000000-0000-0000-0000-000000181010',
    'confirmed',
    '181003',
    false,
    true,
    'qualified',
    20.0,
    3
  );

UPDATE public.entries
SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000000181008';

UPDATE public.entries
SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000000181012';

-- Static contract: the predicate must live in each view's OWN top-level WHERE.
--
-- Anchoring matters. A naive `viewdef LIKE '%e.deleted_at is null%'` passes
-- view_authenticated_entry_results even when it is broken, twice over: the
-- pattern matches the `own_e.deleted_at` of its is_show_exhibitor subquery
-- (own_e ENDS WITH e), and that subquery decides who the CALLER is rather than
-- which row is returned. That false positive is why this gap survived an audit.
-- pg_get_viewdef's pretty form indents the top-level WHERE by exactly two
-- spaces, so slicing from there drops every nested clause; the regex then
-- refuses any alias whose name merely ends in `e`.
DO $$
DECLARE
  target_view text;
  view_body text;
  top_where text;
BEGIN
  FOREACH target_view IN ARRAY ARRAY[
    'view_entry_with_results',
    'view_myk9q_entries',
    'view_stats_summary',
    'view_authenticated_entry_results'
  ] LOOP
    view_body := lower(pg_get_viewdef(format('public.%I', target_view)::regclass, true));
    top_where := substring(view_body from E'\n  where .*$');

    IF top_where IS NULL THEN
      RAISE EXCEPTION
        'FAIL view % has no top-level WHERE clause at all', target_view;
    END IF;

    IF top_where !~ '(^|[^a-z0-9_.])e\.deleted_at is null' THEN
      RAISE EXCEPTION
        'FAIL view % top-level WHERE omits e.deleted_at IS NULL: %',
        target_view, top_where;
    END IF;
  END LOOP;
END;
$$;

-- Static contract: each view's security_invoker setting.
--
-- This is the assertion that was missing when 20260817170000 shipped.
-- CREATE OR REPLACE VIEW does not preserve reloptions -- with no WITH clause it
-- RESETS them -- so that migration silently flipped all three invoker views to
-- owner-run. Owner-run means the caller's policies are never consulted AND no
-- base-column privileges are required, and since these views are owned by a
-- BYPASSRLS role and `authenticated` holds grants on them from ALTER DEFAULT
-- PRIVILEGES, every authenticated user could read every entry platform-wide
-- until 20260817190000 restored the setting.
--
-- Row assertions cannot catch this: they run as the owner (or as a caller the
-- fixture deliberately authorizes), so they pass either way. Only the metadata
-- is evidence. A NULL reloptions is the dangerous case, not an absent one --
-- security_invoker defaults to FALSE -- so the check below folds NULL to false
-- rather than skipping it.
DO $$
DECLARE
  rec record;
  actual boolean;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('view_entry_with_results', true),
      ('view_myk9q_entries', true),
      ('view_stats_summary', true),
      -- Owner-run on purpose: this view applies its own per-caller column
      -- masking, which it could not do under the caller's privileges.
      ('view_authenticated_entry_results', false)
    ) AS t(view_name, expected_invoker)
  LOOP
    SELECT coalesce(
             (
               SELECT opt
               FROM unnest(c.reloptions) AS opt
               WHERE opt LIKE 'security_invoker=%'
             ) = 'security_invoker=true',
             false
           )
    INTO actual
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = rec.view_name;

    IF actual IS DISTINCT FROM rec.expected_invoker THEN
      RAISE EXCEPTION
        'FAIL view % resolves security_invoker to %, expected % -- a rebuild without an explicit WITH clause resets it',
        rec.view_name, actual, rec.expected_invoker;
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  live_entry_id uuid := '00000000-0000-0000-0000-000000181007';
  own_deleted_entry_id uuid := '00000000-0000-0000-0000-000000181008';
  v_show_id uuid := '00000000-0000-0000-0000-000000181002';
  v_class_id uuid := '00000000-0000-0000-0000-000000181004';
  entry_results_ids uuid[];
  myk9q_ids uuid[];
  stats_ids uuid[];
  fastest_ids uuid[];
  breed_total bigint;
BEGIN
  -- 1. view_entry_with_results -- read by the AskQ tool executor, which
  -- ask-myk9show hands the service-role client. Those reads bypass RLS, so the
  -- view body is the only thing standing between a tombstone and an assistant
  -- answer.
  SELECT array_agg(v.id ORDER BY v.id)
  INTO entry_results_ids
  FROM public.view_entry_with_results AS v
  WHERE v.show_id = v_show_id;

  IF entry_results_ids IS DISTINCT FROM ARRAY[live_entry_id] THEN
    RAISE EXCEPTION
      'FAIL view_entry_with_results returned %, expected only the live entry',
      entry_results_ids;
  END IF;

  -- 2. view_myk9q_entries -- legacy compatibility feed. It exposes no
  -- deleted_at column, so a consumer cannot filter tombstones itself.
  SELECT array_agg(v.id ORDER BY v.id)
  INTO myk9q_ids
  FROM public.view_myk9q_entries AS v
  WHERE v.show_id = v_show_id;

  IF myk9q_ids IS DISTINCT FROM ARRAY[live_entry_id] THEN
    RAISE EXCEPTION
      'FAIL view_myk9q_entries returned %, expected only the live entry',
      myk9q_ids;
  END IF;

  -- 3. view_stats_summary -- the base stats view.
  SELECT array_agg(v.entry_id ORDER BY v.entry_id)
  INTO stats_ids
  FROM public.view_stats_summary AS v
  WHERE v.show_id = v_show_id;

  IF stats_ids IS DISTINCT FROM ARRAY[live_entry_id] THEN
    RAISE EXCEPTION
      'FAIL view_stats_summary returned %, expected only the live entry',
      stats_ids;
  END IF;

  -- 4. view_fastest_times -- inherits the predicate through
  -- view_stats_summary. A tombstone here would also outrank the live entry,
  -- since the deleted dog posted the faster time.
  SELECT array_agg(v.entry_id ORDER BY v.entry_id)
  INTO fastest_ids
  FROM public.view_fastest_times AS v
  WHERE v.show_id = v_show_id;

  IF fastest_ids IS DISTINCT FROM ARRAY[live_entry_id] THEN
    RAISE EXCEPTION
      'FAIL view_fastest_times returned %, expected only the live entry',
      fastest_ids;
  END IF;

  -- 5. view_breed_stats -- same inheritance, but aggregated. A leaked
  -- tombstone is invisible as a row here and shows up only as a wrong count.
  SELECT v.total_entries
  INTO breed_total
  FROM public.view_breed_stats AS v
  WHERE v.show_id = v_show_id AND v.class_id = v_class_id;

  IF breed_total IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION
      'FAIL view_breed_stats counted % entries, expected only the live entry',
      breed_total;
  END IF;

  RAISE NOTICE
    'PASS entry, myK9Q and stats views (incl. dependents) exclude soft-deleted entries';
END;
$$;

-- view_authenticated_entry_results is security_invoker = false, so it runs as
-- its owner and its rows are gated on the CALLER's identity rather than on RLS.
-- Asserting it as service_role would be vacuous: with no JWT the access flags
-- are all false and the view returns nothing, which no broken predicate could
-- fail. Switch to a real authenticated caller instead -- which this view, unlike
-- the three above, does grant explicitly (20260802120001), so it works in a
-- migrations-only rebuild.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000181101', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000181101","role":"authenticated"}',
  true
);

DO $$
DECLARE
  live_entry_id uuid := '00000000-0000-0000-0000-000000181007';
  own_deleted_entry_id uuid := '00000000-0000-0000-0000-000000181008';
  v_show_id uuid := '00000000-0000-0000-0000-000000181002';
  authenticated_ids uuid[];
BEGIN
  SELECT array_agg(v.id ORDER BY v.id)
  INTO authenticated_ids
  FROM public.view_authenticated_entry_results AS v
  WHERE v.show_id = v_show_id;

  -- A null result means the fixture stopped granting access, not that the
  -- filter works -- fail loudly rather than passing an empty set.
  IF authenticated_ids IS NULL THEN
    RAISE EXCEPTION
      'FAIL fixture caller sees no entries at all; the assertion below would be vacuous';
  END IF;

  IF authenticated_ids IS DISTINCT FROM ARRAY[live_entry_id, own_deleted_entry_id] THEN
    RAISE EXCEPTION
      'FAIL view_authenticated_entry_results returned %, expected the live entry and the caller-owned cancelled entry',
      authenticated_ids;
  END IF;

  RAISE NOTICE
    'PASS view_authenticated_entry_results keeps the caller-owned cancelled entry while excluding other tombstones';
END;
$$;

ROLLBACK;
