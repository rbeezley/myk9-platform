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

ROLLBACK;
