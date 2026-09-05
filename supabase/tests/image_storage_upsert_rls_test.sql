-- Regression: authenticated image upserts need SELECT access to the target
-- object, while one user must not be able to enumerate another user's files.

BEGIN;

INSERT INTO storage.objects (bucket_id, name, owner_id)
VALUES
  (
    'images',
    'profiles/00000000-0000-0000-0000-000000000181/rls-test-avatar.webp',
    '00000000-0000-0000-0000-000000000181'
  ),
  (
    'images',
    'dogs/00000000-0000-0000-0000-000000000181/00000000-0000-0000-0000-000000000183/rls-test-dog.webp',
    '00000000-0000-0000-0000-000000000181'
  ),
  (
    'images',
    'profiles/00000000-0000-0000-0000-000000000182/rls-test-other-avatar.webp',
    '00000000-0000-0000-0000-000000000182'
  ),
  (
    'images',
    'dogs/00000000-0000-0000-0000-000000000182/00000000-0000-0000-0000-000000000184/rls-test-other-dog.webp',
    '00000000-0000-0000-0000-000000000182'
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000181',
  true
);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000181',
    'role', 'authenticated'
  )::text,
  true
);

DO $$
DECLARE
  visible_names text[];
BEGIN
  SELECT array_agg(name ORDER BY name)
  INTO visible_names
  FROM storage.objects
  WHERE bucket_id = 'images'
    AND name LIKE '%/rls-test-%';

  IF visible_names IS DISTINCT FROM ARRAY[
    'dogs/00000000-0000-0000-0000-000000000181/00000000-0000-0000-0000-000000000183/rls-test-dog.webp',
    'profiles/00000000-0000-0000-0000-000000000181/rls-test-avatar.webp'
  ]::text[] THEN
    RAISE EXCEPTION
      'FAIL owner-scoped image visibility: got %',
      visible_names;
  END IF;

  RAISE NOTICE 'PASS owner sees profile and dog images without seeing another owner''s images';
END;
$$;

RESET ROLE;

-- ===========================================================================
-- MYK9-398 / SA-2026-09-05-01: show-branding writes must be scoped to the show
-- in the OBJECT PATH.
--
-- 059_club_and_show_branding.sql authorized with
--
--   EXISTS (SELECT 1 FROM shows s
--            WHERE s.id = (storage.foldername(name))[2]::uuid ...)
--
-- where the unqualified `name` bound to shows.name, not objects.name. That made
-- the subquery UNCORRELATED — one global boolean — while the only constraint on
-- the object was that its first path segment is 'shows'. A secretary who renamed
-- their own club's show to 'x/<that show's own uuid>' therefore gained write and
-- delete over every other club's branding.
--
-- The rename is the arming step, so it is performed here rather than assumed:
-- asserting only that a secretary cannot cross tenants TODAY would pass against
-- the broken policy too, because no show currently carries a self-referential
-- name. That is exactly how the 2026-07-29 audit measured
-- `secretary_limb_matches=0` and rejected this. The test has to arm the
-- mechanism before probing it, or it proves nothing.
-- ===========================================================================

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000398001', 'MYK9-398 Club A'),
  ('00000000-0000-0000-0000-000000398002', 'MYK9-398 Club B');

INSERT INTO public.shows (id, club_id, name, organization, start_date, end_date, status)
VALUES
  ('00000000-0000-0000-0000-000000398011', '00000000-0000-0000-0000-000000398001',
   'MYK9-398 Show A', 'AKC', now(), now() + interval '1 day', 'published'),
  ('00000000-0000-0000-0000-000000398012', '00000000-0000-0000-0000-000000398002',
   'MYK9-398 Show B', 'AKC', now(), now() + interval '1 day', 'published');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES ('00000000-0000-0000-0000-000000398021', 'MYK9-398', 'Secretary',
        'myk9-398-secretary@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES ('00000000-0000-0000-0000-000000398031', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk9-398-secretary@example.test', '', now(), now(), now(),
        '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = '00000000-0000-0000-0000-000000398031'
WHERE id = '00000000-0000-0000-0000-000000398021';

-- Secretary of club A only.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000398021', roles.id,
       '00000000-0000-0000-0000-000000398001', true,
       '00000000-0000-0000-0000-000000398031'
FROM public.roles WHERE roles.name = 'secretary';

-- Club B's existing branding object, so the DELETE probe has a real target.
INSERT INTO storage.objects (bucket_id, name, owner_id)
VALUES ('images',
        'shows/00000000-0000-0000-0000-000000398012/rls-test-b-logo.webp',
        NULL);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000398031', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000398031',
    'role', 'authenticated'
  )::text,
  true
);

DO $$
DECLARE
  own_show CONSTANT uuid := '00000000-0000-0000-0000-000000398011';
  other_show CONSTANT uuid := '00000000-0000-0000-0000-000000398012';
  denied boolean;
  affected integer;
