-- MYK9-149 / SA-2026-07-29-08 behavioral contract.
-- A soft-deleted entry in an otherwise public show must be absent from every
-- public entry surface, while a live entry in that same show remains visible.
-- All fixtures roll back.

BEGIN;

SET LOCAL ROLE service_role;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000149001', 'MYK9-149 TV Club');

INSERT INTO public.shows (
  id, name, organization, start_date, end_date, club_id, status
)
VALUES (
  '00000000-0000-0000-0000-000000149002',
  'MYK9-149 TV Show',
  'AKC',
  current_date,
  current_date + 1,
  '00000000-0000-0000-0000-000000149001',
  'published'
);

INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-000000149003',
  '00000000-0000-0000-0000-000000149002',
  'MYK9-149 Trial',
  current_date
);

INSERT INTO public.classes (id, trial_id, name, status)
VALUES (
  '00000000-0000-0000-0000-000000149004',
  '00000000-0000-0000-0000-000000149003',
  'Container Novice',
  'in_progress'
);

INSERT INTO public.people (id, first_name, last_name)
VALUES ('00000000-0000-0000-0000-000000149005', 'TV', 'Handler');

-- Two dogs, because entries_dog_class_unique_idx is
-- UNIQUE (dog_id, class_id) WHERE entry_status NOT IN ('withdrawn','scratched').
-- It does NOT exclude soft-deleted rows, so two 'confirmed' entries for one dog
-- in one class collide on INSERT, before the soft-delete below ever runs.
INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES
  (
    '00000000-0000-0000-0000-000000149006',
    'TV Dog',
    'TV',
    'Beagle',
    '00000000-0000-0000-0000-000000149005'
  ),
  (
    '00000000-0000-0000-0000-000000149009',
    'TV Dog Two',
    'TV2',
    'Beagle',
    '00000000-0000-0000-0000-000000149005'
  );

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
  is_in_ring, is_scored
)
VALUES
  (
    '00000000-0000-0000-0000-000000149007',
    '00000000-0000-0000-0000-000000149006',
    '00000000-0000-0000-0000-000000149004',
    '00000000-0000-0000-0000-000000149002',
    '00000000-0000-0000-0000-000000149003',
    '00000000-0000-0000-0000-000000149005',
    'confirmed',
    '149-live',
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000149008',
    '00000000-0000-0000-0000-000000149009',
    '00000000-0000-0000-0000-000000149004',
    '00000000-0000-0000-0000-000000149002',
    '00000000-0000-0000-0000-000000149003',
    '00000000-0000-0000-0000-000000149005',
    'confirmed',
    '149-deleted',
    false,
    false
  );

UPDATE public.entries
SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000000149008';

DO $$
DECLARE
  policy_qual text;
BEGIN
  SELECT policy.qual
  INTO policy_qual
  FROM pg_policies AS policy
  WHERE policy.schemaname = 'public'
    AND policy.tablename = 'entries'
    AND policy.policyname = 'entries_anon_select_for_tv';

  IF policy_qual IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'entries'
      AND policy.policyname = 'entries_anon_select_for_tv'
      AND policy.cmd = 'SELECT'
      AND 'anon' = ANY(policy.roles)
      AND regexp_count(lower(policy.qual), 'deleted_at') >= 2
      AND lower(policy.qual) LIKE '%status%'
  ) THEN
    RAISE EXCEPTION
      'FAIL applied anon TV policy does not include both entry and show soft-delete predicates: %',
      policy_qual;
  END IF;
END;
$$;

SET LOCAL ROLE anon;

DO $$
DECLARE
  live_entry_id uuid := '00000000-0000-0000-0000-000000149007';
  deleted_entry_id uuid := '00000000-0000-0000-0000-000000149008';
  v_show_id uuid := '00000000-0000-0000-0000-000000149002';
  v_class_id uuid := '00000000-0000-0000-0000-000000149004';
  visible_ids uuid[];
  tv_ids uuid[];
  public_view_ids uuid[];
  tv_entry_count bigint;
  protected_value text;
  protected_column text;
