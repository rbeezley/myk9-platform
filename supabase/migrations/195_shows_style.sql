-- Rename shows.landing_style → shows.style and expand the allowed values
-- to match the full set of premium style identifiers from migration 191.
--
-- Background: landing_style was added in 192 with only ('default','heritage').
-- Now that each premium style will have its own full experience package
-- (landing page, entry blank, confirmation email), shows.style becomes the
-- single source-of-truth for all four touchpoints.
--
-- Existing 'default' rows are migrated to 'monogram' (the original classic
-- style) so every show has an explicit style going forward.

begin;

-- 1. Rename the column.
alter table public.shows
  rename column landing_style to style;

-- 2. Drop the old narrow constraint.
alter table public.shows
  drop constraint if exists shows_landing_style_check;

-- 3. Migrate 'default' rows to the canonical fallback style.
update public.shows
  set style = 'monogram'
  where style = 'default';

-- 4. Tighten the default and add the new constraint.
alter table public.shows
  alter column style set default 'monogram';

alter table public.shows
  add constraint shows_style_check
  check (style in (
    'monogram', 'banner', 'headline',
    'magazine', 'poster', 'gazette', 'fieldGuide', 'heritage'
  ));

commit;
