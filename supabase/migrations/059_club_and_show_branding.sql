-- Add branding columns to clubs
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS accent_color TEXT;

-- Add branding override columns to shows (nullable = inherit from club)
ALTER TABLE shows ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS accent_color TEXT;

-- Storage RLS policies for club branding images.
-- Uses existing SECURITY DEFINER functions: is_club_admin(club_id), is_platform_admin().
-- Note: public SELECT already covered by migration 013 blanket policy on images bucket.

CREATE POLICY "Club admins can upload club branding"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'clubs'
  AND (
    (SELECT is_club_admin((storage.foldername(name))[2]::uuid))
    OR (SELECT is_platform_admin())
  )
);

CREATE POLICY "Club admins can update club branding"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'clubs'
  AND (
    (SELECT is_club_admin((storage.foldername(name))[2]::uuid))
    OR (SELECT is_platform_admin())
  )
);

CREATE POLICY "Club admins can delete club branding"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'clubs'
  AND (
    (SELECT is_club_admin((storage.foldername(name))[2]::uuid))
    OR (SELECT is_platform_admin())
  )
);

-- Storage RLS policies for show branding images.
-- Uses is_trial_secretary() scoped to the show's club_id.

CREATE POLICY "Secretaries can upload show branding"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'shows'
  AND (
    EXISTS (
      SELECT 1 FROM shows s
      WHERE s.id = (storage.foldername(name))[2]::uuid
        AND (SELECT is_trial_secretary(s.club_id))
    )
    OR (SELECT is_platform_admin())
  )
);

CREATE POLICY "Secretaries can update show branding"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'shows'
  AND (
    EXISTS (
      SELECT 1 FROM shows s
      WHERE s.id = (storage.foldername(name))[2]::uuid
        AND (SELECT is_trial_secretary(s.club_id))
    )
    OR (SELECT is_platform_admin())
  )
);

CREATE POLICY "Secretaries can delete show branding"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'shows'
  AND (
    EXISTS (
      SELECT 1 FROM shows s
      WHERE s.id = (storage.foldername(name))[2]::uuid
        AND (SELECT is_trial_secretary(s.club_id))
    )
    OR (SELECT is_platform_admin())
  )
);
