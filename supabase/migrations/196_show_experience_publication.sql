ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS experience_is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS experience_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS experience_published_style text,
  ADD COLUMN IF NOT EXISTS experience_published_content jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.shows
  DROP CONSTRAINT IF EXISTS shows_experience_published_style_check,
  ADD CONSTRAINT shows_experience_published_style_check
  CHECK (
    experience_published_style IS NULL OR
    experience_published_style IN (
      'monogram',
      'banner',
      'headline',
      'magazine',
      'poster',
      'gazette',
      'fieldGuide',
      'heritage'
    )
  );
