-- MYK9-469 / SA-2026-09-12-01 behavioral contract: the four PUBLIC `SELECT ... USING (true)`
-- policies now scope by show publication state (judge_assignments, armbands), by dog visibility
-- (achievements), and by the table's own is_public flag (show_templates).
--
-- Each assertion has a matching POSITIVE control on the same relation and the same caller, so a
-- policy that denied everything would fail this test rather than pass it. That pairing is the
-- point: "anon sees 0 draft rows" is satisfied just as well by a broken policy.
--
-- All fixtures roll back. No sequence is consumed by these tables (uuid PKs), so the rollback is
-- complete — unlike ringside_containment_test.sql, whose nextval() survives ROLLBACK.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('secretary', 'MYK9-469 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000469001', 'MYK9-469 Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000469011', 'MYK9-469', 'Secretary', 'myk9-469-sec@example.test', NULL),
  ('00000000-0000-0000-0000-000000469012', 'MYK9-469', 'Judge',     'myk9-469-judge@example.test', NULL),
  ('00000000-0000-0000-0000-000000469013', 'MYK9-469', 'Owner',     'myk9-469-owner@example.test', NULL),
  ('00000000-0000-0000-0000-000000469014', 'MYK9-469', 'Stranger',  'myk9-469-stranger@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000469101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-469-sec@example.test',      '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000469102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-469-judge@example.test',    '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000469103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-469-owner@example.test',    '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000469104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-469-stranger@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people AS person
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000469011'::uuid, '00000000-0000-0000-0000-000000469101'::uuid),
  ('00000000-0000-0000-0000-000000469012'::uuid, '00000000-0000-0000-0000-000000469102'::uuid),
  ('00000000-0000-0000-0000-000000469013'::uuid, '00000000-0000-0000-0000-000000469103'::uuid),
  ('00000000-0000-0000-0000-000000469014'::uuid, '00000000-0000-0000-0000-000000469104'::uuid)
) AS fixture(person_id, auth_id)
WHERE person.id = fixture.person_id;

-- Club-scoped secretary appointment (a show-scoped user_roles row grants nothing).
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000469011', roles.id,
  '00000000-0000-0000-0000-000000469001', true,
  '00000000-0000-0000-0000-000000469101'
FROM public.roles
WHERE roles.name = 'secretary';

-- Two shows in the SAME club: one public, one draft. The published show is the positive control
-- for every "anon cannot see the draft" assertion.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000000469002', 'MYK9-469 Published', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000000469001', 'published'),
  ('00000000-0000-0000-0000-000000469003', 'MYK9-469 Draft',     'AKC', current_date, current_date, '00000000-0000-0000-0000-000000469001', 'draft');

SET LOCAL ROLE service_role;

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000469021', '00000000-0000-0000-0000-000000469002', 'MYK9-469 Pub Trial',   current_date),
  ('00000000-0000-0000-0000-000000469022', '00000000-0000-0000-0000-000000469003', 'MYK9-469 Draft Trial', current_date);

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000000469031', '00000000-0000-0000-0000-000000469021', 'MYK9-469 Pub Class'),
  ('00000000-0000-0000-0000-000000469032', '00000000-0000-0000-0000-000000469022', 'MYK9-469 Draft Class');

INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status)
VALUES
  ('00000000-0000-0000-0000-000000469041', '00000000-0000-0000-0000-000000469012', '00000000-0000-0000-0000-000000469002', '00000000-0000-0000-0000-000000469021', '00000000-0000-0000-0000-000000469031', 'confirmed'),
  ('00000000-0000-0000-0000-000000469042', '00000000-0000-0000-0000-000000469012', '00000000-0000-0000-0000-000000469003', '00000000-0000-0000-0000-000000469022', '00000000-0000-0000-0000-000000469032', 'confirmed');

INSERT INTO public.dogs (id, call_name, breed, owner_id)
VALUES ('00000000-0000-0000-0000-000000469051', 'MYK9-469 Dog', 'Labrador Retriever', '00000000-0000-0000-0000-000000469013');

INSERT INTO public.armbands (id, show_id, armband_number, dog_id)
VALUES
  ('00000000-0000-0000-0000-000000469061', '00000000-0000-0000-0000-000000469002', '469-PUB',   '00000000-0000-0000-0000-000000469051'),
  ('00000000-0000-0000-0000-000000469062', '00000000-0000-0000-0000-000000469003', '469-DRAFT', '00000000-0000-0000-0000-000000469051');

INSERT INTO public.achievements (id, dog_id, title, organization, sport)
VALUES ('00000000-0000-0000-0000-000000469071', '00000000-0000-0000-0000-000000469051', 'MYK9-469 Title', 'AKC', 'Scent Work');