BEGIN
  -- Base REST table read: both a cold lookup by id and a show-scoped query
  -- must hide the tombstone while retaining the live row.
  SELECT array_agg(e.id ORDER BY e.id)
  INTO visible_ids
  FROM public.entries AS e
  WHERE e.show_id = v_show_id;

  IF visible_ids IS DISTINCT FROM ARRAY[live_entry_id] THEN
    RAISE EXCEPTION
      'FAIL anon TV read returned %, expected only the live entry', visible_ids;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.entries AS e
    WHERE e.id = deleted_entry_id
  ) THEN
    RAISE EXCEPTION 'FAIL cold anon lookup returned a soft-deleted entry';
  END IF;

  -- The TV running order and canonical total are SECURITY DEFINER RPCs, so
  -- assert the public runtime path independently of the base-table policy.
  SELECT array_agg(board.id ORDER BY board.id)
  INTO tv_ids
  FROM public.tv_board_entries(v_show_id, ARRAY[v_class_id]::uuid[]) AS board;

  IF tv_ids IS DISTINCT FROM ARRAY[live_entry_id] THEN
    RAISE EXCEPTION
      'FAIL TV board returned %, expected only the live entry', tv_ids;
  END IF;

  SELECT counts.entry_count
  INTO tv_entry_count
  FROM public.tv_class_entry_counts(v_show_id, ARRAY[v_class_id]::uuid[]) AS counts
  WHERE counts.class_id = v_class_id;

  IF tv_entry_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION
      'FAIL TV count returned %, expected one live entry', tv_entry_count;
  END IF;

  -- Public results are served through the release-gated view rather than the
  -- base table. It must apply its own row predicate because owner-run views do
  -- not inherit the caller's RLS policy.
  SELECT array_agg(results.id ORDER BY results.id)
  INTO public_view_ids
  FROM public.view_public_entry_results AS results
  WHERE results.show_id = v_show_id;

  IF public_view_ids IS DISTINCT FROM ARRAY[live_entry_id] THEN
    RAISE EXCEPTION
      'FAIL public results view returned %, expected only the live entry', public_view_ids;
  END IF;

  -- Keep the column-level anon boundary intact while exercising the same
  -- public role as the REST, TV, and public-results checks above.
  FOREACH protected_column IN ARRAY ARRAY[
    'payment_status',
    'entry_fee',
    'total_score',
    'final_placement',
    'judge_notes'
  ] LOOP
    protected_value := NULL;
    BEGIN
      EXECUTE format(
        'SELECT %I::text FROM public.entries WHERE id = $1',
        protected_column
      ) INTO protected_value USING live_entry_id;
      RAISE EXCEPTION
        'FAIL anon can read protected entries column %', protected_column;
    EXCEPTION
      WHEN insufficient_privilege THEN
        NULL;
    END;
  END LOOP;

  RAISE NOTICE
    'PASS anon REST, TV, public-view, and protected-column reads exclude soft-deleted entries';
END;
$$;

-- ===========================================================================
-- MYK9-404 / SA-2026-09-05-07: the same tombstone rule, one and two levels up.
--
-- view_public_entry_results guarded the ENTRY and the SHOW but not the CLASS or
-- the TRIAL between them, so soft-deleting a class left its entries publicly
-- readable with their released results. The view is security_invoker = false and
-- owned by a BYPASSRLS role, so its WHERE clause is the only guard — no policy
-- was ever going to catch this.
--
-- Each level is asserted against a POSITIVE CONTROL on the same row: the live
-- entry must be visible first, then vanish when its parent is tombstoned, then
-- come back when the tombstone is lifted. An absence assertion on its own
-- cannot tell "correctly filtered" from "never visible in the first place".
-- ===========================================================================

RESET ROLE;
SET LOCAL ROLE service_role;

DO $$
DECLARE
  live_entry CONSTANT uuid := '00000000-0000-0000-0000-000000149007';
  the_class  CONSTANT uuid := '00000000-0000-0000-0000-000000149004';
  the_trial  CONSTANT uuid := '00000000-0000-0000-0000-000000149003';
  visible boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.view_public_entry_results WHERE id = live_entry)
    INTO visible;
  IF NOT visible THEN
    RAISE EXCEPTION 'FAIL positive control: the live entry is not publicly visible to begin with';
  END IF;

  UPDATE public.classes SET deleted_at = now() WHERE id = the_class;
  SELECT EXISTS (SELECT 1 FROM public.view_public_entry_results WHERE id = live_entry)
    INTO visible;
  IF visible THEN
    RAISE EXCEPTION 'FAIL an entry of a soft-deleted CLASS is still publicly readable';
  END IF;

  UPDATE public.classes SET deleted_at = NULL WHERE id = the_class;
  SELECT EXISTS (SELECT 1 FROM public.view_public_entry_results WHERE id = live_entry)
    INTO visible;
  IF NOT visible THEN
    RAISE EXCEPTION 'FAIL restoring the class did not restore the entry — the predicate is not the class tombstone';
  END IF;

  UPDATE public.trials SET deleted_at = now() WHERE id = the_trial;
  SELECT EXISTS (SELECT 1 FROM public.view_public_entry_results WHERE id = live_entry)
    INTO visible;
  IF visible THEN
    RAISE EXCEPTION 'FAIL an entry of a soft-deleted TRIAL is still publicly readable';
  END IF;

  UPDATE public.trials SET deleted_at = NULL WHERE id = the_trial;
  SELECT EXISTS (SELECT 1 FROM public.view_public_entry_results WHERE id = live_entry)
    INTO visible;
  IF NOT visible THEN
    RAISE EXCEPTION 'FAIL restoring the trial did not restore the entry';
  END IF;

  RAISE NOTICE 'PASS the public results view follows class and trial tombstones, both directions';
END;
$$;

-- The guard above is only the guard while the view stays owner-run. A bare
-- CREATE OR REPLACE VIEW wipes reloptions and security_invoker silently reverts
-- to its default — which is the value this view wants, so the mistake would look
-- harmless here and did not elsewhere (20260817170000's sibling handed every
-- authenticated user judge_notes and payment_status that way). Assert the
-- metadata, folding a NULL reloptions to false rather than skipping it.
DO $$
DECLARE
  invoker text;
BEGIN
  SELECT coalesce(
           (SELECT option_value
              FROM pg_options_to_table(c.reloptions)
             WHERE option_name = 'security_invoker'),
           'false')
    INTO invoker
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'view_public_entry_results';

  IF invoker IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION
      'FAIL view_public_entry_results is no longer owner-run (security_invoker = %)', invoker;
  END IF;

  RAISE NOTICE 'PASS view_public_entry_results kept security_invoker = false';
END;
$$;

RESET ROLE;
ROLLBACK;
