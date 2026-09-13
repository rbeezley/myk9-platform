-- MYK9-474 behavioral contract: get_show_judges publishes judge NAMES for a published show to
-- anon, withholds everything about a non-public show, and cannot expose an email.
--
-- The defect this replaces was a silent null, so the load-bearing assertion here is a POSITIVE
-- one: anon must actually get a name back. A test that only checked "the draft show is hidden"
-- would have passed against the broken embed too, which returned null for every show.
--
-- All fixtures roll back. No sequence is consumed.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('secretary', 'MYK9-474 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000474001', 'MYK9-474 Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000474011', 'Marie',  'Kowalski', 'myk9-474-judge-pub@example.test', NULL),
  ('00000000-0000-0000-0000-000000474012', 'Devraj', 'Anand',    'myk9-474-judge-draft@example.test', NULL),
  -- Soft-deleted judge on the published show: get_show_officials filters pe.deleted_at, so this
  -- one does too, and the filter needs a row to act on.
  ('00000000-0000-0000-0000-000000474013', 'Removed', 'Person',  'myk9-474-judge-gone@example.test', NULL);

UPDATE public.people SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000474013';

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000000474021', 'MYK9-474 Published', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000000474001', 'published'),
  ('00000000-0000-0000-0000-000000474022', 'MYK9-474 Draft',     'AKC', current_date, current_date, '00000000-0000-0000-0000-000000474001', 'draft');

SET LOCAL ROLE service_role;

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000474031', '00000000-0000-0000-0000-000000474021', 'MYK9-474 Pub Trial',   current_date),
  ('00000000-0000-0000-0000-000000474032', '00000000-0000-0000-0000-000000474022', 'MYK9-474 Draft Trial', current_date);

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000000474041', '00000000-0000-0000-0000-000000474031', 'MYK9-474 Pub Class'),
  ('00000000-0000-0000-0000-000000474042', '00000000-0000-0000-0000-000000474032', 'MYK9-474 Draft Class');

INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status)
VALUES
  ('00000000-0000-0000-0000-000000474051', '00000000-0000-0000-0000-000000474011', '00000000-0000-0000-0000-000000474021', '00000000-0000-0000-0000-000000474031', '00000000-0000-0000-0000-000000474041', 'confirmed'),
  ('00000000-0000-0000-0000-000000474052', '00000000-0000-0000-0000-000000474013', '00000000-0000-0000-0000-000000474021', '00000000-0000-0000-0000-000000474031', '00000000-0000-0000-0000-000000474041', 'confirmed'),
  ('00000000-0000-0000-0000-000000474053', '00000000-0000-0000-0000-000000474012', '00000000-0000-0000-0000-000000474022', '00000000-0000-0000-0000-000000474032', '00000000-0000-0000-0000-000000474042', 'confirmed');

RESET ROLE;

DO $$
DECLARE
  pub_show   uuid := '00000000-0000-0000-0000-000000474021';
  draft_show uuid := '00000000-0000-0000-0000-000000474022';
  pub_class  uuid := '00000000-0000-0000-0000-000000474041';
  n integer;
  nm text;
BEGIN
  ------------------------------------------------------------------
  -- The projection cannot carry an email, structurally
  ------------------------------------------------------------------
  -- This is the property that makes the RPC preferable to an anon-visible people policy: there
  -- is no email column to revoke and none to accidentally re-add. Assert the shape, not a grant.
  SELECT count(*) INTO n
  FROM information_schema.routines r
  JOIN information_schema.parameters p
    ON p.specific_name = r.specific_name AND p.parameter_mode = 'OUT'
  WHERE r.routine_schema = 'public'
    AND r.routine_name = 'get_show_judges'
    AND lower(p.parameter_name) LIKE '%email%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL get_show_judges gained % email-shaped OUT column(s). The whole point of '
      'this RPC over an anon people policy is that email is structurally unreachable.', n;
  END IF;

  ------------------------------------------------------------------
  -- anon
  ------------------------------------------------------------------
  SET LOCAL ROLE anon;

  -- THE POSITIVE ASSERTION. The bug being fixed was a silent null, so this is the one that
  -- matters: a real name must come back for a published show.
  SELECT count(*) INTO n FROM public.get_show_judges(pub_show);
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL anon got % judge row(s) for the PUBLISHED show, want 1 (the '
      'soft-deleted judge is excluded, the live one is not)', n;
  END IF;

  SELECT trim(first_name || ' ' || last_name) INTO nm
  FROM public.get_show_judges(pub_show);
  IF nm IS DISTINCT FROM 'Marie Kowalski' THEN
    RAISE EXCEPTION 'FAIL anon got judge name %, want "Marie Kowalski" — a null or blank here is '
      'the original MYK9-474 defect', nm;
  END IF;

  -- The class mapping the TV board keys on must be populated, or the board still shows nothing.
  SELECT count(*) INTO n FROM public.get_show_judges(pub_show) WHERE class_id = pub_class;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL anon got % row(s) carrying the class_id the TV board maps by, want 1', n;
  END IF;

  -- A non-public show reaches anon not at all, matching the MYK9-469 boundary on
  -- judge_assignments itself.
  SELECT count(*) INTO n FROM public.get_show_judges(draft_show);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL anon got % judge row(s) for a DRAFT show', n;
  END IF;

  -- And the RPC must not have become a back door to the table it reads: anon still sees no
  -- people rows directly. If this ever passes rows, the column allowlist is the only guard left
  -- on people.email (MYK9-473) and this RPC's whole rationale is void.
  SELECT count(*) INTO n FROM public.people;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL anon can now read % people row(s) directly — get_show_judges was '
      'chosen precisely so that stays zero', n;
  END IF;

  RESET ROLE;

  ------------------------------------------------------------------
  -- A signed-in user with no role: same public view, no more
  ------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.get_show_judges(pub_show);
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL an ordinary authenticated user got % judge row(s) for the published '
      'show, want 1', n;
  END IF;
  SELECT count(*) INTO n FROM public.get_show_judges(draft_show);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL an ordinary authenticated user got % judge row(s) for a DRAFT show', n;
  END IF;

  RESET ROLE;

  RAISE NOTICE 'PASS MYK9-474: anon reads the judge name and class mapping for a published show, '
    'the soft-deleted judge and the draft show are withheld, people stays unreadable to anon, '
    'and the projection has no email column';
END;
$$;

ROLLBACK;
