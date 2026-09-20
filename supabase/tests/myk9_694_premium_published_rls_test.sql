-- MYK9-694: show-manager and show-scoped-secretary premium publication.
-- The staged path is immutable; the RPC is the only show-row commit.

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
  ('00000000-0000-0000-0000-000000694021'::uuid, '00000000-0000-0000-0000-000000694031'::uuid),
  ('00000000-0000-0000-0000-000000694022'::uuid, '00000000-0000-0000-0000-000000694032'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000694021', roles.id,
       '00000000-0000-0000-0000-000000694001', true,
       '00000000-0000-0000-0000-000000694031'
FROM public.roles WHERE roles.name = 'club_admin';

-- Deliberately show-scoped: club_id stays NULL, so this exercises the principal
-- that migration 190 accidentally excluded.
INSERT INTO public.user_roles (user_id, role_id, show_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000694022', roles.id,
       '00000000-0000-0000-0000-000000694013', true,
       '00000000-0000-0000-0000-000000694032'
FROM public.roles WHERE roles.name = 'secretary';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_id CONSTANT uuid := '00000000-0000-0000-0000-000000694031';
  secretary_id CONSTANT uuid := '00000000-0000-0000-0000-000000694032';
  own_show CONSTANT uuid := '00000000-0000-0000-0000-000000694011';
  other_show CONSTANT uuid := '00000000-0000-0000-0000-000000694012';
  secretary_show CONSTANT uuid := '00000000-0000-0000-0000-000000694013';
  artifact CONSTANT text := '11111111-1111-1111-1111-111111111111';
  secretary_artifact CONSTANT text := '22222222-2222-2222-2222-222222222222';
  denied boolean;
  result jsonb;
  previous_url text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('premium-published', own_show::text || '/' || artifact || '.pdf', admin_id);

  -- Exact path shape: no UUID-prefixed suffix, extra extension, or flat path.
  FOREACH result IN ARRAY ARRAY[
    to_jsonb(own_show::text || '/' || artifact || '-suffix.pdf'),
    to_jsonb(own_show::text || '/' || artifact || '.pdf.backup'),
    to_jsonb(own_show::text || '.pdf')
  ] LOOP
    BEGIN
      INSERT INTO storage.objects (bucket_id, name, owner_id)
      VALUES ('premium-published', result #>> '{}', admin_id);
      denied := false;
    EXCEPTION WHEN insufficient_privilege THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'FAIL malformed/suffixed premium path was accepted: %', result #>> '{}';
    END IF;
  END LOOP;

  -- Club-admin positive control: generation and atomic publication share auth.
  result := public.publish_premium_artifact(
    own_show,
    own_show::text || '/' || artifact || '.pdf',
    'https://example.test/storage/v1/object/public/premium-published/' ||
      own_show::text || '/' || artifact || '.pdf',
    '2026-09-19T12:00:00Z',
    'heritage',
    jsonb_build_object('outputs', jsonb_build_object('premiumUrl', 'pending'))
  );
  IF result->>'premiumUrl' NOT LIKE '%/' || artifact || '.pdf' THEN
    RAISE EXCEPTION 'FAIL atomic publication did not return the committed URL: %', result;
  END IF;

  SELECT published_premium_url INTO previous_url FROM public.shows WHERE id = own_show;
  IF previous_url IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shows
    WHERE id = own_show
      AND experience_is_published
      AND experience_published_style = 'heritage'
  ) THEN
    RAISE EXCEPTION 'FAIL atomic publication did not commit metadata and snapshot';
  END IF;

  -- A commit failure cannot replace the last-good metadata.
  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show,
      own_show::text || '/' || artifact || '.pdf',
      'https://example.test/not-premium-published/' || artifact || '.pdf',
      '2026-09-19T13:00:00Z',
      'monogram',
      '{}'::jsonb
    );
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied OR (SELECT published_premium_url FROM public.shows WHERE id = own_show) <> previous_url THEN
    RAISE EXCEPTION 'FAIL failed commit changed the last-good show metadata';
  END IF;

  -- Cross-show commit authorization is denied even when the object is staged.
  BEGIN
    PERFORM public.publish_premium_artifact(
      other_show,
      own_show::text || '/' || artifact || '.pdf',
      'https://example.test/storage/v1/object/public/premium-published/' ||
        own_show::text || '/' || artifact || '.pdf',
      '2026-09-19T14:00:00Z',
      'heritage',
      '{}'::jsonb
    );
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'FAIL manager committed another show''s staged artifact';
  END IF;

  -- Show-scoped secretary positive control.
  PERFORM set_config('request.jwt.claim.sub', secretary_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', secretary_id, 'role', 'authenticated')::text,
    true
  );
  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('premium-published', secretary_show::text || '/' || secretary_artifact || '.pdf', secretary_id);
  PERFORM public.publish_premium_artifact(
    secretary_show,
    secretary_show::text || '/' || secretary_artifact || '.pdf',
    'https://example.test/storage/v1/object/public/premium-published/' ||
      secretary_show::text || '/' || secretary_artifact || '.pdf',
    '2026-09-19T15:00:00Z',
    'heritage',
    '{}'::jsonb
  );

  RAISE NOTICE 'PASS MYK9-694 exact staged paths, manager/secretary auth, atomic commit, and failure preservation';
END;
$$;

RESET ROLE;
ROLLBACK;