INSERT INTO public.show_templates (id, name, show_type, club_id, is_public)
VALUES
  ('00000000-0000-0000-0000-000000469081', 'MYK9-469 Public Template',  'scent_work', '00000000-0000-0000-0000-000000469001', true),
  ('00000000-0000-0000-0000-000000469082', 'MYK9-469 Private Template', 'scent_work', '00000000-0000-0000-0000-000000469001', false),
  ('00000000-0000-0000-0000-000000469083', 'MYK9-469 Null-Flag Template', 'scent_work', '00000000-0000-0000-0000-000000469001', NULL);

RESET ROLE;

DO $$
DECLARE
  secretary uuid := '00000000-0000-0000-0000-000000469101';
  judge     uuid := '00000000-0000-0000-0000-000000469102';
  owner     uuid := '00000000-0000-0000-0000-000000469103';
  stranger  uuid := '00000000-0000-0000-0000-000000469104';
  pub_show   uuid := '00000000-0000-0000-0000-000000469002';
  draft_show uuid := '00000000-0000-0000-0000-000000469003';
  dog        uuid := '00000000-0000-0000-0000-000000469051';
  n integer;
BEGIN
  ------------------------------------------------------------------
  -- anon
  ------------------------------------------------------------------
  SET LOCAL ROLE anon;

  -- judge_assignments: positive control FIRST, so a deny-everything policy fails here.
  SELECT count(*) INTO n FROM public.judge_assignments WHERE show_id = pub_show;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL anon lost judge_assignments for the PUBLISHED show (got %, want 1)', n;
  END IF;
  SELECT count(*) INTO n FROM public.judge_assignments WHERE show_id = draft_show;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL anon read % judge_assignments row(s) for the DRAFT show', n;
  END IF;

  -- armbands
  SELECT count(*) INTO n FROM public.armbands WHERE show_id = pub_show;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL anon lost armbands for the PUBLISHED show (got %, want 1)', n;
  END IF;
  SELECT count(*) INTO n FROM public.armbands WHERE show_id = draft_show;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL anon read % armband row(s) for the DRAFT show', n;
  END IF;

  -- achievements: no public dog surface exists, so anon gets nothing at all. The positive
  -- control for this relation is the owner read further down.
  SELECT count(*) INTO n FROM public.achievements WHERE dog_id = dog;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL anon read % achievement row(s)', n;
  END IF;

  -- show_templates: is_public IS TRUE only; a NULL flag must fail closed.
  SELECT count(*) INTO n FROM public.show_templates WHERE id = '00000000-0000-0000-0000-000000469081';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL anon lost the is_public=true show_template (got %, want 1)', n;
  END IF;
  SELECT count(*) INTO n FROM public.show_templates
   WHERE id IN ('00000000-0000-0000-0000-000000469082', '00000000-0000-0000-0000-000000469083');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL anon read % non-public show_template row(s) (NULL flag must fail closed)', n;
  END IF;

  RESET ROLE;

  ------------------------------------------------------------------
  -- the assigned judge: must see their OWN assignment on a draft show,
  -- which is how an invitation is accepted before the show publishes
  ------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', judge::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', judge, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.judge_assignments WHERE show_id = draft_show;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL assigned judge cannot see their own DRAFT-show assignment (got %, want 1)', n;
  END IF;

  ------------------------------------------------------------------
  -- the club's secretary: must retain the draft show they are building
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', secretary::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', secretary, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.judge_assignments WHERE show_id = draft_show;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL club secretary lost judge_assignments on their own DRAFT show (got %, want 1)', n;
  END IF;
  SELECT count(*) INTO n FROM public.armbands WHERE show_id = draft_show;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL club secretary lost armbands on their own DRAFT show (got %, want 1)', n;
  END IF;
  SELECT count(*) INTO n FROM public.show_templates WHERE id = '00000000-0000-0000-0000-000000469082';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL club secretary lost their own private show_template (got %, want 1)', n;
  END IF;

  ------------------------------------------------------------------
  -- the dog's owner: achievements positive control
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', owner::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.achievements WHERE dog_id = dog;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL dog owner cannot read their own dog''s achievements (got %, want 1)', n;
  END IF;

  ------------------------------------------------------------------
  -- an unrelated signed-in user: holds no role, owns no dog
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', stranger::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', stranger, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.judge_assignments WHERE show_id = draft_show;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL unrelated user read % DRAFT-show judge_assignments row(s)', n;
  END IF;
  SELECT count(*) INTO n FROM public.achievements WHERE dog_id = dog;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL unrelated user read % achievement row(s) for a dog they cannot see', n;
  END IF;
  -- ...but the published show is still public to them.
  SELECT count(*) INTO n FROM public.judge_assignments WHERE show_id = pub_show;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL unrelated user lost PUBLISHED-show judge_assignments (got %, want 1)', n;
  END IF;

  RESET ROLE;

  RAISE NOTICE 'PASS MYK9-469 row scope: anon and unrelated callers are held to published shows and visible dogs, while the assigned judge, the club secretary and the dog owner keep their reads';
END;
$$;

ROLLBACK;
