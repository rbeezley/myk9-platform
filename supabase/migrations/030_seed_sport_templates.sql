-- =============================================================================
-- Migration 030: Seed Sport Templates and Class Rules
-- =============================================================================
-- Populates sport_templates and sport_class_rules with AKC Scent Work,
-- UKC Nosework, and ASCA Scent Detection configurations.
--
-- Values cross-referenced against:
--   - apps/myk9show/src/data/templates/akcScentWorkRules.ts
--   - apps/myk9show/src/data/templates/akcScentWorkTemplate.ts
--   - apps/myk9show/src/pages/scoring/scoresheets/UKC/UKCNoseworkScoresheet.tsx
--   - apps/myk9show/src/pages/scoring/scoresheets/ASCA/ASCAScentDetectionScoresheet.tsx
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Fix: allow NULL level for standalone classes (e.g. AKC Detective)
-- ---------------------------------------------------------------------------
ALTER TABLE sport_class_rules ALTER COLUMN level DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 1. Insert sport templates (3 rows)
-- ---------------------------------------------------------------------------
INSERT INTO sport_templates (organization, sport_name, sport_code, elements, levels, section_mode, divisions, operational_config, export_config)
VALUES
  (
    'AKC',
    'Scent Work',
    'akc-scent-work',
    ARRAY['Container', 'Interior', 'Exterior', 'Buried', 'Handler Discrimination', 'Detective'],
    ARRAY['Novice', 'Advanced', 'Excellent', 'Master'],
    'novice-only',
    ARRAY['Odor Search Division', 'Handler Discrimination Division', 'Detective Division'],
    '{"equipmentNeeded": ["containers", "barriers", "hides", "distraction items"], "requiredPersonnel": ["Judge", "Gate Steward", "Table Steward", "Timer"], "minimumAge": 6}'::jsonb,
    '{"format": "akc-catalog", "recordingFee": 3.00, "entryFees": {"preEntry": 30, "dayOfShow": 35}}'::jsonb
  ),
  (
    'UKC',
    'Nosework',
    'ukc-nosework',
    ARRAY['Container', 'Interior', 'Exterior', 'Vehicle', 'Handler Discrimination'],
    ARRAY['Novice', 'Advanced', 'Superior', 'Master', 'Elite'],
    'all-levels',
    '{}'::text[],
    '{"equipmentNeeded": ["containers", "barriers", "hides", "vehicles"], "requiredPersonnel": ["Judge", "Gate Steward", "Table Steward", "Timer"]}'::jsonb,
    '{"format": "ukc-judges-book", "recordingFee": 0}'::jsonb
  ),
  (
    'ASCA',
    'Scent Detection',
    'asca-scent-detection',
    ARRAY['Container', 'Interior', 'Exterior', 'Vehicle'],
    ARRAY['Novice', 'Open', 'Advanced', 'Excellent'],
    'none',
    '{}'::text[],
    '{"equipmentNeeded": ["containers", "barriers", "hides", "vehicles"], "requiredPersonnel": ["Judge", "Gate Steward", "Table Steward", "Timer"]}'::jsonb,
    '{"format": "asca-paperwork", "recordingFee": 0}'::jsonb
  )
