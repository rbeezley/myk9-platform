-- Migration 189: Published premium PDF support.
--
-- Adds a public-readable Storage bucket and two columns on `shows` so a
-- secretary can publish a premium-list PDF for exhibitors. The published
-- file is a snapshot — exhibitors get a stable download URL that doesn't
-- silently change when the secretary edits the show. A "data has changed
-- since publish" badge surfaces in the UI by comparing
-- `shows.updated_at` against `shows.published_premium_at`.
--
-- Why a dedicated bucket: the existing `images` bucket has SELECT
-- policies tuned for image traffic (CDN cache headers, content-type checks)
-- and lumping PDFs in there would conflate two access patterns. A separate
-- `premium-published` bucket lets us keep the public-read policy clean and
-- adds room for future per-bucket caching/CDN tuning.

-- 1. Add tracking columns to shows
ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS published_premium_url TEXT,
  ADD COLUMN IF NOT EXISTS published_premium_at TIMESTAMPTZ;

COMMENT ON COLUMN shows.published_premium_url IS
  'Public Storage URL of the most recently published premium PDF. NULL = never published.';
COMMENT ON COLUMN shows.published_premium_at IS
  'Timestamp of the last publish action. Compare with updated_at to detect stale snapshots.';

-- 2. Create the public-read Storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('premium-published', 'premium-published', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. RLS — anyone can SELECT (public read), only secretaries/admins can write.
-- Path scheme: `<show_id>.pdf` (one file per show, replaced on republish).

DROP POLICY IF EXISTS "Public read premium published" ON storage.objects;
CREATE POLICY "Public read premium published"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'premium-published');

DROP POLICY IF EXISTS "Secretaries can upload premium published" ON storage.objects;
CREATE POLICY "Secretaries can upload premium published"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'premium-published'
  AND EXISTS (
    SELECT 1 FROM shows s
    WHERE s.id::text = split_part(name, '.', 1)
      AND (SELECT is_trial_secretary(s.club_id))
  )
  OR (SELECT is_platform_admin())
);

DROP POLICY IF EXISTS "Secretaries can update premium published" ON storage.objects;
CREATE POLICY "Secretaries can update premium published"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'premium-published'
  AND EXISTS (
    SELECT 1 FROM shows s
    WHERE s.id::text = split_part(name, '.', 1)
      AND (SELECT is_trial_secretary(s.club_id))
  )
  OR (SELECT is_platform_admin())
);

DROP POLICY IF EXISTS "Secretaries can delete premium published" ON storage.objects;
CREATE POLICY "Secretaries can delete premium published"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'premium-published'
  AND EXISTS (
    SELECT 1 FROM shows s
    WHERE s.id::text = split_part(name, '.', 1)
      AND (SELECT is_trial_secretary(s.club_id))
  )
  OR (SELECT is_platform_admin())
);
