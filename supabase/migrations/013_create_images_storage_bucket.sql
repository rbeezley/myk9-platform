-- Migration: Create images storage bucket for profile and dog photos
-- This bucket is used by the ImageUpload service in myK9Show

-- Create the images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images',
  'images',
  true,  -- Public bucket for profile photos
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow authenticated users to upload their own profile photos
CREATE POLICY "Users can upload their own profile photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images' AND
  (storage.foldername(name))[1] = 'profiles' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy: Allow authenticated users to upload dog photos to their folder
CREATE POLICY "Users can upload dog photos to their folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images' AND
  (storage.foldername(name))[1] = 'dogs' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy: Allow authenticated users to update their own photos
CREATE POLICY "Users can update their own photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images' AND
  (
    ((storage.foldername(name))[1] = 'profiles' AND (storage.foldername(name))[2] = auth.uid()::text) OR
    ((storage.foldername(name))[1] = 'dogs' AND (storage.foldername(name))[2] = auth.uid()::text)
  )
);

-- Policy: Allow authenticated users to delete their own photos
CREATE POLICY "Users can delete their own photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images' AND
  (
    ((storage.foldername(name))[1] = 'profiles' AND (storage.foldername(name))[2] = auth.uid()::text) OR
    ((storage.foldername(name))[1] = 'dogs' AND (storage.foldername(name))[2] = auth.uid()::text)
  )
);

-- Policy: Allow public read access to all images (public bucket)
CREATE POLICY "Public read access for images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'images');