ON CONFLICT (sport_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Seed AKC Scent Work class rules (26 rows)
-- ---------------------------------------------------------------------------
-- Source: akcScentWorkRules.ts — getTimeLimit(), getSearchAreas(),
--         getHideConfiguration(), getDistractionCount(), getEstimatedJudgingTime()
--
-- Columns: sport_template_id, element, level, class_name, section, display_order,
--   max_time_seconds_fixed, max_time_seconds_min, max_time_seconds_max,
--   hide_count_fixed, hide_count_min, hide_count_max, hides_known,
--   area_count, has_blank, distraction_count_min, distraction_count_max,
--   timer_mode, odors, default_entry_fee, mrv_minutes

DO $$
DECLARE
  akc_id UUID;
BEGIN
  SELECT id INTO akc_id FROM sport_templates WHERE sport_code = 'akc-scent-work';

  INSERT INTO sport_class_rules (
    sport_template_id, element, level, class_name, section, display_order,
    max_time_seconds_fixed, max_time_seconds_min, max_time_seconds_max,
    hide_count_fixed, hide_count_min, hide_count_max, hides_known,
    area_count, has_blank, distraction_count_min, distraction_count_max,
    timer_mode, odors, default_entry_fee, mrv_minutes
  ) VALUES
    -- Container: fixed time limits (2/2/3/4 min)
    (akc_id, 'Container', 'Novice', 'Container Novice A', 'A', 1,
     120, NULL, NULL, 1, NULL, NULL, true,
     1, false, 0, 0, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 2.5),
    (akc_id, 'Container', 'Novice', 'Container Novice B', 'B', 2,
     120, NULL, NULL, 1, NULL, NULL, true,
     1, false, 0, 0, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 2.5),
    (akc_id, 'Container', 'Advanced', 'Container Advanced', NULL, 3,
     120, NULL, NULL, 2, NULL, NULL, true,
     1, false, 1, 1, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 3.0),
    (akc_id, 'Container', 'Excellent', 'Container Excellent', NULL, 4,
     180, NULL, NULL, 3, NULL, NULL, true,
     1, false, 2, 2, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 4.0),
    (akc_id, 'Container', 'Master', 'Container Master', NULL, 5,
     240, NULL, NULL, NULL, 1, 3, false,
     1, false, 3, 3, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 5.0),

    -- Interior: judge-set time (1-3 min), multi-area at Excellent (2) and Master (3)
    (akc_id, 'Interior', 'Novice', 'Interior Novice A', 'A', 6,
     NULL, 60, 180, 1, NULL, NULL, true,
     1, false, 0, 0, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 2.5),
    (akc_id, 'Interior', 'Novice', 'Interior Novice B', 'B', 7,
     NULL, 60, 180, 1, NULL, NULL, true,
     1, false, 0, 0, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 2.5),
    (akc_id, 'Interior', 'Advanced', 'Interior Advanced', NULL, 8,
     NULL, 60, 180, 2, NULL, NULL, true,
     1, false, 1, 1, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 3.0),
    (akc_id, 'Interior', 'Excellent', 'Interior Excellent', NULL, 9,
     NULL, 60, 180, NULL, 1, 3, false,
     2, false, 2, 2, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 6.5),
    (akc_id, 'Interior', 'Master', 'Interior Master', NULL, 10,
     NULL, 60, 180, NULL, 2, 6, false,
     3, false, 3, 3, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 8.0),

    -- Exterior: judge-set time (2-4 Nov/Adv, 3-5 Exc/Mas)
    (akc_id, 'Exterior', 'Novice', 'Exterior Novice A', 'A', 11,
     NULL, 120, 240, 1, NULL, NULL, true,
     1, false, 0, 0, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 2.5),
    (akc_id, 'Exterior', 'Novice', 'Exterior Novice B', 'B', 12,
     NULL, 120, 240, 1, NULL, NULL, true,
     1, false, 0, 0, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 2.5),
    (akc_id, 'Exterior', 'Advanced', 'Exterior Advanced', NULL, 13,
     NULL, 120, 240, 2, NULL, NULL, true,
     1, false, 1, 1, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 3.0),
    (akc_id, 'Exterior', 'Excellent', 'Exterior Excellent', NULL, 14,
     NULL, 180, 300, 3, NULL, NULL, true,
     1, false, 2, 2, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 4.0),
    (akc_id, 'Exterior', 'Master', 'Exterior Master', NULL, 15,
     NULL, 180, 300, NULL, 1, 3, false,
     1, false, 3, 3, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 5.0),

    -- Buried: fixed time limits (2/3/4/5 min)
    (akc_id, 'Buried', 'Novice', 'Buried Novice A', 'A', 16,
     120, NULL, NULL, 1, NULL, NULL, true,
     1, false, 0, 0, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 2.5),
    (akc_id, 'Buried', 'Novice', 'Buried Novice B', 'B', 17,
     120, NULL, NULL, 1, NULL, NULL, true,
     1, false, 0, 0, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 2.5),
    (akc_id, 'Buried', 'Advanced', 'Buried Advanced', NULL, 18,
     180, NULL, NULL, 2, NULL, NULL, true,
     1, false, 1, 1, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 3.0),
    (akc_id, 'Buried', 'Excellent', 'Buried Excellent', NULL, 19,
     240, NULL, NULL, 3, NULL, NULL, true,
     1, false, 2, 2, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 4.0),
    (akc_id, 'Buried', 'Master', 'Buried Master', NULL, 20,
     300, NULL, NULL, NULL, 1, 4, false,
     1, false, 3, 3, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 5.0),

    -- Handler Discrimination: fixed 2min Nov, judge-set others, 2 areas at Master
    (akc_id, 'Handler Discrimination', 'Novice', 'Handler Discrimination Novice A', 'A', 21,
     120, NULL, NULL, 1, NULL, NULL, true,
     1, false, 0, 0, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 2.5),
    (akc_id, 'Handler Discrimination', 'Novice', 'Handler Discrimination Novice B', 'B', 22,
     120, NULL, NULL, 1, NULL, NULL, true,
     1, false, 0, 0, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 2.5),
    (akc_id, 'Handler Discrimination', 'Advanced', 'Handler Discrimination Advanced', NULL, 23,
     NULL, 120, 300, 1, NULL, NULL, true,
     1, false, 1, 1, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 3.0),
    (akc_id, 'Handler Discrimination', 'Excellent', 'Handler Discrimination Excellent', NULL, 24,
     NULL, 180, 360, 1, NULL, NULL, true,
     1, false, 1, 1, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 4.0),
    (akc_id, 'Handler Discrimination', 'Master', 'Handler Discrimination Master', NULL, 25,
     NULL, 120, 180, 3, NULL, NULL, true,
     2, false, 1, 2, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 30.00, 5.0),

    -- Detective: standalone, judge-set 7-15 min, 5-10 hides, 4-6 distractions
    (akc_id, 'Detective', NULL, 'Detective', NULL, 26,
     NULL, 420, 900, NULL, 5, 10, false,
     1, false, 4, 6, 'single', ARRAY['Birch','Anise','Clove','Cypress'], 35.00, 5.0);
END $$;

-- ---------------------------------------------------------------------------
-- 3. Seed UKC Nosework class rules (50 rows: 5 elements × 5 levels × 2 sections)
-- ---------------------------------------------------------------------------
-- Source: UKCNoseworkScoresheet.tsx — isDualTimerLevel()
-- Dual timer at Superior, Master, Elite
-- A/B sections at every level

DO $$
DECLARE
  ukc_id UUID;
BEGIN
  SELECT id INTO ukc_id FROM sport_templates WHERE sport_code = 'ukc-nosework';

  INSERT INTO sport_class_rules (
    sport_template_id, element, level, class_name, section, display_order,
    max_time_seconds_fixed, max_time_seconds_min, max_time_seconds_max,
    hide_count_fixed, hide_count_min, hide_count_max, hides_known,
    area_count, has_blank, distraction_count_min, distraction_count_max,
    timer_mode, odors, default_entry_fee, mrv_minutes
  ) VALUES
    -- Container
    (ukc_id, 'Container', 'Novice', 'Container Novice A', 'A', 1,
     NULL, 60, 150, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Birch'], NULL, 1.5),
    (ukc_id, 'Container', 'Novice', 'Container Novice B', 'B', 2,
     NULL, 60, 150, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Birch'], NULL, 1.5),
    (ukc_id, 'Container', 'Advanced', 'Container Advanced A', 'A', 3,
     NULL, 60, 180, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Anise'], NULL, 2.0),
    (ukc_id, 'Container', 'Advanced', 'Container Advanced B', 'B', 4,
     NULL, 60, 180, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Anise'], NULL, 2.0),
    (ukc_id, 'Container', 'Superior', 'Container Superior A', 'A', 5,
     NULL, 120, 180, NULL, 2, 3, false, 1, false, 0, 0, 'dual', ARRAY['Clove'], NULL, 2.5),
    (ukc_id, 'Container', 'Superior', 'Container Superior B', 'B', 6,
     NULL, 120, 180, NULL, 2, 3, false, 1, false, 0, 0, 'dual', ARRAY['Clove'], NULL, 2.5),
    (ukc_id, 'Container', 'Master', 'Container Master A', 'A', 7,
     NULL, 120, 240, NULL, 3, 4, false, 1, false, 0, 0, 'dual', ARRAY['Myrrh'], NULL, 3.0),
    (ukc_id, 'Container', 'Master', 'Container Master B', 'B', 8,
     NULL, 120, 240, NULL, 3, 4, false, 1, false, 0, 0, 'dual', ARRAY['Myrrh'], NULL, 3.0),
    (ukc_id, 'Container', 'Elite', 'Container Elite A', 'A', 9,
     NULL, 150, 270, NULL, 4, 5, false, 1, false, 0, 0, 'dual', ARRAY['Vetiver'], NULL, 3.5),
    (ukc_id, 'Container', 'Elite', 'Container Elite B', 'B', 10,
     NULL, 150, 270, NULL, 4, 5, false, 1, false, 0, 0, 'dual', ARRAY['Vetiver'], NULL, 3.5),

    -- Interior
    (ukc_id, 'Interior', 'Novice', 'Interior Novice A', 'A', 11,
     NULL, 60, 150, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Birch'], NULL, 1.5),
    (ukc_id, 'Interior', 'Novice', 'Interior Novice B', 'B', 12,
     NULL, 60, 150, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Birch'], NULL, 1.5),
    (ukc_id, 'Interior', 'Advanced', 'Interior Advanced A', 'A', 13,
     NULL, 60, 180, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Anise'], NULL, 2.0),
    (ukc_id, 'Interior', 'Advanced', 'Interior Advanced B', 'B', 14,
     NULL, 60, 180, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Anise'], NULL, 2.0),
    (ukc_id, 'Interior', 'Superior', 'Interior Superior A', 'A', 15,
     NULL, 120, 180, NULL, 2, 3, false, 1, false, 0, 0, 'dual', ARRAY['Clove'], NULL, 2.5),
    (ukc_id, 'Interior', 'Superior', 'Interior Superior B', 'B', 16,
     NULL, 120, 180, NULL, 2, 3, false, 1, false, 0, 0, 'dual', ARRAY['Clove'], NULL, 2.5),
    (ukc_id, 'Interior', 'Master', 'Interior Master A', 'A', 17,
     NULL, 120, 240, NULL, 3, 4, false, 1, false, 0, 0, 'dual', ARRAY['Myrrh'], NULL, 3.5),
    (ukc_id, 'Interior', 'Master', 'Interior Master B', 'B', 18,
     NULL, 120, 240, NULL, 3, 4, false, 1, false, 0, 0, 'dual', ARRAY['Myrrh'], NULL, 3.5),
    (ukc_id, 'Interior', 'Elite', 'Interior Elite A', 'A', 19,
     NULL, 150, 270, NULL, 4, 5, false, 1, false, 0, 0, 'dual', ARRAY['Vetiver'], NULL, 4.0),
    (ukc_id, 'Interior', 'Elite', 'Interior Elite B', 'B', 20,
     NULL, 150, 270, NULL, 4, 5, false, 1, false, 0, 0, 'dual', ARRAY['Vetiver'], NULL, 4.0),

    -- Exterior
    (ukc_id, 'Exterior', 'Novice', 'Exterior Novice A', 'A', 21,
     NULL, 60, 150, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Birch'], NULL, 2.0),
    (ukc_id, 'Exterior', 'Novice', 'Exterior Novice B', 'B', 22,
     NULL, 60, 150, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Birch'], NULL, 2.0),
    (ukc_id, 'Exterior', 'Advanced', 'Exterior Advanced A', 'A', 23,
     NULL, 60, 180, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Anise'], NULL, 2.5),
    (ukc_id, 'Exterior', 'Advanced', 'Exterior Advanced B', 'B', 24,
     NULL, 60, 180, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Anise'], NULL, 2.5),
    (ukc_id, 'Exterior', 'Superior', 'Exterior Superior A', 'A', 25,
     NULL, 120, 180, NULL, 2, 3, false, 1, false, 0, 0, 'dual', ARRAY['Clove'], NULL, 3.0),
    (ukc_id, 'Exterior', 'Superior', 'Exterior Superior B', 'B', 26,
     NULL, 120, 180, NULL, 2, 3, false, 1, false, 0, 0, 'dual', ARRAY['Clove'], NULL, 3.0),
    (ukc_id, 'Exterior', 'Master', 'Exterior Master A', 'A', 27,
     NULL, 120, 240, NULL, 3, 4, false, 1, false, 0, 0, 'dual', ARRAY['Myrrh'], NULL, 3.5),
    (ukc_id, 'Exterior', 'Master', 'Exterior Master B', 'B', 28,
     NULL, 120, 240, NULL, 3, 4, false, 1, false, 0, 0, 'dual', ARRAY['Myrrh'], NULL, 3.5),
    (ukc_id, 'Exterior', 'Elite', 'Exterior Elite A', 'A', 29,
     NULL, 150, 270, NULL, 4, 5, false, 1, false, 0, 0, 'dual', ARRAY['Vetiver'], NULL, 4.5),
    (ukc_id, 'Exterior', 'Elite', 'Exterior Elite B', 'B', 30,
     NULL, 150, 270, NULL, 4, 5, false, 1, false, 0, 0, 'dual', ARRAY['Vetiver'], NULL, 4.5),

    -- Vehicle
    (ukc_id, 'Vehicle', 'Novice', 'Vehicle Novice A', 'A', 31,
     NULL, 60, 150, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Birch'], NULL, 2.0),
    (ukc_id, 'Vehicle', 'Novice', 'Vehicle Novice B', 'B', 32,
     NULL, 60, 150, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Birch'], NULL, 2.0),
    (ukc_id, 'Vehicle', 'Advanced', 'Vehicle Advanced A', 'A', 33,
     NULL, 60, 180, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Anise'], NULL, 2.5),
    (ukc_id, 'Vehicle', 'Advanced', 'Vehicle Advanced B', 'B', 34,
     NULL, 60, 180, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Anise'], NULL, 2.5),
    (ukc_id, 'Vehicle', 'Superior', 'Vehicle Superior A', 'A', 35,
     NULL, 120, 180, NULL, 2, 3, false, 1, false, 0, 0, 'dual', ARRAY['Clove'], NULL, 3.0),
    (ukc_id, 'Vehicle', 'Superior', 'Vehicle Superior B', 'B', 36,
     NULL, 120, 180, NULL, 2, 3, false, 1, false, 0, 0, 'dual', ARRAY['Clove'], NULL, 3.0),
    (ukc_id, 'Vehicle', 'Master', 'Vehicle Master A', 'A', 37,
     NULL, 120, 240, NULL, 3, 4, false, 1, false, 0, 0, 'dual', ARRAY['Myrrh'], NULL, 3.5),
    (ukc_id, 'Vehicle', 'Master', 'Vehicle Master B', 'B', 38,
     NULL, 120, 240, NULL, 3, 4, false, 1, false, 0, 0, 'dual', ARRAY['Myrrh'], NULL, 3.5),
    (ukc_id, 'Vehicle', 'Elite', 'Vehicle Elite A', 'A', 39,
     NULL, 150, 270, NULL, 4, 5, false, 1, false, 0, 0, 'dual', ARRAY['Vetiver'], NULL, 4.5),
    (ukc_id, 'Vehicle', 'Elite', 'Vehicle Elite B', 'B', 40,
     NULL, 150, 270, NULL, 4, 5, false, 1, false, 0, 0, 'dual', ARRAY['Vetiver'], NULL, 4.5),

    -- Handler Discrimination
    (ukc_id, 'Handler Discrimination', 'Novice', 'Handler Discrimination Novice A', 'A', 41,
     NULL, 60, 150, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Birch'], NULL, 2.0),
    (ukc_id, 'Handler Discrimination', 'Novice', 'Handler Discrimination Novice B', 'B', 42,
     NULL, 60, 150, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Birch'], NULL, 2.0),
    (ukc_id, 'Handler Discrimination', 'Advanced', 'Handler Discrimination Advanced A', 'A', 43,
     NULL, 60, 180, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Anise'], NULL, 2.5),
    (ukc_id, 'Handler Discrimination', 'Advanced', 'Handler Discrimination Advanced B', 'B', 44,
     NULL, 60, 180, 1, NULL, NULL, true, 1, false, 0, 0, 'single', ARRAY['Anise'], NULL, 2.5),
    (ukc_id, 'Handler Discrimination', 'Superior', 'Handler Discrimination Superior A', 'A', 45,
     NULL, 120, 180, NULL, 2, 3, false, 1, false, 0, 0, 'dual', ARRAY['Clove'], NULL, 3.0),
    (ukc_id, 'Handler Discrimination', 'Superior', 'Handler Discrimination Superior B', 'B', 46,
     NULL, 120, 180, NULL, 2, 3, false, 1, false, 0, 0, 'dual', ARRAY['Clove'], NULL, 3.0),
    (ukc_id, 'Handler Discrimination', 'Master', 'Handler Discrimination Master A', 'A', 47,
     NULL, 120, 240, NULL, 3, 4, false, 1, false, 0, 0, 'dual', ARRAY['Myrrh'], NULL, 3.5),
    (ukc_id, 'Handler Discrimination', 'Master', 'Handler Discrimination Master B', 'B', 48,
     NULL, 120, 240, NULL, 3, 4, false, 1, false, 0, 0, 'dual', ARRAY['Myrrh'], NULL, 3.5),
    (ukc_id, 'Handler Discrimination', 'Elite', 'Handler Discrimination Elite A', 'A', 49,
     NULL, 150, 270, NULL, 4, 5, false, 1, false, 0, 0, 'dual', ARRAY['Vetiver'], NULL, 4.0),
    (ukc_id, 'Handler Discrimination', 'Elite', 'Handler Discrimination Elite B', 'B', 50,
     NULL, 150, 270, NULL, 4, 5, false, 1, false, 0, 0, 'dual', ARRAY['Vetiver'], NULL, 4.0);
END $$;

-- ---------------------------------------------------------------------------
-- 4. Seed ASCA Scent Detection class rules (16 rows)
-- ---------------------------------------------------------------------------
-- Source: ASCAScentDetectionScoresheet.tsx — getAreaCount()
-- No sections. Areas: Novice=1, Open=2, Advanced=2, Excellent=3

DO $$
DECLARE
  asca_id UUID;
BEGIN
  SELECT id INTO asca_id FROM sport_templates WHERE sport_code = 'asca-scent-detection';

  INSERT INTO sport_class_rules (
    sport_template_id, element, level, class_name, section, display_order,
    max_time_seconds_fixed, max_time_seconds_min, max_time_seconds_max,
    hide_count_fixed, hide_count_min, hide_count_max, hides_known,
    area_count, has_blank, distraction_count_min, distraction_count_max,
    timer_mode, odors, default_entry_fee, mrv_minutes
  ) VALUES
    -- Container
    (asca_id, 'Container', 'Novice', 'Container Novice', NULL, 1,
     150, NULL, NULL, 1, NULL, NULL, true, 1, false, 0, 0, 'single', '{}'::text[], NULL, 2.5),
    (asca_id, 'Container', 'Open', 'Container Open', NULL, 2,
     NULL, 180, 180, NULL, 1, 2, true, 2, false, 0, 0, 'single', '{}'::text[], NULL, 3.0),
    (asca_id, 'Container', 'Advanced', 'Container Advanced', NULL, 3,
     NULL, 180, 300, NULL, 2, 3, false, 2, false, 0, 0, 'single', '{}'::text[], NULL, 4.0),
    (asca_id, 'Container', 'Excellent', 'Container Excellent', NULL, 4,
     NULL, 240, 360, NULL, 3, 5, false, 3, false, 0, 0, 'single', '{}'::text[], NULL, 5.0),

    -- Interior
    (asca_id, 'Interior', 'Novice', 'Interior Novice', NULL, 5,
     150, NULL, NULL, 1, NULL, NULL, true, 1, false, 0, 0, 'single', '{}'::text[], NULL, 2.5),
    (asca_id, 'Interior', 'Open', 'Interior Open', NULL, 6,
     NULL, 180, 180, NULL, 1, 2, true, 2, false, 0, 0, 'single', '{}'::text[], NULL, 3.0),
    (asca_id, 'Interior', 'Advanced', 'Interior Advanced', NULL, 7,
     NULL, 180, 300, NULL, 2, 3, false, 2, false, 0, 0, 'single', '{}'::text[], NULL, 4.5),
    (asca_id, 'Interior', 'Excellent', 'Interior Excellent', NULL, 8,
     NULL, 240, 360, NULL, 3, 5, false, 3, false, 0, 0, 'single', '{}'::text[], NULL, 6.0),

    -- Exterior
    (asca_id, 'Exterior', 'Novice', 'Exterior Novice', NULL, 9,
     150, NULL, NULL, 1, NULL, NULL, true, 1, false, 0, 0, 'single', '{}'::text[], NULL, 2.5),
    (asca_id, 'Exterior', 'Open', 'Exterior Open', NULL, 10,
     NULL, 180, 180, NULL, 1, 2, true, 2, false, 0, 0, 'single', '{}'::text[], NULL, 3.0),
    (asca_id, 'Exterior', 'Advanced', 'Exterior Advanced', NULL, 11,
     NULL, 180, 300, NULL, 2, 3, false, 2, false, 0, 0, 'single', '{}'::text[], NULL, 4.5),
    (asca_id, 'Exterior', 'Excellent', 'Exterior Excellent', NULL, 12,
     NULL, 240, 360, NULL, 3, 5, false, 3, false, 0, 0, 'single', '{}'::text[], NULL, 6.0),

    -- Vehicle
    (asca_id, 'Vehicle', 'Novice', 'Vehicle Novice', NULL, 13,
     150, NULL, NULL, 1, NULL, NULL, true, 1, false, 0, 0, 'single', '{}'::text[], NULL, 2.5),
    (asca_id, 'Vehicle', 'Open', 'Vehicle Open', NULL, 14,
     NULL, 180, 180, NULL, 1, 2, true, 2, false, 0, 0, 'single', '{}'::text[], NULL, 3.0),
    (asca_id, 'Vehicle', 'Advanced', 'Vehicle Advanced', NULL, 15,
     NULL, 180, 300, NULL, 2, 3, false, 2, false, 0, 0, 'single', '{}'::text[], NULL, 4.5),
    (asca_id, 'Vehicle', 'Excellent', 'Vehicle Excellent', NULL, 16,
     NULL, 240, 360, NULL, 3, 5, false, 3, false, 0, 0, 'single', '{}'::text[], NULL, 5.5);
END $$;
