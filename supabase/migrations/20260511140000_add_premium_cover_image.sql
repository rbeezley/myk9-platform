-- Add an optional cover image to premium templates. Gazette and Magazine can
-- use it for their cover art while older templates keep the existing stat-panel
-- fallback because NULL means "no cover image uploaded".

alter table public.club_premium_templates
  add column if not exists cover_image_url text;