BEGIN
  -- 1. The secretary CAN brand their own club's show. 059 was broken in this
  --    direction too: the uncorrelated EXISTS was false for every real show, so
  --    only a platform admin could upload. A test that checked denial alone
  --    would pass on a policy that denies everyone.
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('images', 'shows/' || own_show || '/rls-test-a-logo.webp', NULL);
    denied := false;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF denied THEN
    RAISE EXCEPTION 'FAIL secretary cannot brand their own club''s show';
  END IF;

  -- 2. Arm the mechanism the finding is about: rename the secretary's OWN show
  --    so its name parses as a path whose second segment is its own id. Under
  --    059 this flipped the global EXISTS to true.
  UPDATE public.shows SET name = 'x/' || own_show WHERE id = own_show;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL fixture could not rename the secretary''s own show';
  END IF;

  -- 3. Armed or not, another club's prefix must stay closed for INSERT...
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('images', 'shows/' || other_show || '/rls-test-planted.webp', NULL);
    denied := false;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION
      'FAIL secretary of club A planted an object under club B''s show prefix';
  END IF;

  -- 4. UPDATE needs a POSITIVE CONTROL before its denial means anything.
  --
  --    Postgres requires the source row of an UPDATE ... WHERE to pass a SELECT
  --    policy. Until this change there was none covering shows/<id>/..., so the
  --    row was invisible and EVERY update matched zero rows — including the
  --    cross-tenant one below, which would therefore have "passed" against a
  --    wide-open UPDATE policy. Assert the authorized update works first.
  SELECT count(*) INTO affected
  FROM storage.objects
  WHERE bucket_id = 'images'
    AND name = 'shows/' || own_show || '/rls-test-a-logo.webp';
  IF affected <> 1 THEN
    RAISE EXCEPTION
      'FAIL secretary cannot even see their own club''s show branding: % rows', affected;
  END IF;

  UPDATE storage.objects
     SET name = 'shows/' || own_show || '/rls-test-a-renamed.webp'
   WHERE bucket_id = 'images'
     AND name = 'shows/' || own_show || '/rls-test-a-logo.webp';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION
      'FAIL secretary cannot replace their own club''s show branding: % rows', affected;
  END IF;

  --    ...and only now is the denial meaningful: the same caller, the same
  --    verb, a different tenant's prefix. Note the SHAPE of the denial changed
  --    with the read policy above, for the better. The row is now visible and
  --    passes USING, so Postgres reaches the WITH CHECK on the NEW path and
  --    raises 42501 outright. Before, the row was invisible, the update matched
  --    nothing, and a silent zero-rows was indistinguishable from success
  --    against a wide-open policy.
  BEGIN
    UPDATE storage.objects
       SET name = 'shows/' || other_show || '/rls-test-moved.webp'
     WHERE bucket_id = 'images'
       AND name = 'shows/' || own_show || '/rls-test-a-renamed.webp';
    GET DIAGNOSTICS affected = ROW_COUNT;
    denied := false;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
    affected := 0;
  END;
  IF NOT denied AND affected <> 0 THEN
    RAISE EXCEPTION
      'FAIL secretary of club A moved an object into club B''s show prefix';
  END IF;

  --    Club B's object must also stay invisible, not merely unwritable.
  SELECT count(*) INTO affected
  FROM storage.objects
  WHERE bucket_id = 'images'
    AND name = 'shows/' || other_show || '/rls-test-b-logo.webp';
  IF affected <> 0 THEN
    RAISE EXCEPTION
      'FAIL secretary of club A can read club B''s show branding rows: %', affected;
  END IF;

  RAISE NOTICE 'PASS show branding INSERT/UPDATE are scoped to the object path, before and after the self-referential rename';
END;
$$;

RESET ROLE;

-- 5. DELETE is the destructive half of the same finding, but it cannot be
--    exercised the way INSERT and UPDATE are above: storage.protect_delete()
--    raises "Direct deletion from storage tables is not allowed" on ANY SQL
--    DELETE, ahead of RLS, so a row-level probe here would report the trigger
--    rather than the policy and pass no matter what the policy said. The
--    Storage API path that does reach the policy is not available from psql.
--
--    So assert the applied policy EXPRESSION instead. This is a metadata
--    assertion, not a source grep: pg_get_expr renders the parsed predicate, so
--    a comment cannot satisfy it and the `s.name` capture the finding is about
--    shows up verbatim in the rendered text if it ever comes back.
DO $$
DECLARE
  policy_name text;
  expression text;
BEGIN
  FOREACH policy_name IN ARRAY ARRAY[
    'Secretaries can upload show branding',
    'Secretaries can update show branding',
    'Secretaries can delete show branding'
  ]
  LOOP
    SELECT coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
           || ' ' ||
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
      INTO expression
    FROM pg_policy AS pol
    JOIN pg_class AS c ON c.oid = pol.polrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects' AND pol.polname = policy_name;

    IF expression IS NULL THEN
      RAISE EXCEPTION 'FAIL storage policy % is missing', policy_name;
    END IF;

    -- The object path must be what is authorized against.
    IF expression NOT LIKE '%objects.name%' THEN
      RAISE EXCEPTION
        'FAIL storage policy % does not authorize against objects.name: %',
        policy_name, expression;
    END IF;

    -- The 059 capture, rendered by pg_get_expr as s.name, must be gone.
    IF expression ~ '(^|[^a-z0-9_.])s\.name' THEN
      RAISE EXCEPTION
        'FAIL storage policy % still parses the SHOW NAME as a path: %',
        policy_name, expression;
    END IF;

    -- An uncorrelated authorization subquery is the defect itself, whatever it
    -- reads. There is no legitimate reason for this policy to scan shows.
    IF expression ILIKE '%FROM shows%' THEN
      RAISE EXCEPTION
        'FAIL storage policy % reintroduced an uncorrelated shows subquery: %',
        policy_name, expression;
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS all three show-branding policies authorize against the object path';
END;
$$;

ROLLBACK;
