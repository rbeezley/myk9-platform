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

-- Show D exists only for the updated_at contract: its timestamp is backdated
-- so a bump inside this single transaction (NOW() is constant) is visible.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000694014', 'MYK9-694 Show D', 'AKC', current_date,
   current_date + 1, '00000000-0000-0000-0000-000000694001', 'draft',
   now() - interval '1 day');

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

-- An existing object for another club must remain invisible to the manager A
-- used below; the migration intentionally does not restore bucket-wide reads.
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'premium-published',
  '00000000-0000-0000-0000-000000694012.pdf',
  '00000000-0000-0000-0000-000000694031',
  jsonb_build_object('mimetype', 'application/pdf', 'size', 1024)
);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_id CONSTANT uuid := '00000000-0000-0000-0000-000000694031';
  secretary_id CONSTANT uuid := '00000000-0000-0000-0000-000000694032';
  own_show CONSTANT uuid := '00000000-0000-0000-0000-000000694011';
  other_show CONSTANT uuid := '00000000-0000-0000-0000-000000694012';
  secretary_show CONSTANT uuid := '00000000-0000-0000-0000-000000694013';
  safe_insert_show CONSTANT uuid := '00000000-0000-0000-0000-000000694050';
  prefilled_insert_show CONSTANT uuid := '00000000-0000-0000-0000-000000694051';
  artifact CONSTANT text := '11111111-1111-1111-1111-111111111111';
  second_artifact CONSTANT text := '33333333-3333-3333-3333-333333333333';
  bad_artifact CONSTANT text := '44444444-4444-4444-4444-444444444444';
  oversized_artifact CONSTANT text := '55555555-5555-5555-5555-555555555555';
  secretary_artifact CONSTANT text := '22222222-2222-2222-2222-222222222222';
  legacy_url CONSTANT text := 'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/00000000-0000-0000-0000-000000694011.pdf';
  versioned_url CONSTANT text := 'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/00000000-0000-0000-0000-000000694011/11111111-1111-1111-1111-111111111111.pdf';
  denied boolean;
  result jsonb;
  reconcile jsonb;
  first_version bigint;
  second_version bigint;
  previous_path text;
  original_snapshot CONSTANT jsonb := jsonb_build_object('outputs', jsonb_build_object('premiumUrl', 'pending'));
  update_statement text;
  insert_case record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text,
    true
  );

  -- Existing application show creation starts with the safe publication
  -- defaults. This positive control proves the following rejection is from
  -- the publication-state boundary, not ordinary show INSERT authorization.
  INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
  VALUES (safe_insert_show, 'MYK9-694 Safe Insert', 'AKC', current_date,
          current_date + 1, '00000000-0000-0000-0000-000000694001', 'draft');
  IF NOT EXISTS (
    SELECT 1 FROM public.shows
     WHERE id = safe_insert_show
       AND published_premium_path IS NULL
       AND published_premium_url IS NULL
       AND published_premium_at IS NULL
       AND premium_publish_version = 0
       AND published_premium_version IS NULL
       AND experience_is_published = false
       AND experience_published_at IS NULL
       AND experience_published_style IS NULL
       AND experience_published_content = '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'FAIL manager safe-default show insert did not preserve empty publication state';
  END IF;

  -- Every publication-owned field is independently forbidden at show INSERT.
  -- Reuse one fixture ID because each rejected INSERT rolls back to its block.
  FOR insert_case IN
    SELECT * FROM (VALUES
      ('published_premium_path', quote_literal(own_show::text || '/' || artifact || '.pdf')),
      ('published_premium_url', quote_literal(versioned_url)),
      ('published_premium_at', 'clock_timestamp()'),
      ('premium_publish_version', '1'),
      ('published_premium_version', '1'),
      ('experience_is_published', 'true'),
      ('experience_published_at', 'clock_timestamp()'),
      ('experience_published_style', quote_literal('heritage')),
      ('experience_published_content', quote_literal('{"forged":true}') || '::jsonb')
    ) AS publication_columns(column_name, value_expression)
  LOOP
    BEGIN
      EXECUTE format(
        'INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status, %I) VALUES (%L, %L, %L, current_date, current_date + 1, %L, %L, %s)',
        insert_case.column_name,
        prefilled_insert_show,
        'MYK9-694 Prefilled Publication Insert',
        'AKC',
        '00000000-0000-0000-0000-000000694001',
        'draft',
        insert_case.value_expression
      );
      denied := false;
    EXCEPTION WHEN raise_exception THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'FAIL authenticated show INSERT prefilled publication field %', insert_case.column_name;
    END IF;
  END LOOP;

  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'premium-published', own_show::text || '/' || artifact || '.pdf', admin_id,
    jsonb_build_object('mimetype', 'application/pdf', 'size', 1024)
  );

  -- Versioned path shape: no UUID-prefixed suffix or extra extension. Flat
  -- paths are retained for reads only and cannot be written after cutover.
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

  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES ('premium-published', own_show::text || '.pdf', admin_id,
            jsonb_build_object('mimetype', 'application/pdf', 'size', 1024));
    denied := false;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'FAIL manager staged a new legacy flat premium object after cutover';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'premium-published'
      AND name = other_show::text || '.pdf'
  ) THEN
    RAISE EXCEPTION 'FAIL authenticated manager could list another club premium object';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND roles && ARRAY['anon', 'public']::name[] AND cmd IN ('SELECT', 'ALL')
      AND (
        coalesce(qual, '') ~ 'premium-published'
        OR coalesce(qual, '') !~* 'bucket_id\s*=\s*''[^'']+'''
      )
  ) THEN
    RAISE EXCEPTION 'FAIL anonymous read policy remains for premium-published objects';
  END IF;

  -- Club-admin positive control: generation and atomic publication share auth.
  first_version := (public.begin_or_reconcile_premium_publish(own_show, NULL, NULL)->>'version')::bigint;
  result := public.publish_premium_artifact(
    own_show,
    own_show::text || '/' || artifact || '.pdf',
    versioned_url,
    first_version,
    'heritage',
    jsonb_build_object('outputs', jsonb_build_object('premiumUrl', 'pending'))
  );
  IF result->>'premiumPath' <> own_show::text || '/' || artifact || '.pdf' THEN
    RAISE EXCEPTION 'FAIL atomic publication did not return the committed path: %', result;
  END IF;
  reconcile := public.begin_or_reconcile_premium_publish(
    own_show, first_version, own_show::text || '/' || artifact || '.pdf'
  );
  IF reconcile->>'status' <> 'already_committed'
     OR (reconcile->>'version')::bigint <> first_version
     OR reconcile->>'publishedAt' IS NULL THEN
    RAISE EXCEPTION 'FAIL exact lost-response retry did not reconcile committed publication: %', reconcile;
  END IF;

  SELECT published_premium_path,
         jsonb_build_object(
           'path', published_premium_path,
           'url', published_premium_url,
           'isPublished', experience_is_published,
           'style', experience_published_style,
           'attemptVersion', premium_publish_version,
           'publishedVersion', published_premium_version,
           'snapshotPath', experience_published_content->'outputs'->>'premiumPath',
           'snapshotUrl', experience_published_content->'outputs'->>'premiumUrl',
           'publicationTimesMatch',
             published_premium_at IS NOT NULL
             AND experience_published_at IS NOT NULL
             AND published_premium_at = experience_published_at,
           'generatedAtMatchesPublishedAt',
             coalesce(
               experience_published_content->'generatedAt' = to_jsonb(published_premium_at),
               false
             )
         )
    INTO previous_path, result
    FROM public.shows
   WHERE id = own_show;
  IF result IS DISTINCT FROM jsonb_build_object(
       'path', own_show::text || '/' || artifact || '.pdf',
       'url', versioned_url,
       'isPublished', true,
       'style', 'heritage',
       'attemptVersion', first_version,
       'publishedVersion', first_version,
       'snapshotPath', own_show::text || '/' || artifact || '.pdf',
       'snapshotUrl', versioned_url,
       'publicationTimesMatch', true,
       'generatedAtMatchesPublishedAt', true
     ) THEN
    RAISE EXCEPTION 'FAIL atomic publication state differs from committed intent: %', result;
  END IF;

  -- The publication RPC is the only application writer for the full
  -- publication state, not just the PDF pointer. Manager RLS alone is not
  -- sufficient: direct snapshot/style/flag/counter writes must also fail.
  FOREACH update_statement IN ARRAY ARRAY[
    'UPDATE public.shows SET experience_is_published = false WHERE id = $1',
    'UPDATE public.shows SET experience_published_at = clock_timestamp() WHERE id = $1',
    'UPDATE public.shows SET experience_published_style = ''monogram'' WHERE id = $1',
    'UPDATE public.shows SET experience_published_content = ''{"forged":true}''::jsonb WHERE id = $1',
    'UPDATE public.shows SET premium_publish_version = premium_publish_version + 1 WHERE id = $1',
    'UPDATE public.shows SET published_premium_version = published_premium_version + 1 WHERE id = $1'
  ] LOOP
    BEGIN
      EXECUTE update_statement USING own_show;
      denied := false;
    EXCEPTION WHEN raise_exception THEN
      denied := true;
    END;
    IF NOT denied OR NOT EXISTS (
      SELECT 1 FROM public.shows
       WHERE id = own_show
         AND experience_is_published
         AND experience_published_at IS NOT NULL
         AND experience_published_style = 'heritage'
         AND experience_published_content->'outputs'->>'premiumPath' = previous_path
         AND premium_publish_version = first_version
         AND published_premium_version = first_version
    ) THEN
      RAISE EXCEPTION 'FAIL direct manager write bypassed atomic publication guard: %', update_statement;
    END IF;
  END LOOP;

  BEGIN
    UPDATE public.shows
       SET published_premium_path = own_show::text || '/' || second_artifact || '.pdf',
           published_premium_url = replace(versioned_url, artifact, second_artifact)
     WHERE id = own_show;
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied OR (SELECT published_premium_path FROM public.shows WHERE id = own_show) <> previous_path THEN
    RAISE EXCEPTION 'FAIL direct show-row update bypassed atomic premium publication RPC';
  END IF;

  -- New versioned artifacts are append-only even for an authorized manager.
  UPDATE storage.objects
     SET metadata = jsonb_build_object('mimetype', 'application/pdf', 'size', 2048)
   WHERE bucket_id = 'premium-published'
     AND name = previous_path;
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL versioned premium artifact was mutable';
  END IF;
  BEGIN
    DELETE FROM storage.objects
     WHERE bucket_id = 'premium-published' AND name = previous_path;
    denied := NOT FOUND;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'FAIL versioned premium artifact was deletable';
  END IF;

  -- A lost response can be retried only with the exact same committed intent.
  result := public.publish_premium_artifact(
    own_show,
    previous_path,
    versioned_url,
    first_version,
    'heritage',
    original_snapshot
  );
  IF result->>'premiumPath' <> previous_path
     OR result->>'premiumUrl' <> versioned_url
     OR (SELECT published_premium_version FROM public.shows WHERE id = own_show) <> first_version
  THEN
    RAISE EXCEPTION 'FAIL exact committed publish retry was not idempotent';
  END IF;

  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show, previous_path, versioned_url, first_version, 'monogram', original_snapshot
    );
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied OR (SELECT experience_published_style FROM public.shows WHERE id = own_show) <> 'heritage' THEN
    RAISE EXCEPTION 'FAIL same-version retry changed or accepted a different published style';
  END IF;

  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show, previous_path, versioned_url, first_version, 'heritage',
      jsonb_build_object(
        'metadata', jsonb_build_object('retryIntent', 'changed intent'),
        'outputs', jsonb_build_object('premiumUrl', 'changed intent')
      )
    );
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied OR (SELECT experience_published_content->'metadata'->>'retryIntent' FROM public.shows WHERE id = own_show) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL same-version retry changed or accepted a different content snapshot';
  END IF;

  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show,
      previous_path,
      'https://attacker.example/forged.pdf',
      first_version,
      'monogram',
      '{}'::jsonb
    );
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied OR (SELECT published_premium_url FROM public.shows WHERE id = own_show) <> versioned_url THEN
    RAISE EXCEPTION 'FAIL non-allowlisted URL changed the committed publication';
  END IF;

  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show,
      own_show::text || '/' || second_artifact || '.pdf',
      versioned_url,
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
  second_version := (public.begin_or_reconcile_premium_publish(own_show, NULL, NULL)->>'version')::bigint;
  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show,
      own_show::text || '/' || bad_artifact || '.pdf',
      'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/' || own_show::text || '/' || bad_artifact || '.pdf',
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

  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'premium-published', own_show::text || '/' || oversized_artifact || '.pdf', admin_id,
    jsonb_build_object('mimetype', 'application/pdf', 'size', 26214401)
  );
  second_version := (public.begin_or_reconcile_premium_publish(own_show, NULL, NULL)->>'version')::bigint;
  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show,
      own_show::text || '/' || oversized_artifact || '.pdf',
      'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/' || own_show::text || '/' || oversized_artifact || '.pdf',
      second_version,
      'monogram',
      '{}'::jsonb
    );
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied OR (SELECT published_premium_path FROM public.shows WHERE id = own_show) <> previous_path THEN
    RAISE EXCEPTION 'FAIL oversized PDF replaced the last-good publication';
  END IF;

  -- A newer server-issued version makes an older completion stale.
  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'premium-published', own_show::text || '/' || second_artifact || '.pdf', admin_id,
    jsonb_build_object('mimetype', 'application/pdf', 'size', 1024)
  );
  second_version := (public.begin_or_reconcile_premium_publish(own_show, NULL, NULL)->>'version')::bigint;
  BEGIN
    PERFORM public.publish_premium_artifact(
      own_show,
      own_show::text || '/' || second_artifact || '.pdf',
      'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/' || own_show::text || '/' || second_artifact || '.pdf',
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
  -- Asserts the authorization message, not any error: the path-prefix check
  -- would also reject this call, and must not be what makes it pass.
  BEGIN
    PERFORM public.publish_premium_artifact(
      other_show,
      own_show::text || '/' || artifact || '.pdf',
      versioned_url,
      first_version,
      'heritage',
      '{}'::jsonb
    );
    RAISE EXCEPTION 'FAIL manager committed another show''s staged artifact';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Not authorized to publish this show' THEN
      RAISE EXCEPTION 'FAIL cross-show commit was rejected for the wrong reason: %', SQLERRM;
    END IF;
  END;

  -- Cross-club boundary, each case isolated so exactly one guard can reject it
  -- (Claude review of #2375, P2). Club A's admin, acting on Club B's Show B:
  -- 1. reserving a publish attempt;
  BEGIN
    PERFORM public.begin_or_reconcile_premium_publish(other_show, NULL, NULL);
    RAISE EXCEPTION 'FAIL club A admin reserved a premium publish for club B''s show';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Not authorized to publish this show' THEN
      RAISE EXCEPTION 'FAIL cross-club reservation was rejected for the wrong reason: %', SQLERRM;
    END IF;
  END;

  -- 2. staging a correctly shaped versioned object under Show B's prefix;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'premium-published',
      other_show::text || '/' || artifact || '.pdf',
      admin_id,
      jsonb_build_object('mimetype', 'application/pdf', 'size', 1024)
    );
    RAISE EXCEPTION 'FAIL club A admin staged a premium object under club B''s show';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- 3. committing with a correctly prefixed Show B path, so the path check
  --    passes and only the authorization guard can reject it.
  BEGIN
    PERFORM public.publish_premium_artifact(
      other_show,
      other_show::text || '/' || artifact || '.pdf',
      'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/' || other_show::text || '/' || artifact || '.pdf',
      first_version,
      'heritage',
      '{}'::jsonb
    );
    RAISE EXCEPTION 'FAIL club A admin committed a publication on club B''s show';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Not authorized to publish this show' THEN
      RAISE EXCEPTION 'FAIL cross-club commit was rejected for the wrong reason: %', SQLERRM;
    END IF;
  END;

  -- A reservation alone must not bump updated_at (that reads as "show data
  -- changed" and marks a current premium stale); a real edit still must.
  PERFORM public.begin_or_reconcile_premium_publish(
    '00000000-0000-0000-0000-000000694014'::uuid, NULL, NULL
  );
  IF (SELECT updated_at FROM public.shows WHERE id = '00000000-0000-0000-0000-000000694014')
     >= now() - interval '1 hour' THEN
    RAISE EXCEPTION 'FAIL a premium publish reservation bumped shows.updated_at';
  END IF;
  UPDATE public.shows
     SET name = 'MYK9-694 Show D renamed'
   WHERE id = '00000000-0000-0000-0000-000000694014';
  IF (SELECT updated_at FROM public.shows WHERE id = '00000000-0000-0000-0000-000000694014')
     < now() THEN
    RAISE EXCEPTION 'FAIL an ordinary show edit no longer bumps shows.updated_at';
  END IF;

  -- Direct flat-URL row writes are no longer a rollback path after privacy cutover.
  BEGIN
    UPDATE public.shows
       SET published_premium_url = legacy_url,
           published_premium_at = clock_timestamp()
     WHERE id = own_show;
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied OR (SELECT published_premium_path FROM public.shows WHERE id = own_show) <> previous_path THEN
    RAISE EXCEPTION 'FAIL direct legacy publication changed the committed versioned pointer';
  END IF;

  -- A subsequent RPC publication commits a new matching path/URL.
  second_version := (public.begin_or_reconcile_premium_publish(own_show, NULL, NULL)->>'version')::bigint;
  result := public.publish_premium_artifact(
    own_show,
    own_show::text || '/' || second_artifact || '.pdf',
    'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/' || own_show::text || '/' || second_artifact || '.pdf',
    second_version,
    'heritage',
    '{}'::jsonb
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.shows
    WHERE id = own_show
      AND published_premium_path = own_show::text || '/' || second_artifact || '.pdf'
      AND published_premium_url = 'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/' || own_show::text || '/' || second_artifact || '.pdf'
      AND published_premium_version = second_version
      AND premium_publish_version = second_version
      AND experience_published_content->'outputs'->>'premiumPath' = published_premium_path
      AND experience_published_content->'outputs'->>'premiumUrl' = published_premium_url
  ) THEN
    RAISE EXCEPTION 'FAIL versioned publication did not restore matching path and URL';
  END IF;
  reconcile := public.begin_or_reconcile_premium_publish(
    own_show, second_version, own_show::text || '/33333333-3333-3333-3333-333333333334.pdf'
  );
  IF reconcile->>'status' <> 'reserved'
     OR (reconcile->>'version')::bigint <= second_version THEN
    RAISE EXCEPTION 'FAIL mismatched prior path did not reserve a fresh attempt: %', reconcile;
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
  first_version := (public.begin_or_reconcile_premium_publish(secretary_show, NULL, NULL)->>'version')::bigint;
  PERFORM public.publish_premium_artifact(
    secretary_show,
    secretary_show::text || '/' || secretary_artifact || '.pdf',
    'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/' || secretary_show::text || '/' || secretary_artifact || '.pdf',
    first_version,
    'heritage',
    '{}'::jsonb
  );

  RAISE NOTICE 'PASS MYK9-694 private versioned staging, exact retries, manager/secretary auth, atomic commit, and failure preservation';
END;
$$;

RESET ROLE;
-- Bucket metadata is not exposed to authenticated users for private buckets;
-- validate its configuration as the privileged test role after role reset.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'premium-published'
      AND public = false
      AND file_size_limit = 26214400
      AND 'application/pdf' = ANY(allowed_mime_types)
  ) THEN
    RAISE EXCEPTION 'FAIL premium-published bucket privacy/constraints were not applied';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'premium-published'
      AND name = '00000000-0000-0000-0000-000000694011/11111111-1111-1111-1111-111111111111.pdf'
  ) THEN
    RAISE EXCEPTION 'FAIL denied versioned object deletion removed the retained row';
  END IF;
END;
$$;
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'premium-published') THEN
    RAISE EXCEPTION 'FAIL anonymous role could list premium-published objects';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
