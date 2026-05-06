-- supabase/migrations/191_rename_premium_styles.sql
-- rollback: see end of file
--
-- Phase 1 of the Premium Designs Handoff renames the three existing style
-- identifiers to align with the new design vocabulary:
--   classic -> monogram
--   modern  -> banner
--   minimal -> headline
--
-- Five additional style stubs (magazine, poster, gazette, fieldGuide,
-- heritage) are reserved now so later phases can land their tokens without
-- another migration.
--
-- The check constraint on club_premium_templates.style currently restricts
-- values to ('classic','modern','minimal'). We must:
--   1. Drop the old check constraint.
--   2. Update existing rows to the new vocabulary.
--   3. Update the column default to 'monogram'.
--   4. Add a new check constraint covering all 8 style identifiers.

-- 1. Drop the old constraint. The constraint was created inline in 188 so it
--    has the auto-generated name club_premium_templates_style_check.
alter table public.club_premium_templates
  drop constraint if exists club_premium_templates_style_check;

-- 2. Migrate existing values.
update public.club_premium_templates
set style = case style
  when 'classic' then 'monogram'
  when 'modern'  then 'banner'
  when 'minimal' then 'headline'
  else style
end
where style in ('classic', 'modern', 'minimal');

-- 3. New default for newly created rows.
alter table public.club_premium_templates
  alter column style set default 'monogram';

-- 4. New check constraint covering the full Phase 1 style vocabulary.
alter table public.club_premium_templates
  add constraint club_premium_templates_style_check
  check (style in (
    'monogram', 'banner', 'headline',
    'magazine', 'poster', 'gazette', 'fieldGuide', 'heritage'
  ));

-- rollback:
--   alter table public.club_premium_templates
--     drop constraint if exists club_premium_templates_style_check;
--   update public.club_premium_templates
--   set style = case style
--     when 'monogram' then 'classic'
--     when 'banner'   then 'modern'
--     when 'headline' then 'minimal'
--     else 'classic'
--   end;
--   alter table public.club_premium_templates
--     alter column style set default 'classic';
--   alter table public.club_premium_templates
--     add constraint club_premium_templates_style_check
--     check (style in ('classic', 'modern', 'minimal'));
