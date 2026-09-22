-- MYK9-694: show-manager and club-scoped-secretary premium publication.
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

-- Club-scoped secretary: show_id stays NULL and the club matches Show C.
-- A named/show-scoped secretary is deliberately not the authorization contract.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000694022', roles.id,
       '00000000-0000-0000-0000-000000694001', true,
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
  second_artifact CONSTANT text := '33333333-3333-3333-3333-333333333333';
  bad_artifact CONSTANT text := '44444444-4444-4444-4444-444444444444';
  secretary_artifact CONSTANT text := '22222222-2222-2222-2222-222222222222';
  legacy_url CONSTANT text := 'https://legacy.example.test/00000000-0000-0000-0000-000000694011.pdf';
  denied boolean;
  legacy_attempt_version bigint;
  result jsonb;
  first_version bigint;
  second_version bigint;
  previous_path text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'premium-published', own_show::text || '/' || artifact || '.pdf', admin_id,
    jsonb_build_object('mimetype', 'application/pdf', 'size', 1024)
  );

  -- Versioned path shape: no UUID-prefixed suffix or extra extension. Flat
  -- <show-id>.pdf remains a temporary rollback-compatibility shape below.
  FOREACH result IN ARRAY ARRAY[
    to_jsonb(own_show::text || '/' || artifact || '-suffix.pdf'),
    to_jsonb(own_show::text || '/' || artifact || '.pdf.backup')
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

  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'premium-published', own_show::text || '.pdf', admin_id,
    jsonb_build_object('mimetype', 'application/pdf', 'size', 1024)
  );
  UPDATE storage.objects
     SET metadata = jsonb_build_object('mimetype', 'application/pdf', 'size', 2048)
   WHERE bucket_id = 'premium-published' AND name = own_show::text || '.pdf';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL legacy flat premium compatibility update was denied';
  END IF;
  DELETE FROM storage.objects
   WHERE bucket_id = 'premium-published' AND name = own_show::text || '.pdf';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL legacy flat premium compatibility delete was denied';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'premium-published'
      AND file_size_limit = 26214400
      AND 'application/pdf' = ANY(allowed_mime_types)
  ) THEN
    RAISE EXCEPTION 'FAIL premium-published bucket constraints were not applied';
  END IF;

  -- Club-admin positive control: generation and atomic publication share auth.
  first_version := public.begin_premium_publish(own_show);
  result := public.publish_premium_artifact(
    own_show,
    own_show::text || '/' || artifact || '.pdf',
    first_version,
    'heritage',
    jsonb_build_object('outputs', jsonb_build_object('premiumUrl', 'pending'))
  );
  IF result->>'premiumPath' <> own_show::text || '/' || artifact || '.pdf' THEN
    RAISE EXCEPTION 'FAIL atomic publication did not return the committed path: %', result;
  END IF;

  SELECT published_premium_path INTO previous_path FROM public.shows WHERE id = own_show;
  IF previous_path IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shows
    WHERE id = own_show
      AND experience_is_published
      AND experience_published_style = 'heritage'
      AND published_premium_url IS NULL
      AND premium_publish_version = first_version
      AND published_premium_version = first_version
      AND experience_published_content->'outputs'->>'premiumPath' = own_show::text || '/' || artifact || '.pdf'
      AND (experience_published_content->'outputs'->'premiumUrl') IS NULL
      AND experience_published_content->>'generatedAt' = experience_published_at::text
  ) THEN
    RAISE EXCEPTION 'FAIL atomic publication did not commit metadata and snapshot';
  END IF;

  -- New versioned artifacts are append-only even for an authorized manager.
  UPDATE storage.objects
     SET metadata = jsonb_build_object('mimetype', 'application/pdf', 'size', 2048)
   WHERE bucket_id = 'premium-published'
     AND name = previous_path;
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL versioned premium artifact was mutable';
  END IF;
  DELETE FROM storage.objects
   WHERE bucket_id = 'premium-published' AND name = previous_path;
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL versioned premium artifact was deletable';
  END IF;

  -- A lost response can be retried idempotently, but the version cannot point
  -- at a different artifact.
  result := public.publish_premium_artifact(
    own_show,
    previous_path,
    first_version,
    'monogram',
    jsonb_build_object('outputs', jsonb_build_object('premiumUrl', 'https://attacker.test'))
  );
  IF result->>'premiumPath' <> previous_path
     OR (SELECT published_premium_version FROM public.shows WHERE id = own_show) <> first_version
  THEN
    RAISE EXCEPTION 'FAIL exact committed publish retry was not idempotent';
  END IF;

  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show,
      own_show::text || '/' || second_artifact || '.pdf',
      first_version,
      'monogram',
      '{}'::jsonb
    );
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'FAIL committed version accepted a different artifact path';
  END IF;

  -- A non-PDF object cannot be committed and cannot replace last-good state.
  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'premium-published', own_show::text || '/' || bad_artifact || '.pdf', admin_id,
    jsonb_build_object('mimetype', 'text/plain', 'size', 1024)
  );
  second_version := public.begin_premium_publish(own_show);
  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show,
      own_show::text || '/' || bad_artifact || '.pdf',
      second_version,
      'monogram',
      '{}'::jsonb
    );
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied OR (SELECT published_premium_path FROM public.shows WHERE id = own_show) <> previous_path THEN
    RAISE EXCEPTION 'FAIL failed commit changed the last-good show metadata';
  END IF;

  -- A newer server-issued version makes an older completion stale.
  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'premium-published', own_show::text || '/' || second_artifact || '.pdf', admin_id,
    jsonb_build_object('mimetype', 'application/pdf', 'size', 1024)
  );
  second_version := public.begin_premium_publish(own_show);
  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show,
      own_show::text || '/' || second_artifact || '.pdf',
      first_version,
      'monogram',
      '{}'::jsonb
    );
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied OR (SELECT published_premium_path FROM public.shows WHERE id = own_show) <> previous_path THEN
    RAISE EXCEPTION 'FAIL stale premium completion replaced the last-good state';
  END IF;

  -- Cross-show commit authorization is denied even when the object is staged.
  BEGIN
    PERFORM public.publish_premium_artifact(
      other_show,
      own_show::text || '/' || artifact || '.pdf',
      first_version,
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

  -- A rollback app writes only the legacy URL and timestamp. That newer
  -- publication must invalidate the versioned A path and any in-flight token.
  UPDATE public.shows
     SET published_premium_url = legacy_url,
         published_premium_at = clock_timestamp()
   WHERE id = own_show;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.shows
    WHERE id = own_show
      AND published_premium_path IS NULL
      AND published_premium_version IS NULL
      AND published_premium_url = legacy_url
      AND premium_publish_version = second_version + 1
  ) THEN
    RAISE EXCEPTION 'FAIL rollback publish did not replace versioned premium state';
  END IF;

  -- The legacy URL is stable across publishes. A changed timestamp identifies
  -- a second publish and must invalidate an in-flight versioned attempt.
  legacy_attempt_version := public.begin_premium_publish(own_show);
  UPDATE public.shows
     SET published_premium_url = legacy_url,
         published_premium_at = clock_timestamp()
   WHERE id = own_show;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.shows
    WHERE id = own_show
      AND published_premium_path IS NULL
      AND published_premium_version IS NULL
      AND published_premium_url = legacy_url
      AND premium_publish_version = legacy_attempt_version + 1
  ) THEN
    RAISE EXCEPTION 'FAIL repeated rollback publish did not invalidate the active version';
  END IF;

  UPDATE public.shows
     SET published_premium_url = legacy_url
   WHERE id = own_show;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.shows
    WHERE id = own_show
      AND published_premium_path IS NULL
      AND published_premium_url = legacy_url
      AND premium_publish_version = legacy_attempt_version + 1
  ) THEN
    RAISE EXCEPTION 'FAIL unchanged legacy metadata advanced the publish version';
  END IF;

  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show,
      previous_path,
      legacy_attempt_version,
      'heritage',
      '{}'::jsonb
    );
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied OR NOT EXISTS (
    SELECT 1 FROM public.shows
    WHERE id = own_show
      AND published_premium_path IS NULL
      AND published_premium_url = legacy_url
  ) THEN
    RAISE EXCEPTION 'FAIL versioned attempt replaced a later rollback publication';
  END IF;

  -- Club-scoped secretary positive control.
  PERFORM set_config('request.jwt.claim.sub', secretary_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', secretary_id, 'role', 'authenticated')::text,
    true
  );
  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'premium-published', secretary_show::text || '/' || secretary_artifact || '.pdf', secretary_id,
    jsonb_build_object('mimetype', 'application/pdf', 'size', 1024)
  );
  first_version := public.begin_premium_publish(secretary_show);
  PERFORM public.publish_premium_artifact(
    secretary_show,
    secretary_show::text || '/' || secretary_artifact || '.pdf',
    first_version,
    'heritage',
    '{}'::jsonb
  );

  RAISE NOTICE 'PASS MYK9-694 exact staged paths, legacy compatibility, manager/secretary auth, atomic commit, and failure preservation';
END;
$$;

RESET ROLE;
ROLLBACK;
