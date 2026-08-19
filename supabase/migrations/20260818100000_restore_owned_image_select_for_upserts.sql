-- Restore the owner-scoped SELECT permission required by Storage upserts.
--
-- 20260712130000 removed the public images SELECT policy to prevent bucket
-- listing. Supabase Storage upserts require SELECT as well as INSERT/UPDATE,
-- so profile and dog photo uploads began failing with an RLS error. Keep
-- listing private by exposing only objects inside the authenticated user's
-- own profile and dog folders.

DROP POLICY IF EXISTS "Users can read their own photos" ON storage.objects;

CREATE POLICY "Users can read their own photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'images' AND
  (
    (
      (storage.foldername(name))[1] = 'profiles' AND
      (storage.foldername(name))[2] = (SELECT auth.uid())::text
    ) OR
    (
      (storage.foldername(name))[1] = 'dogs' AND
      (storage.foldername(name))[2] = (SELECT auth.uid())::text
    )
  )
);
