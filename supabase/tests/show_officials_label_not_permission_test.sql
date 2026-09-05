-- show_officials: the name on the paperwork, and nothing else.
--
-- Phase 2 of docs/plan-secretary-permission-model.md. Before it, a show-scoped
-- user_roles row did two jobs at once — it recorded who was named on the show AND it
-- granted access — so "appointment is the only thing that grants access" was true of
-- the club path and false of this one.
--
-- The two halves are asserted separately here on purpose, because the failure this
-- guards against is one half silently following the other: naming that still grants,
-- or a split that quietly drops the Trial Secretary off the printed entry form.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000240001', 'Show Officials Test Club');

-- Fixture order matters here, and both orders fail differently. role_requests
-- .auth_user_id has an FK to auth.users, so the auth rows are required. But
-- inserting auth.users first links a people row automatically, and an explicit
-- people insert then collides on people_auth_user_id_key; while inserting people
-- WITH an auth_user_id and no email trips the sign-in email invariant. So:
-- people first carrying the email, then auth.users, then adopt the ids -- the
-- same order judge_assignment_private_read_test.sql uses.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000240011', 'Officials', 'Club Admin', 'officials-club-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000000240012', 'Officials', 'Appointed Secretary', 'officials-appointed@example.test', NULL),
  -- Named on the paperwork and appointed nowhere. Under the old model this person had
  -- full access to the show; now they have none, and that is the point.
  ('00000000-0000-0000-0000-000000240013', 'Officials', 'Named Only', 'officials-named-only@example.test', NULL),
  ('00000000-0000-0000-0000-000000240014', 'Officials', 'Requester', 'officials-requester@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000240101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'officials-club-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000240102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'officials-appointed@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000240103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'officials-named-only@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000240104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'officials-requester@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

-- Idempotent: if the auth.users insert already adopted these people by email,
-- this sets what is already set rather than fighting it.
UPDATE public.people AS person
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000240011'::uuid, '00000000-0000-0000-0000-000000240101'::uuid),
  ('00000000-0000-0000-0000-000000240012'::uuid, '00000000-0000-0000-0000-000000240102'::uuid),
  ('00000000-0000-0000-0000-000000240013'::uuid, '00000000-0000-0000-0000-000000240103'::uuid),
  ('00000000-0000-0000-0000-000000240014'::uuid, '00000000-0000-0000-0000-000000240104'::uuid)
) AS fixture(person_id, auth_id)
WHERE person.id = fixture.person_id
  AND person.auth_user_id IS DISTINCT FROM fixture.auth_id;

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000240003',
  'Show Officials Test Show',
  'AKC',
  current_date,
  current_date,
  '00000000-0000-0000-0000-000000240001',
  'published'
);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000240011', r.id,
       '00000000-0000-0000-0000-000000240001', true,
       '00000000-0000-0000-0000-000000240101'
FROM public.roles r WHERE r.name = 'club_admin';

-- The ACL question, asked before any behaviour: a new public table gets anon full CRUD
-- from ALTER DEFAULT PRIVILEGES unless the migration revokes it, and the migration text
-- reading correctly has not been enough here before.
DO $$
DECLARE
  v_anon_privs text;
BEGIN
  -- pg_class.relacl, NOT information_schema.role_table_grants: that view only shows
  -- grants visible to the querying role, so an empty result there cannot distinguish
  -- "anon has nothing" from "this role cannot see anon's grants".
  SELECT string_agg(acl, ' ') INTO v_anon_privs
  FROM (
    SELECT unnest(relacl)::text AS acl
    FROM pg_class WHERE oid = 'public.show_officials'::regclass
  ) entries
  WHERE acl LIKE 'anon=%';

  IF v_anon_privs IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL anon holds % on show_officials', v_anon_privs;
  END IF;

  -- Column-level grants are a separate ACL a table-level check cannot see.
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a, unnest(a.attacl) AS col_acl
    WHERE a.attrelid = 'public.show_officials'::regclass
      AND a.attacl IS NOT NULL
      AND col_acl::text LIKE 'anon=%'
  ) THEN
    RAISE EXCEPTION 'FAIL anon holds a column-level grant on show_officials';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'public.show_officials'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'FAIL show_officials does not have RLS enabled';
  END IF;

  -- The TABLE excludes anon, but the READER must not: SA-006 grants anon execute
  -- on get_show_officials so the public show overview can render its officials
  -- card, and rewriting that function is exactly how the grant gets dropped by
  -- accident. Codex caught that on this migration; this pins it.
  IF NOT has_function_privilege('anon', 'public.get_show_officials(uuid)', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon lost execute on get_show_officials (SA-006 public officials card)';
  END IF;

  RAISE NOTICE 'PASS show_officials excludes anon while its public reader keeps execute';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000240101', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000240101","role":"authenticated"}',
  true
);

SELECT public.grant_club_secretary(
  '00000000-0000-0000-0000-000000240012',
  '00000000-0000-0000-0000-000000240001'
);

