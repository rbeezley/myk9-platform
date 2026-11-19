-- MYK9-2054: a club's own premium (uploaded PDF or link), unpublish, and the dropped
-- shows.uses_landing_page column. Run with psql -X -v ON_ERROR_STOP=1 after migrations;
-- every fixture rolls back.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('club_admin', 'MYK9-2054 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name) VALUES
  ('00000000-0000-0000-0000-000000205401', 'MYK9-2054 Club A'),
  ('00000000-0000-0000-0000-000000205402', 'MYK9-2054 Club B');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000205411', 'MYK9-2054 Show A', 'AKC', current_date,
   current_date + 1, '00000000-0000-0000-0000-000000205401', 'published'),
  ('00000000-0000-0000-0000-000000205412', 'MYK9-2054 Show B', 'AKC', current_date,
   current_date + 1, '00000000-0000-0000-0000-000000205402', 'published');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id) VALUES
  ('00000000-0000-0000-0000-000000205421', 'MYK9-2054', 'Club Admin',
   'myk9-2054-admin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) VALUES
  ('00000000-0000-0000-0000-000000205431', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2054-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000205432', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2054-nobody@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
   SET auth_user_id = '00000000-0000-0000-0000-000000205431'
 WHERE id = '00000000-0000-0000-0000-000000205421';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000205421', roles.id,
       '00000000-0000-0000-0000-000000205401', true,
       '00000000-0000-0000-0000-000000205431'
FROM public.roles WHERE roles.name = 'club_admin';

-- The staged PDF for Show A (the upload happens before the RPC), and one for Show B that
-- Show A's manager must not be able to commit.
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata) VALUES
  ('premium-published', '00000000-0000-0000-0000-000000205411/11111111-1111-1111-1111-111111111111.pdf',
   '00000000-0000-0000-0000-000000205431',
   jsonb_build_object('mimetype', 'application/pdf', 'size', 2048)),
  ('premium-published', '00000000-0000-0000-0000-000000205412/22222222-2222-2222-2222-222222222222.pdf',
   '00000000-0000-0000-0000-000000205431',
   jsonb_build_object('mimetype', 'application/pdf', 'size', 2048));

-- Structure: the switch's column is gone, the link column is readable like its siblings, the RPCs are not anon's,
-- and neither RPC touches entries ("changes no entry").
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'shows' AND column_name = 'uses_landing_page'
  ) THEN
    RAISE EXCEPTION 'FAIL shows.uses_landing_page still exists';
  END IF;
  IF NOT has_column_privilege('anon', 'public.shows', 'own_premium_link', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon cannot read shows.own_premium_link';
  END IF;
  IF has_function_privilege('anon', 'public.set_own_premium(uuid, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.unpublish_premium(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute set_own_premium or unpublish_premium';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.set_own_premium(uuid, text, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.unpublish_premium(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute set_own_premium or unpublish_premium';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname IN ('set_own_premium', 'unpublish_premium')
       AND prosrc ~* '(entries|enrollments)'
  ) THEN
    RAISE EXCEPTION 'FAIL set_own_premium or unpublish_premium reads or writes entries';
  END IF;
END $$;

-- The announcement Show A starts with, as the publication RPC would have left it.
UPDATE public.shows
   SET experience_is_published = true,
       experience_published_at = now(),
       experience_published_style = 'heritage',
       experience_published_content = '{"outputs":{}}'::jsonb
 WHERE id = '00000000-0000-0000-0000-000000205411';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_id CONSTANT uuid := '00000000-0000-0000-0000-000000205431';
  nobody_id CONSTANT uuid := '00000000-0000-0000-0000-000000205432';
  show_a CONSTANT uuid := '00000000-0000-0000-0000-000000205411';
  show_b CONSTANT uuid := '00000000-0000-0000-0000-000000205412';
  path_a CONSTANT text := '00000000-0000-0000-0000-000000205411/11111111-1111-1111-1111-111111111111.pdf';
  path_b CONSTANT text := '00000000-0000-0000-0000-000000205412/22222222-2222-2222-2222-222222222222.pdf';
  base CONSTANT text := 'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/';
  state record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text, true);

  -- A link is saved on the show.
  PERFORM public.set_own_premium(show_a, 'https://club.example.org/premium.pdf', NULL, NULL);
  SELECT * INTO state FROM public.shows WHERE id = show_a;
  IF state.own_premium_link IS DISTINCT FROM 'https://club.example.org/premium.pdf'
     OR state.published_premium_path IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL link was not saved (link=%, path=%)', state.own_premium_link, state.published_premium_path;
  END IF;

  -- Neither, both, and a malformed link are refused.
  BEGIN
    PERFORM public.set_own_premium(show_a, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL neither link nor file was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.set_own_premium(show_a, 'https://x.example/a', path_a, base || path_a);
    RAISE EXCEPTION 'FAIL both link and file were accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.set_own_premium(show_a, 'javascript:alert(1)', NULL, NULL);
    RAISE EXCEPTION 'FAIL non-http link was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.set_own_premium(show_a, 'https://has space.example/a', NULL, NULL);
    RAISE EXCEPTION 'FAIL link with whitespace was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- An uploaded file: wrong URL, another show's path and an unstaged path are refused.
  BEGIN
    PERFORM public.set_own_premium(show_a, NULL, path_a, 'https://evil.example/x.pdf');
    RAISE EXCEPTION 'FAIL untrusted public URL was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.set_own_premium(show_a, NULL, path_b, base || path_b);
    RAISE EXCEPTION 'FAIL another show''s artifact path was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.set_own_premium(show_a,
      NULL,
      '00000000-0000-0000-0000-000000205411/33333333-3333-3333-3333-333333333333.pdf',
      base || '00000000-0000-0000-0000-000000205411/33333333-3333-3333-3333-333333333333.pdf');
    RAISE EXCEPTION 'FAIL an unstaged artifact was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- The staged upload commits, replaces the link, and bumps the publish version.
  PERFORM public.set_own_premium(show_a, NULL, path_a, base || path_a);
  SELECT * INTO state FROM public.shows WHERE id = show_a;
  IF state.published_premium_path IS DISTINCT FROM path_a
     OR state.published_premium_url IS DISTINCT FROM base || path_a
     OR state.published_premium_at IS NULL
     OR state.published_premium_version IS NULL
     OR state.own_premium_link IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL upload did not commit cleanly: %', to_jsonb(state);
  END IF;

  -- A link replaces the upload.
  PERFORM public.set_own_premium(show_a, 'https://club.example.org/second.pdf', NULL, NULL);
  SELECT * INTO state FROM public.shows WHERE id = show_a;
  IF state.own_premium_link IS DISTINCT FROM 'https://club.example.org/second.pdf'
     OR state.published_premium_path IS NOT NULL
     OR state.published_premium_url IS NOT NULL
     OR state.published_premium_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a link did not replace the uploaded file: %', to_jsonb(state);
  END IF;

  -- A client cannot write the link directly (the guard trigger), nor another show's premium.
  BEGIN
    UPDATE public.shows SET own_premium_link = 'https://forged.example/x' WHERE id = show_a;
    RAISE EXCEPTION 'FAIL a direct UPDATE wrote own_premium_link';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%only by the publication RPC%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_own_premium(show_b, 'https://club.example.org/x.pdf', NULL, NULL);
    RAISE EXCEPTION 'FAIL a manager of another club set this show''s premium';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Unpublish: the file/link and the announcement go. Put an upload back first so every
  -- pointer is set at once.
  PERFORM public.set_own_premium(show_a, NULL, path_a, base || path_a);
  PERFORM public.unpublish_premium(show_a);
  SELECT * INTO state FROM public.shows WHERE id = show_a;
  IF state.published_premium_path IS NOT NULL
     OR state.published_premium_url IS NOT NULL
     OR state.published_premium_at IS NOT NULL
     OR state.published_premium_version IS NOT NULL
     OR state.own_premium_link IS NOT NULL
     OR state.experience_is_published IS DISTINCT FROM false
     OR state.experience_published_at IS NOT NULL
     OR state.experience_published_style IS NOT NULL
     OR state.experience_published_content IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL unpublish left premium state behind: %', to_jsonb(state);
  END IF;
  -- The show itself stays public: unpublish takes down the premium, not the listing.
  IF state.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL unpublish changed the show status to %', state.status;
  END IF;

  -- Publishing again is possible.
  PERFORM public.set_own_premium(show_a, 'https://club.example.org/again.pdf', NULL, NULL);

  -- Someone with no role on the show cannot unpublish or set.
  PERFORM set_config('request.jwt.claim.sub', nobody_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', nobody_id, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.unpublish_premium(show_a);
    RAISE EXCEPTION 'FAIL a user with no role unpublished a show';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.set_own_premium(show_a, 'https://club.example.org/x.pdf', NULL, NULL);
    RAISE EXCEPTION 'FAIL a user with no role set a premium';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;

ROLLBACK;
