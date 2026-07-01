-- Seed ASCA Scent Detection "Level C" continuation classes into the show-creation
-- wizard template (sport_templates / sport_class_rules).
--
-- WHY: Two registry systems had drifted. The RegistrySport config
-- (apps/myk9show/src/features/registries/asca.ts) already declares Level C as a
-- `continuation` variant for all four base levels, but the DB template that drives the
-- wizard Step 3 class grid only had the 16 base classes — so ASCA's Level C classes were
-- never selectable at show creation. Product decision (2026-07-01 live walk): Level C IS a
-- separately-scheduled class and should be seedable; Champion is titling/invitational and is
-- intentionally NOT seeded here (it stays a config-only construct).
--
-- Level C is a real class with its own element titles (SCNc-C, etc.) — ASCA Scent Detection
-- Program Rules §3.2.2 / §5.2. Per §5.2.2 "the same methods and standards are used for judging
-- and scoring the Level C classes as the base level classes", so each Level C row is an exact
-- parameter-clone of its base sibling. We clone via INSERT ... SELECT rather than re-typing the
-- numbers, guaranteeing parity by construction.
--
-- NOTE on section_mode: the column is currently decorative (no code reads it — section behavior
-- comes purely from which rows exist). We update 'none' -> 'all-levels' so the metadata stops
-- contradicting the rows it now has (sections exist at every base level). The additive
-- continuation semantics (base retained AND a 'C' class) — as opposed to UKC's A/B ownership
-- sections which REPLACE the base — are encoded in the RegistrySport config `kind`, not here.

BEGIN;

-- 1. Make the template's section metadata truthful now that sections exist at every level.
UPDATE public.sport_templates
SET section_mode = 'all-levels',
    updated_at = now()
WHERE sport_code = 'asca-scent-detection'
  AND section_mode <> 'all-levels';

-- 2. Add 16 Level C rows (4 elements x 4 base levels), cloning each base row's parameters.
--    section='C', class_name suffixed with ' Level C' (matches the config-layer output), and
--    display_order 17..32 appended after the existing 16 base rows (1..16). Idempotent via
--    NOT EXISTS so re-running the migration or re-seeding a fresh DB is safe.
INSERT INTO public.sport_class_rules (
  sport_template_id, element, level, class_name, section, display_order,
  max_time_seconds_fixed, max_time_seconds_min, max_time_seconds_max,
  hide_count_fixed, hide_count_min, hide_count_max, hides_known,
  area_count, has_blank, distraction_count_min, distraction_count_max,
  timer_mode, odors, default_entry_fee, mrv_minutes,
  max_time_seconds_area2, max_time_seconds_area3, has_30_second_warning,
  time_type, warning_notes, field_overrides
)
SELECT
  base.sport_template_id,
  base.element,
  base.level,
  base.class_name || ' Level C',
  'C',
  16 + row_number() OVER (ORDER BY base.display_order),
  base.max_time_seconds_fixed, base.max_time_seconds_min, base.max_time_seconds_max,
  base.hide_count_fixed, base.hide_count_min, base.hide_count_max, base.hides_known,
  base.area_count, base.has_blank, base.distraction_count_min, base.distraction_count_max,
  base.timer_mode, base.odors, base.default_entry_fee, base.mrv_minutes,
  base.max_time_seconds_area2, base.max_time_seconds_area3, base.has_30_second_warning,
  base.time_type, base.warning_notes, base.field_overrides
FROM public.sport_class_rules base
JOIN public.sport_templates st ON st.id = base.sport_template_id
WHERE st.sport_code = 'asca-scent-detection'
  AND base.section IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.sport_class_rules existing
    WHERE existing.sport_template_id = base.sport_template_id
      AND existing.element = base.element
      AND existing.level = base.level
      AND existing.section = 'C'
  );

COMMIT;