SELECT public.grant_show_official(
  '00000000-0000-0000-0000-000000240013',
  'secretary',
  '00000000-0000-0000-0000-000000240003'
);

DO $$
BEGIN
  -- 1. Naming grants nothing. Every helper, because it only takes one disagreeing for
  --    the exception to survive somewhere a policy happens to look.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000240103', true);
  IF public.is_show_secretary('00000000-0000-0000-0000-000000240003')
     OR public.is_show_official('00000000-0000-0000-0000-000000240003')
     OR public.is_show_office_manager('00000000-0000-0000-0000-000000240003')
     OR public.can_manage_show('00000000-0000-0000-0000-000000240003')
     OR public.is_trial_secretary('00000000-0000-0000-0000-000000240001') THEN
    RAISE EXCEPTION 'FAIL being named on a show still grants access';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.manageable_show_ids()
    WHERE manageable_show_ids = '00000000-0000-0000-0000-000000240003'
  ) THEN
    RAISE EXCEPTION 'FAIL a named official appears in manageable_show_ids';
  END IF;

  -- 2. ...but the naming survived, or the entry form loses its Trial Secretary. This is
  --    the half that would break silently: the PDF just prints blank.
  IF NOT EXISTS (
    SELECT 1 FROM public.get_show_officials('00000000-0000-0000-0000-000000240003')
    WHERE user_id = '00000000-0000-0000-0000-000000240013' AND role = 'secretary'
  ) THEN
    RAISE EXCEPTION 'FAIL the named secretary is missing from the paperwork';
  END IF;

  -- 3. The appointed secretary has access WITHOUT being named. Access and naming are
  --    now fully independent, in both directions.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000240102', true);
  IF NOT public.is_show_secretary('00000000-0000-0000-0000-000000240003')
     OR NOT public.can_manage_show('00000000-0000-0000-0000-000000240003') THEN
    RAISE EXCEPTION 'FAIL the appointed secretary lost access to the club''s show';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_show_officials('00000000-0000-0000-0000-000000240003')
    WHERE user_id = '00000000-0000-0000-0000-000000240012'
  ) THEN
    RAISE EXCEPTION 'FAIL appointing someone silently named them on the paperwork';
  END IF;

  -- 4. Un-naming removes the label and leaves access alone.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000240101', true);
  PERFORM public.revoke_show_official(
    '00000000-0000-0000-0000-000000240013',
    'secretary',
    '00000000-0000-0000-0000-000000240003'
  );
  IF EXISTS (
    SELECT 1 FROM public.get_show_officials('00000000-0000-0000-0000-000000240003')
    WHERE user_id = '00000000-0000-0000-0000-000000240013'
  ) THEN
    RAISE EXCEPTION 'FAIL revoke_show_official left the name in place';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000240102', true);
  IF NOT public.is_show_secretary('00000000-0000-0000-0000-000000240003') THEN
    RAISE EXCEPTION 'FAIL un-naming somebody removed a different person''s access';
  END IF;

  RAISE NOTICE 'PASS naming and access are independent in both directions';
END;
$$;

-- 4b. Steward is the deliberate exception, and it needs its own pin. Naming a
--     steward is a ring assignment, not paperwork: MYK9-114 asserts show- and
--     club-scoped stewards as equals, and both callers of grant_show_official
--     offer the role. Phase 2 originally made it label-only, which would have
--     silently withdrawn access from every steward named through the wizard or
--     the officials editor. Only secretary and chairman are label-only.
SELECT public.grant_show_official(
  '00000000-0000-0000-0000-000000240013',
  'steward',
  '00000000-0000-0000-0000-000000240003'
);

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000240103', true);

  IF NOT public.is_show_official('00000000-0000-0000-0000-000000240003') THEN
    RAISE EXCEPTION 'FAIL naming a steward stopped granting the ring assignment';
  END IF;

  -- ...but it is still not a manager. The steward exception must not leak into
  -- the manager helpers, or "label-only" would have been widened, not narrowed.
  IF public.is_show_secretary('00000000-0000-0000-0000-000000240003')
     OR public.can_manage_show('00000000-0000-0000-0000-000000240003') THEN
    RAISE EXCEPTION 'FAIL a named steward was treated as a show manager';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000240101', true);
  PERFORM public.revoke_show_official(
    '00000000-0000-0000-0000-000000240013',
    'steward',
    '00000000-0000-0000-0000-000000240003'
  );

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000240103', true);
  IF public.is_show_official('00000000-0000-0000-0000-000000240003') THEN
    RAISE EXCEPTION 'FAIL revoking a steward left the ring assignment in place';
  END IF;

  RAISE NOTICE 'PASS steward naming grants and revokes the ring assignment';
END;
$$;

-- 5. Approving a show-scoped official request must FAIL LOUDLY rather than succeed and
--    hand over nothing. This is the same shape as the revoke bug Codex found on #1895:
--    a call that reports success while changing nothing the requester can feel.
RESET ROLE;

