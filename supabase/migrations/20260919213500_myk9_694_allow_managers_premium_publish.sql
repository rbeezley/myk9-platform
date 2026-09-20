-- MYK9-694: premium generation authorizes every show manager, so premium PDF
-- storage must use the same show-scoped manager predicate.
--
-- The generate-premium function deliberately admits can_manage_show() callers
-- (club admins, trial secretaries, and platform admins). Migration 190 narrowed
-- this bucket to is_show_secretary(), leaving an authorized club admin unable
-- to complete the canonical generate -> upload -> publish flow. Keep the
-- existing public-read bucket and stable <show_id>.pdf path; widen only the
-- write predicates to the authorization already used by generation.

DROP POLICY IF EXISTS "Secretaries can upload premium published" ON storage.objects;
CREATE POLICY "Show managers can upload premium published"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'premium-published'
  AND (
    (SELECT public.can_manage_show(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_show_secretary(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_platform_admin())
  )
);

DROP POLICY IF EXISTS "Secretaries can update premium published" ON storage.objects;
CREATE POLICY "Show managers can update premium published"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'premium-published'
  AND (
    (SELECT public.can_manage_show(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_show_secretary(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_platform_admin())
  )
)
WITH CHECK (
  bucket_id = 'premium-published'
  AND (
    (SELECT public.can_manage_show(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_show_secretary(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_platform_admin())
  )
);

DROP POLICY IF EXISTS "Secretaries can delete premium published" ON storage.objects;
CREATE POLICY "Show managers can delete premium published"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'premium-published'
  AND (
    (SELECT public.can_manage_show(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_show_secretary(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_platform_admin())
  )
);
