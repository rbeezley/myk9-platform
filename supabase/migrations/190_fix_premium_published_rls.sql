-- Migration 190: Fix premium-published storage RLS to use is_show_secretary().
--
-- Migration 189's policies called is_trial_secretary(s.club_id), which was
-- tightened in migration 102 to require ur.club_id = check_club_id. But
-- per-show secretaries (migration 099) write user_roles with show_id set
-- and club_id NULL, so is_trial_secretary returns false for them.
--
-- The correct helper for "is this user a secretary for this specific show"
-- is is_show_secretary(check_show_id), which already exists from migration
-- 099 and includes the site_admin escalation path.
--
-- Also fixes an operator-precedence bug: `A AND B OR is_platform_admin()`
-- parsed as `(A AND B) OR is_platform_admin()`, allowing platform admins
-- to upload to ANY bucket. Parenthesizing forces the bucket guard to apply.

DROP POLICY IF EXISTS "Secretaries can upload premium published" ON storage.objects;
CREATE POLICY "Secretaries can upload premium published"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'premium-published'
  AND (
    (SELECT is_show_secretary(split_part(name, '.', 1)::uuid))
    OR (SELECT is_platform_admin())
  )
);

DROP POLICY IF EXISTS "Secretaries can update premium published" ON storage.objects;
CREATE POLICY "Secretaries can update premium published"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'premium-published'
  AND (
    (SELECT is_show_secretary(split_part(name, '.', 1)::uuid))
    OR (SELECT is_platform_admin())
  )
);

DROP POLICY IF EXISTS "Secretaries can delete premium published" ON storage.objects;
CREATE POLICY "Secretaries can delete premium published"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'premium-published'
  AND (
    (SELECT is_show_secretary(split_part(name, '.', 1)::uuid))
    OR (SELECT is_platform_admin())
  )
);
