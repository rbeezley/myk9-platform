-- MYK9-694: the canonical premium publish path permits every authorized show
-- manager to write the stable <show_id>.pdf object, not only secretaries.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES
  ('club_admin', 'MYK9-694 fixture', true),
  ('secretary', 'MYK9-694 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000694001', 'MYK9-694 Club A'),
  ('00000000-0000-0000-0000-000000694002', 'MYK9-694 Club B');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000000694011', 'MYK9-694 Show A', 'AKC', current_date,
   current_date + 1, '00000000-0000-0000-0000-000000694001', 'published'),
  ('00000000-0000-0000-0000-000000694012', 'MYK9-694 Show B', 'AKC', current_date,
   current_date + 1, '00000000-0000-0000-0000-000000694002', 'published'),
  ('00000000-0000-0000-0000-000000694013', 'MYK9-694 Show C', 'AKC', current_date,
   current_date + 1, '00000000-0000-0000-0000-000000694001', 'published');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000694021', 'MYK9-694', 'Club Admin',
   'myk9-694-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000000694022', 'MYK9-694', 'Secretary',
   'myk9-694-secretary@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000694031', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-694-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000694032', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-694-secretary@example.test', '', now(), now(), now(),
  '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000694021'::uuid,
   '00000000-0000-0000-0000-000000694031'::uuid),
  ('00000000-0000-0000-0000-000000694022'::uuid,
   '00000000-0000-0000-0000-000000694032'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, roles.id, '00000000-0000-0000-0000-000000694001', true,
       fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000694021'::uuid,
   '00000000-0000-0000-0000-000000694031'::uuid, 'club_admin'::text),
  ('00000000-0000-0000-0000-000000694022'::uuid,
   '00000000-0000-0000-0000-000000694032'::uuid, 'secretary'::text)
) AS fixture(person_id, auth_id, role_name)
JOIN public.roles ON roles.name = fixture.role_name;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_id CONSTANT uuid := '00000000-0000-0000-0000-000000694031';
  secretary_id CONSTANT uuid := '00000000-0000-0000-0000-000000694032';
  own_show CONSTANT uuid := '00000000-0000-0000-0000-000000694011';
  other_show CONSTANT uuid := '00000000-0000-0000-0000-000000694012';
  secretary_show CONSTANT uuid := '00000000-0000-0000-0000-000000694013';
  denied boolean;
  affected integer;
BEGIN
  -- Positive control: generation authorizes the club admin, so the upload must
  -- reach the same stable object path without an RLS denial.
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text,
    true
  );
  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('premium-published', own_show::text || '.pdf', admin_id);

  -- The same manager cannot plant a PDF under another show's stable path.
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('premium-published', other_show::text || '.pdf', admin_id);
    denied := false;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'FAIL club admin uploaded another club''s premium PDF';
  END IF;

  -- Upsert's UPDATE leg must remain usable for the manager's own stable path.
  UPDATE storage.objects
  SET metadata = jsonb_build_object('contentType', 'application/pdf')
  WHERE bucket_id = 'premium-published'
    AND name = own_show::text || '.pdf';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'FAIL club admin could not update own premium PDF: % rows', affected;
  END IF;

  -- Existing secretary access remains valid after the policy widening.
  PERFORM set_config('request.jwt.claim.sub', secretary_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', secretary_id, 'role', 'authenticated')::text,
    true
  );
  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('premium-published', secretary_show::text || '.pdf', secretary_id);

  RAISE NOTICE 'PASS MYK9-694 club-admin and secretary premium PDF upload/update scope';
END;
$$;

RESET ROLE;

-- Direct SQL DELETE is blocked by Storage's protect_delete trigger before RLS,
-- so pin the applied DELETE policy expression instead of claiming a row probe
-- exercised it. The same predicate is used by INSERT and UPDATE above.
DO $$
DECLARE
  policy_expression text;
BEGIN
  SELECT coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
  INTO policy_expression
  FROM pg_policy AS pol
  JOIN pg_class AS relation ON relation.oid = pol.polrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'storage'
    AND relation.relname = 'objects'
    AND pol.polname = 'Show managers can delete premium published';

  IF policy_expression IS NULL
     OR policy_expression NOT LIKE '%can_manage_show%'
     OR policy_expression NOT LIKE '%premium-published%' THEN
    RAISE EXCEPTION 'FAIL premium DELETE policy does not use manager scope: %', policy_expression;
  END IF;
END;
$$;

ROLLBACK;