INSERT INTO public.role_requests (id, auth_user_id, person_id, requested_role, requested_scope, club_id, show_id, status)
VALUES (
  '00000000-0000-0000-0000-000000240021',
  '00000000-0000-0000-0000-000000240104',
  '00000000-0000-0000-0000-000000240014',
  'secretary',
  'show',
  '00000000-0000-0000-0000-000000240001',
  '00000000-0000-0000-0000-000000240003',
  'pending'
);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000240011', r.id, NULL, true,
       '00000000-0000-0000-0000-000000240101'
FROM public.roles r WHERE r.name = 'site_admin';

SET LOCAL ROLE authenticated;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000240101', true);

  BEGIN
    PERFORM public.approve_role_request(
      '00000000-0000-0000-0000-000000240021',
      '00000000-0000-0000-0000-000000240001',
      '00000000-0000-0000-0000-000000240003',
      NULL
    );
    RAISE EXCEPTION 'FAIL a show-scoped secretary request was approved silently';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;  -- the loud refusal we want
  END;

  -- And it really did nothing: no grant appeared as a side effect of the refusal.
  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = '00000000-0000-0000-0000-000000240014'
      AND r.name IN ('secretary', 'trial_secretary')
      AND ur.is_active
  ) THEN
    RAISE EXCEPTION 'FAIL the refused request still created a secretary grant';
  END IF;

  RAISE NOTICE 'PASS a show-scoped official request is refused loudly, not granted silently';
END;
$$;

RESET ROLE;

-- ===========================================================================
-- 6. MYK9-402 / SA-2026-09-05-04: a steward's email is not premium-list content.
--
-- get_show_officials is SECURITY DEFINER with EXECUTE granted to anon, so the
-- public show overview can render the officials card. Publishing the SECRETARY
-- and CHAIRMAN contact address is the documented, accepted decision (SA-006
-- follow-up, restated in 20260830240000) and is asserted here so a future
-- tightening cannot silently break the public card.
--
-- The steward arm was never part of that decision. show_officials_role_check
-- permits 'steward' (section 4b above — a ring assignment, deliberately), and
-- the RPC used to hand a volunteer's ACCOUNT email to any unauthenticated
-- caller who knows a show id. Show ids are anon-enumerable, so that was a
-- harvestable list.
--
-- Both directions are asserted: anon gets NULL for the steward, a manager still
-- gets the address (the officials editor needs it). Asserting only the denial
-- would pass against an RPC that returned NULL to everybody.
-- ===========================================================================

SELECT public.grant_show_official(
  '00000000-0000-0000-0000-000000240013',
  'chairman',
  '00000000-0000-0000-0000-000000240003'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000240101', true);
SELECT public.grant_show_official(
  '00000000-0000-0000-0000-000000240013',
  'steward',
  '00000000-0000-0000-0000-000000240003'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', NULL, true);
SELECT set_config('request.jwt.claims', NULL, true);

DO $$
DECLARE
  chairman_email text;
  steward_email text;
  row_count integer;
BEGIN
  SELECT count(*) INTO row_count
  FROM public.get_show_officials('00000000-0000-0000-0000-000000240003');
  IF row_count = 0 THEN
    RAISE EXCEPTION 'FAIL anon cannot read the officials card at all — fixture or grant regressed';
  END IF;

  SELECT o.email INTO chairman_email
  FROM public.get_show_officials('00000000-0000-0000-0000-000000240003') o
  WHERE o.role = 'chairman' AND o.user_id = '00000000-0000-0000-0000-000000240013';

  IF chairman_email IS DISTINCT FROM 'officials-named-only@example.test' THEN
    RAISE EXCEPTION
      'FAIL the public officials card lost the chairman contact address: %',
      coalesce(chairman_email, '<null>');
  END IF;

  SELECT o.email INTO steward_email
  FROM public.get_show_officials('00000000-0000-0000-0000-000000240003') o
  WHERE o.role = 'steward' AND o.user_id = '00000000-0000-0000-0000-000000240013';

  IF steward_email IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL a cold anonymous caller read a steward''s email address: %', steward_email;
  END IF;

  RAISE NOTICE 'PASS anon reads the chairman contact but not the steward''s address';
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000240101', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000240101', 'role', 'authenticated')::text,
  true
);

DO $$
DECLARE
  steward_email text;
BEGIN
  SELECT o.email INTO steward_email
  FROM public.get_show_officials('00000000-0000-0000-0000-000000240003') o
  WHERE o.role = 'steward' AND o.user_id = '00000000-0000-0000-0000-000000240013';

  IF steward_email IS DISTINCT FROM 'officials-named-only@example.test' THEN
    RAISE EXCEPTION
      'FAIL the club admin lost the steward''s address they need to reach them: %',
      coalesce(steward_email, '<null>');
  END IF;

  RAISE NOTICE 'PASS a show manager still reads the steward''s address';
END;
$$;

RESET ROLE;
ROLLBACK;
