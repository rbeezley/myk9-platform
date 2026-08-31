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

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000240011', 'Officials', 'Club Admin', '00000000-0000-0000-0000-000000240101'),
  ('00000000-0000-0000-0000-000000240012', 'Officials', 'Appointed Secretary', '00000000-0000-0000-0000-000000240102'),
  -- Named on the paperwork and appointed nowhere. Under the old model this person had
  -- full access to the show; now they have none, and that is the point.
  ('00000000-0000-0000-0000-000000240013', 'Officials', 'Named Only', '00000000-0000-0000-0000-000000240103'),
  ('00000000-0000-0000-0000-000000240014', 'Officials', 'Requester', '00000000-0000-0000-0000-000000240104');

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

  RAISE NOTICE 'PASS show_officials excludes anon and has RLS enabled';
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
ROLLBACK;
