-- MYK9-2216: publish_premium_artifact refuses a snapshot whose org is missing or differs from the
-- show's saved organization. The positive path (a matching org commits) is covered by
-- myk9_694_premium_published_rls_test.sql, whose fixtures stamp org.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('club_admin', 'MYK9-2216 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000221601', 'MYK9-2216 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000221611', 'MYK9-2216 Show', 'UKC', current_date,
        current_date + 1, '00000000-0000-0000-0000-000000221601', 'published');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES ('00000000-0000-0000-0000-000000221621', 'MYK9-2216', 'Club Admin',
        'myk9-2216-admin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES ('00000000-0000-0000-0000-000000221631', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk9-2216-admin@example.test', '', now(), now(), now(),
        '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = '00000000-0000-0000-0000-000000221631'
WHERE id = '00000000-0000-0000-0000-000000221621';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000221621', roles.id,
       '00000000-0000-0000-0000-000000221601', true,
       '00000000-0000-0000-0000-000000221631'
FROM public.roles WHERE roles.name = 'club_admin';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_id CONSTANT uuid := '00000000-0000-0000-0000-000000221631';
  show_id CONSTANT uuid := '00000000-0000-0000-0000-000000221611';
  artifact CONSTANT text := '11111111-1111-1111-1111-111111111111';
  artifact_path CONSTANT text := '00000000-0000-0000-0000-000000221611/11111111-1111-1111-1111-111111111111.pdf';
  artifact_url CONSTANT text := 'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/00000000-0000-0000-0000-000000221611/11111111-1111-1111-1111-111111111111.pdf';
  version bigint;
  contents jsonb[] := ARRAY[
    jsonb_build_object('outputs', jsonb_build_object('premiumUrl', 'pending')),
    jsonb_build_object('org', 'AKC', 'outputs', jsonb_build_object('premiumUrl', 'pending')),
    jsonb_build_object('org', NULL, 'outputs', jsonb_build_object('premiumUrl', 'pending'))
  ];
  content jsonb;
  message text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text,
    true
  );

  version := (public.begin_or_reconcile_premium_publish(show_id, NULL, NULL)->>'version')::bigint;

  -- A snapshot with no org, one built for another organization, and a null org are all refused,
  -- with the plain sentence the client maps to its Regenerate message.
  FOREACH content IN ARRAY contents LOOP
    message := NULL;
    BEGIN
      PERFORM public.publish_premium_artifact(
        show_id, artifact_path, artifact_url, version, 'monogram', content
      );
    EXCEPTION WHEN OTHERS THEN
      message := SQLERRM;
    END;
    IF message IS NULL OR message NOT LIKE 'Premium organization mismatch:%' THEN
      RAISE EXCEPTION 'FAIL snapshot % was not refused for its organization: %', content, message;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.shows
     WHERE id = show_id AND (experience_is_published OR published_premium_path IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'FAIL a refused snapshot still published the show';
  END IF;
END
$$;

ROLLBACK;
