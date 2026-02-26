-- =============================================================================
-- Migration 031: Seed Sport Title Definitions
-- =============================================================================
-- Seeds title definitions for AKC Scent Work (49), UKC Nosework (45), and
-- ASCA Scent Detection (40). Title tracking engine is Phase 2; this migration
-- defines the titles, required legs, and relationship data.
--
-- Sources:
--   AKC: Scent Work Regulations, Chapter 10 (Titles)
--   UKC: Nosework Rules, Chapters 5-6 + 11 (Titles & HD)
--   ASCA: Scent Detection Rules, Section 3 (Scores and Titles)
-- =============================================================================

-- =============================================
-- AKC SCENT WORK TITLES (49 titles)
-- =============================================
DO $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM sport_templates WHERE sport_code = 'akc-scent-work';

  INSERT INTO sport_titles (sport_template_id, abbreviation, full_name, title_type, required_legs, required_elements, sort_order) VALUES
  -- -------------------------------------------------
  -- Basic element titles: 3 qualifying scores each
  -- -------------------------------------------------
  -- Container
  (v_id, 'SCN',  'Scent Work Container Novice',    'element', 3, ARRAY['Container'], 100),
  (v_id, 'SCA',  'Scent Work Container Advanced',   'element', 3, ARRAY['Container'], 101),
  (v_id, 'SCE',  'Scent Work Container Excellent',  'element', 3, ARRAY['Container'], 102),
  (v_id, 'SCM',  'Scent Work Container Master',     'element', 3, ARRAY['Container'], 103),
  -- Interior
  (v_id, 'SIN',  'Scent Work Interior Novice',     'element', 3, ARRAY['Interior'], 110),
  (v_id, 'SIA',  'Scent Work Interior Advanced',    'element', 3, ARRAY['Interior'], 111),
  (v_id, 'SIE',  'Scent Work Interior Excellent',   'element', 3, ARRAY['Interior'], 112),
  (v_id, 'SIM',  'Scent Work Interior Master',      'element', 3, ARRAY['Interior'], 113),
  -- Exterior
  (v_id, 'SEN',  'Scent Work Exterior Novice',     'element', 3, ARRAY['Exterior'], 120),
  (v_id, 'SEA',  'Scent Work Exterior Advanced',    'element', 3, ARRAY['Exterior'], 121),
  (v_id, 'SEE',  'Scent Work Exterior Excellent',   'element', 3, ARRAY['Exterior'], 122),
  (v_id, 'SEM',  'Scent Work Exterior Master',      'element', 3, ARRAY['Exterior'], 123),
  -- Buried
  (v_id, 'SBN',  'Scent Work Buried Novice',       'element', 3, ARRAY['Buried'], 130),
  (v_id, 'SBA',  'Scent Work Buried Advanced',      'element', 3, ARRAY['Buried'], 131),
  (v_id, 'SBE',  'Scent Work Buried Excellent',     'element', 3, ARRAY['Buried'], 132),
  (v_id, 'SBM',  'Scent Work Buried Master',        'element', 3, ARRAY['Buried'], 133),

  -- -------------------------------------------------
  -- Handler Discrimination basic: 3 Qs each
  -- -------------------------------------------------
  (v_id, 'SHDN', 'Scent Work Handler Discrimination Novice',    'element', 3, ARRAY['Handler Discrimination'], 200),
  (v_id, 'SHDA', 'Scent Work Handler Discrimination Advanced',   'element', 3, ARRAY['Handler Discrimination'], 201),
  (v_id, 'SHDE', 'Scent Work Handler Discrimination Excellent',  'element', 3, ARRAY['Handler Discrimination'], 202),
  (v_id, 'SHDM', 'Scent Work Handler Discrimination Master',     'element', 3, ARRAY['Handler Discrimination'], 203),

  -- -------------------------------------------------
  -- Level titles: all Odor Search elements at a level
  -- Supersede basic element titles of that level
  -- -------------------------------------------------
  (v_id, 'SWN',  'Scent Work Novice',    'level', 0, ARRAY['Container','Interior','Exterior','Buried'], 300),
  (v_id, 'SWA',  'Scent Work Advanced',   'level', 0, ARRAY['Container','Interior','Exterior','Buried'], 301),
  (v_id, 'SWE',  'Scent Work Excellent',  'level', 0, ARRAY['Container','Interior','Exterior','Buried'], 302),
  (v_id, 'SWM',  'Scent Work Master',     'level', 0, ARRAY['Container','Interior','Exterior','Buried'], 303),

  -- -------------------------------------------------
  -- Elite element titles: 10 qualifying scores each
  -- -------------------------------------------------
  -- Container
  (v_id, 'SCNE', 'Scent Work Container Novice Elite',    'elite', 10, ARRAY['Container'], 400),
  (v_id, 'SCAE', 'Scent Work Container Advanced Elite',   'elite', 10, ARRAY['Container'], 401),
  (v_id, 'SCEE', 'Scent Work Container Excellent Elite',  'elite', 10, ARRAY['Container'], 402),
  (v_id, 'SCME', 'Scent Work Container Master Elite',     'elite', 10, ARRAY['Container'], 403),
  -- Interior
  (v_id, 'SINE', 'Scent Work Interior Novice Elite',     'elite', 10, ARRAY['Interior'], 410),
  (v_id, 'SIAE', 'Scent Work Interior Advanced Elite',    'elite', 10, ARRAY['Interior'], 411),
  (v_id, 'SIEE', 'Scent Work Interior Excellent Elite',   'elite', 10, ARRAY['Interior'], 412),
  (v_id, 'SIME', 'Scent Work Interior Master Elite',      'elite', 10, ARRAY['Interior'], 413),
  -- Exterior
  (v_id, 'SENE', 'Scent Work Exterior Novice Elite',     'elite', 10, ARRAY['Exterior'], 420),
  (v_id, 'SEAE', 'Scent Work Exterior Advanced Elite',    'elite', 10, ARRAY['Exterior'], 421),
  (v_id, 'SEEE', 'Scent Work Exterior Excellent Elite',   'elite', 10, ARRAY['Exterior'], 422),
  (v_id, 'SEME', 'Scent Work Exterior Master Elite',      'elite', 10, ARRAY['Exterior'], 423),
  -- Buried
  (v_id, 'SBNE', 'Scent Work Buried Novice Elite',       'elite', 10, ARRAY['Buried'], 430),
  (v_id, 'SBAE', 'Scent Work Buried Advanced Elite',      'elite', 10, ARRAY['Buried'], 431),
  (v_id, 'SBEE', 'Scent Work Buried Excellent Elite',     'elite', 10, ARRAY['Buried'], 432),
  (v_id, 'SBME', 'Scent Work Buried Master Elite',        'elite', 10, ARRAY['Buried'], 433),

  -- -------------------------------------------------
  -- Handler Discrimination elite: 10 Qs each
  -- -------------------------------------------------
  (v_id, 'SHDNE', 'Scent Work Handler Discrimination Novice Elite',    'elite', 10, ARRAY['Handler Discrimination'], 500),
  (v_id, 'SHDAE', 'Scent Work Handler Discrimination Advanced Elite',   'elite', 10, ARRAY['Handler Discrimination'], 501),
  (v_id, 'SHDEE', 'Scent Work Handler Discrimination Excellent Elite',  'elite', 10, ARRAY['Handler Discrimination'], 502),
  (v_id, 'SHDME', 'Scent Work Handler Discrimination Master Elite',     'elite', 10, ARRAY['Handler Discrimination'], 503),

  -- -------------------------------------------------
  -- Elite level titles: all elite elements at a level
  -- Supersede elite element titles of that level
  -- -------------------------------------------------
  (v_id, 'SWNE', 'Scent Work Novice Elite',    'champion', 0, ARRAY['Container','Interior','Exterior','Buried'], 600),
  (v_id, 'SWAE', 'Scent Work Advanced Elite',   'champion', 0, ARRAY['Container','Interior','Exterior','Buried'], 601),
  (v_id, 'SWEE', 'Scent Work Excellent Elite',  'champion', 0, ARRAY['Container','Interior','Exterior','Buried'], 602),
  (v_id, 'SWME', 'Scent Work Master Elite',     'champion', 0, ARRAY['Container','Interior','Exterior','Buried'], 603),

  -- -------------------------------------------------
  -- Detective: 10 qualifying scores
  -- -------------------------------------------------
  (v_id, 'SWD',  'Scent Work Detective', 'elite', 10, ARRAY['Detective'], 700);
END;
$$;

-- =============================================
-- UKC NOSEWORK TITLES (45 titles)
-- =============================================
DO $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM sport_templates WHERE sport_code = 'ukc-nosework';

  INSERT INTO sport_titles (sport_template_id, abbreviation, full_name, title_type, required_legs, required_elements, sort_order) VALUES
  -- -------------------------------------------------
  -- Element titles: 2 qualifying passes each
  -- -------------------------------------------------
  -- Container
  (v_id, 'NC',  'Novice Container',    'element', 2, ARRAY['Container'], 100),
  (v_id, 'AC',  'Advanced Container',   'element', 2, ARRAY['Container'], 101),
  (v_id, 'SC',  'Superior Container',   'element', 2, ARRAY['Container'], 102),
  (v_id, 'MC',  'Master Container',     'element', 2, ARRAY['Container'], 103),
  (v_id, 'EC',  'Elite Container',      'element', 2, ARRAY['Container'], 104),
  -- Interior
  (v_id, 'NI',  'Novice Interior',     'element', 2, ARRAY['Interior'], 110),
  (v_id, 'AI',  'Advanced Interior',    'element', 2, ARRAY['Interior'], 111),
  (v_id, 'SI',  'Superior Interior',    'element', 2, ARRAY['Interior'], 112),
  (v_id, 'MI',  'Master Interior',      'element', 2, ARRAY['Interior'], 113),
  (v_id, 'EI',  'Elite Interior',       'element', 2, ARRAY['Interior'], 114),
  -- Exterior
  (v_id, 'NE',  'Novice Exterior',     'element', 2, ARRAY['Exterior'], 120),
  (v_id, 'AE',  'Advanced Exterior',    'element', 2, ARRAY['Exterior'], 121),
  (v_id, 'SE',  'Superior Exterior',    'element', 2, ARRAY['Exterior'], 122),
  (v_id, 'ME',  'Master Exterior',      'element', 2, ARRAY['Exterior'], 123),
  (v_id, 'EE',  'Elite Exterior',       'element', 2, ARRAY['Exterior'], 124),
  -- Vehicle
  (v_id, 'NV',  'Novice Vehicle',      'element', 2, ARRAY['Vehicle'], 130),
  (v_id, 'AV',  'Advanced Vehicle',     'element', 2, ARRAY['Vehicle'], 131),
  (v_id, 'SV',  'Superior Vehicle',     'element', 2, ARRAY['Vehicle'], 132),
  (v_id, 'MV',  'Master Vehicle',       'element', 2, ARRAY['Vehicle'], 133),
  (v_id, 'EV',  'Elite Vehicle',        'element', 2, ARRAY['Vehicle'], 134),

  -- -------------------------------------------------
  -- Nosework level titles: all 4 elements at a level
  -- -------------------------------------------------
  (v_id, 'NN',  'Novice Nosework',     'level', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 200),
  (v_id, 'AN',  'Advanced Nosework',    'level', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 201),
  (v_id, 'SN',  'Superior Nosework',    'level', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 202),
  (v_id, 'MN',  'Master Nosework',      'level', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 203),
  (v_id, 'EN',  'Elite Nosework',       'level', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 204),

  -- -------------------------------------------------
  -- Champion titles: 3 legs/element × 4 = 12 (B section)
  -- -------------------------------------------------
  (v_id, 'NNCH', 'Novice Champion',     'champion', 12, ARRAY['Container','Interior','Exterior','Vehicle'], 300),
  (v_id, 'ACH',  'Advanced Champion',    'champion', 12, ARRAY['Container','Interior','Exterior','Vehicle'], 301),
  (v_id, 'SCH',  'Superior Champion',    'champion', 12, ARRAY['Container','Interior','Exterior','Vehicle'], 302),
  (v_id, 'MCH',  'Master Champion',      'champion', 12, ARRAY['Container','Interior','Exterior','Vehicle'], 303),
  (v_id, 'ECH',  'Elite Champion',       'champion', 12, ARRAY['Container','Interior','Exterior','Vehicle'], 304),

  -- -------------------------------------------------
  -- Grand Champion titles: 5 legs/element × 4 = 20 (B section)
  -- -------------------------------------------------
  (v_id, 'NGC',  'Novice Grand Champion',    'grand_champion', 20, ARRAY['Container','Interior','Exterior','Vehicle'], 400),
  (v_id, 'AGC',  'Advanced Grand Champion',   'grand_champion', 20, ARRAY['Container','Interior','Exterior','Vehicle'], 401),
  (v_id, 'SNGC', 'Superior Grand Champion',   'grand_champion', 20, ARRAY['Container','Interior','Exterior','Vehicle'], 402),
  (v_id, 'MGC',  'Master Grand Champion',     'grand_champion', 20, ARRAY['Container','Interior','Exterior','Vehicle'], 403),
  (v_id, 'EGC',  'Elite Grand Champion',      'grand_champion', 20, ARRAY['Container','Interior','Exterior','Vehicle'], 404),

  -- -------------------------------------------------
  -- Overall titles (earned by completing all 5 class titles)
  -- -------------------------------------------------
  (v_id, 'NWCH', 'Nosework Champion',        'champion', 0, '{}', 500),
  (v_id, 'NWGC', 'Nosework Grand Champion',   'grand_champion', 0, '{}', 501),

  -- -------------------------------------------------
  -- Handler Discrimination: 3 legs each (different trials)
  -- -------------------------------------------------
  (v_id, 'NHD',  'Novice Handler Discrimination',     'element', 3, ARRAY['Handler Discrimination'], 600),
  (v_id, 'AHD',  'Advanced Handler Discrimination',    'element', 3, ARRAY['Handler Discrimination'], 601),
  (v_id, 'EHD',  'Excellent Handler Discrimination',   'element', 3, ARRAY['Handler Discrimination'], 602),
  (v_id, 'MHD',  'Master Handler Discrimination',      'element', 3, ARRAY['Handler Discrimination'], 603),

  -- HD continuation: 10 Qs from B section (numeric designations)
  (v_id, 'EHDS', 'Excellent Handler Discrimination Supreme',   'continuation', 10, ARRAY['Handler Discrimination'], 700),
  (v_id, 'MHDX', 'Master Handler Discrimination Excellent',    'continuation', 10, ARRAY['Handler Discrimination'], 701),

  -- HD Champion: 10 Qs each in EHD-B and MHD-B at same trials = 20 total
  (v_id, 'HDCH', 'Handler Discrimination Champion',        'champion', 20, ARRAY['Handler Discrimination'], 800),
  -- HD Grand Champion: 15 Qs each in EHD-B and MHD-B = 30 total
  (v_id, 'HDGC', 'Handler Discrimination Grand Champion',   'grand_champion', 30, ARRAY['Handler Discrimination'], 801);
END;
$$;

-- =============================================
-- ASCA SCENT DETECTION TITLES (40 titles)
-- =============================================
DO $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM sport_templates WHERE sport_code = 'asca-scent-detection';

  INSERT INTO sport_titles (sport_template_id, abbreviation, full_name, title_type, required_legs, required_elements, sort_order) VALUES
  -- -------------------------------------------------
  -- Element titles: 3 qualifying scores each
  -- -------------------------------------------------
  -- Novice
  (v_id, 'SCNc',  'Scent Detection Novice Containers',   'element', 3, ARRAY['Container'], 100),
  (v_id, 'SCNi',  'Scent Detection Novice Interiors',    'element', 3, ARRAY['Interior'], 101),
  (v_id, 'SCNe',  'Scent Detection Novice Exteriors',    'element', 3, ARRAY['Exterior'], 102),
  (v_id, 'SCNv',  'Scent Detection Novice Vehicles',     'element', 3, ARRAY['Vehicle'], 103),
  -- Open
  (v_id, 'SCOc',  'Scent Detection Open Containers',     'element', 3, ARRAY['Container'], 110),
  (v_id, 'SCOi',  'Scent Detection Open Interiors',      'element', 3, ARRAY['Interior'], 111),
  (v_id, 'SCOe',  'Scent Detection Open Exteriors',      'element', 3, ARRAY['Exterior'], 112),
  (v_id, 'SCOv',  'Scent Detection Open Vehicles',       'element', 3, ARRAY['Vehicle'], 113),
  -- Advanced
  (v_id, 'SCAc',  'Scent Detection Advanced Containers', 'element', 3, ARRAY['Container'], 120),
  (v_id, 'SCAi',  'Scent Detection Advanced Interiors',  'element', 3, ARRAY['Interior'], 121),
  (v_id, 'SCAe',  'Scent Detection Advanced Exteriors',  'element', 3, ARRAY['Exterior'], 122),
  (v_id, 'SCAv',  'Scent Detection Advanced Vehicles',   'element', 3, ARRAY['Vehicle'], 123),
  -- Excellent
  (v_id, 'SCEc',  'Scent Detection Excellent Containers', 'element', 3, ARRAY['Container'], 130),
  (v_id, 'SCEi',  'Scent Detection Excellent Interiors',  'element', 3, ARRAY['Interior'], 131),
  (v_id, 'SCEe',  'Scent Detection Excellent Exteriors',  'element', 3, ARRAY['Exterior'], 132),
  (v_id, 'SCEv',  'Scent Detection Excellent Vehicles',   'element', 3, ARRAY['Vehicle'], 133),

  -- -------------------------------------------------
  -- Level 4 titles: all 4 elements at a level
  -- Supersede element titles (separate titles dropped)
  -- -------------------------------------------------
  (v_id, 'SCN4',  'Scent Detection Novice Four',    'level', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 200),
  (v_id, 'SCO4',  'Scent Detection Open Four',      'level', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 201),
  (v_id, 'SCA4',  'Scent Detection Advanced Four',  'level', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 202),
  (v_id, 'SCE4',  'Scent Detection Excellent Four',  'level', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 203),

  -- -------------------------------------------------
  -- Level C element titles: 10 total Qs (7 additional)
  -- -------------------------------------------------
  -- Novice Level C
  (v_id, 'SCNc-C', 'Scent Detection Novice Containers Level C',  'elite', 10, ARRAY['Container'], 300),
  (v_id, 'SCNi-C', 'Scent Detection Novice Interiors Level C',   'elite', 10, ARRAY['Interior'], 301),
  (v_id, 'SCNe-C', 'Scent Detection Novice Exteriors Level C',   'elite', 10, ARRAY['Exterior'], 302),
  (v_id, 'SCNv-C', 'Scent Detection Novice Vehicles Level C',    'elite', 10, ARRAY['Vehicle'], 303),
  -- Open Level C
  (v_id, 'SCOc-C', 'Scent Detection Open Containers Level C',    'elite', 10, ARRAY['Container'], 310),
  (v_id, 'SCOi-C', 'Scent Detection Open Interiors Level C',     'elite', 10, ARRAY['Interior'], 311),
  (v_id, 'SCOe-C', 'Scent Detection Open Exteriors Level C',     'elite', 10, ARRAY['Exterior'], 312),
  (v_id, 'SCOv-C', 'Scent Detection Open Vehicles Level C',      'elite', 10, ARRAY['Vehicle'], 313),
  -- Advanced Level C
  (v_id, 'SCAc-C', 'Scent Detection Advanced Containers Level C', 'elite', 10, ARRAY['Container'], 320),
  (v_id, 'SCAi-C', 'Scent Detection Advanced Interiors Level C',  'elite', 10, ARRAY['Interior'], 321),
  (v_id, 'SCAe-C', 'Scent Detection Advanced Exteriors Level C',  'elite', 10, ARRAY['Exterior'], 322),
  (v_id, 'SCAv-C', 'Scent Detection Advanced Vehicles Level C',   'elite', 10, ARRAY['Vehicle'], 323),
  -- Excellent Level C
  (v_id, 'SCEc-C', 'Scent Detection Excellent Containers Level C', 'elite', 10, ARRAY['Container'], 330),
  (v_id, 'SCEi-C', 'Scent Detection Excellent Interiors Level C',  'elite', 10, ARRAY['Interior'], 331),
  (v_id, 'SCEe-C', 'Scent Detection Excellent Exteriors Level C',  'elite', 10, ARRAY['Exterior'], 332),
  (v_id, 'SCEv-C', 'Scent Detection Excellent Vehicles Level C',   'elite', 10, ARRAY['Vehicle'], 333),

  -- -------------------------------------------------
  -- Level C 4 titles: all 4 Level C elements at a level
  -- Supersede Level C element titles (separate dropped)
  -- -------------------------------------------------
  (v_id, 'SCN4-C', 'Scent Detection Novice Four Level C',    'champion', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 400),
  (v_id, 'SCO4-C', 'Scent Detection Open Four Level C',      'champion', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 401),
  (v_id, 'SCA4-C', 'Scent Detection Advanced Four Level C',  'champion', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 402),
  (v_id, 'SCE4-C', 'Scent Detection Excellent Four Level C',  'champion', 0, ARRAY['Container','Interior','Exterior','Vehicle'], 403);
END;
$$;

-- =============================================================================
-- RELATIONSHIP UPDATES: supersedes_title_ids and prerequisite_title_id
-- =============================================================================

-- Helper function to look up a title ID by sport_code + abbreviation
CREATE OR REPLACE FUNCTION _title_id(p_sport_code TEXT, p_abbr TEXT)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT t.id FROM sport_titles t
  JOIN sport_templates s ON s.id = t.sport_template_id
  WHERE s.sport_code = p_sport_code AND t.abbreviation = p_abbr;
$$;

-- Helper function to look up multiple title IDs
CREATE OR REPLACE FUNCTION _title_ids(p_sport_code TEXT, p_abbrs TEXT[])
RETURNS UUID[] LANGUAGE sql STABLE AS $$
  SELECT ARRAY(
    SELECT t.id FROM sport_titles t
    JOIN sport_templates s ON s.id = t.sport_template_id
    WHERE s.sport_code = p_sport_code AND t.abbreviation = ANY(p_abbrs)
  );
$$;

-- -----------------------------------------------
-- AKC: Level titles supersede element titles
-- -----------------------------------------------
UPDATE sport_titles SET supersedes_title_ids = _title_ids('akc-scent-work', ARRAY['SCN','SIN','SEN','SBN'])
WHERE id = _title_id('akc-scent-work', 'SWN');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('akc-scent-work', ARRAY['SCA','SIA','SEA','SBA'])
WHERE id = _title_id('akc-scent-work', 'SWA');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('akc-scent-work', ARRAY['SCE','SIE','SEE','SBE'])
WHERE id = _title_id('akc-scent-work', 'SWE');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('akc-scent-work', ARRAY['SCM','SIM','SEM','SBM'])
WHERE id = _title_id('akc-scent-work', 'SWM');

-- AKC: Elite level titles supersede elite element titles
UPDATE sport_titles SET supersedes_title_ids = _title_ids('akc-scent-work', ARRAY['SCNE','SINE','SENE','SBNE'])
WHERE id = _title_id('akc-scent-work', 'SWNE');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('akc-scent-work', ARRAY['SCAE','SIAE','SEAE','SBAE'])
WHERE id = _title_id('akc-scent-work', 'SWAE');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('akc-scent-work', ARRAY['SCEE','SIEE','SEEE','SBEE'])
WHERE id = _title_id('akc-scent-work', 'SWEE');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('akc-scent-work', ARRAY['SCME','SIME','SEME','SBME'])
WHERE id = _title_id('akc-scent-work', 'SWME');

-- -----------------------------------------------
-- UKC: Level title prerequisites (sequential)
-- -----------------------------------------------
UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'NN')
WHERE id = _title_id('ukc-nosework', 'AN');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'AN')
WHERE id = _title_id('ukc-nosework', 'SN');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'SN')
WHERE id = _title_id('ukc-nosework', 'MN');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'MN')
WHERE id = _title_id('ukc-nosework', 'EN');

-- UKC: Champion requires nosework level title
UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'NN')
WHERE id = _title_id('ukc-nosework', 'NNCH');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'AN')
WHERE id = _title_id('ukc-nosework', 'ACH');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'SN')
WHERE id = _title_id('ukc-nosework', 'SCH');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'MN')
WHERE id = _title_id('ukc-nosework', 'MCH');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'EN')
WHERE id = _title_id('ukc-nosework', 'ECH');

-- UKC: Grand Champion requires Champion
UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'NNCH')
WHERE id = _title_id('ukc-nosework', 'NGC');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'ACH')
WHERE id = _title_id('ukc-nosework', 'AGC');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'SCH')
WHERE id = _title_id('ukc-nosework', 'SNGC');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'MCH')
WHERE id = _title_id('ukc-nosework', 'MGC');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'ECH')
WHERE id = _title_id('ukc-nosework', 'EGC');

-- UKC: HD sequential prerequisites
UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'NHD')
WHERE id = _title_id('ukc-nosework', 'AHD');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'AHD')
WHERE id = _title_id('ukc-nosework', 'EHD');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'EHD')
WHERE id = _title_id('ukc-nosework', 'MHD');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'EHD')
WHERE id = _title_id('ukc-nosework', 'EHDS');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'MHD')
WHERE id = _title_id('ukc-nosework', 'MHDX');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'MHD')
WHERE id = _title_id('ukc-nosework', 'HDCH');

UPDATE sport_titles SET prerequisite_title_id = _title_id('ukc-nosework', 'HDCH')
WHERE id = _title_id('ukc-nosework', 'HDGC');

-- -----------------------------------------------
-- ASCA: Level 4 supersede element titles
-- -----------------------------------------------
UPDATE sport_titles SET supersedes_title_ids = _title_ids('asca-scent-detection', ARRAY['SCNc','SCNi','SCNe','SCNv'])
WHERE id = _title_id('asca-scent-detection', 'SCN4');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('asca-scent-detection', ARRAY['SCOc','SCOi','SCOe','SCOv'])
WHERE id = _title_id('asca-scent-detection', 'SCO4');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('asca-scent-detection', ARRAY['SCAc','SCAi','SCAe','SCAv'])
WHERE id = _title_id('asca-scent-detection', 'SCA4');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('asca-scent-detection', ARRAY['SCEc','SCEi','SCEe','SCEv'])
WHERE id = _title_id('asca-scent-detection', 'SCE4');

-- ASCA: Level C 4 supersede Level C element titles
UPDATE sport_titles SET supersedes_title_ids = _title_ids('asca-scent-detection', ARRAY['SCNc-C','SCNi-C','SCNe-C','SCNv-C'])
WHERE id = _title_id('asca-scent-detection', 'SCN4-C');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('asca-scent-detection', ARRAY['SCOc-C','SCOi-C','SCOe-C','SCOv-C'])
WHERE id = _title_id('asca-scent-detection', 'SCO4-C');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('asca-scent-detection', ARRAY['SCAc-C','SCAi-C','SCAe-C','SCAv-C'])
WHERE id = _title_id('asca-scent-detection', 'SCA4-C');

UPDATE sport_titles SET supersedes_title_ids = _title_ids('asca-scent-detection', ARRAY['SCEc-C','SCEi-C','SCEe-C','SCEv-C'])
WHERE id = _title_id('asca-scent-detection', 'SCE4-C');

-- ASCA: Level C element titles require base element title
DO $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM sport_templates WHERE sport_code = 'asca-scent-detection';

  -- Novice Level C prerequisites
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCNc')
  WHERE sport_template_id = v_id AND abbreviation = 'SCNc-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCNi')
  WHERE sport_template_id = v_id AND abbreviation = 'SCNi-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCNe')
  WHERE sport_template_id = v_id AND abbreviation = 'SCNe-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCNv')
  WHERE sport_template_id = v_id AND abbreviation = 'SCNv-C';

  -- Open Level C prerequisites
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCOc')
  WHERE sport_template_id = v_id AND abbreviation = 'SCOc-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCOi')
  WHERE sport_template_id = v_id AND abbreviation = 'SCOi-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCOe')
  WHERE sport_template_id = v_id AND abbreviation = 'SCOe-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCOv')
  WHERE sport_template_id = v_id AND abbreviation = 'SCOv-C';

  -- Advanced Level C prerequisites
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCAc')
  WHERE sport_template_id = v_id AND abbreviation = 'SCAc-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCAi')
  WHERE sport_template_id = v_id AND abbreviation = 'SCAi-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCAe')
  WHERE sport_template_id = v_id AND abbreviation = 'SCAe-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCAv')
  WHERE sport_template_id = v_id AND abbreviation = 'SCAv-C';

  -- Excellent Level C prerequisites
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCEc')
  WHERE sport_template_id = v_id AND abbreviation = 'SCEc-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCEi')
  WHERE sport_template_id = v_id AND abbreviation = 'SCEi-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCEe')
  WHERE sport_template_id = v_id AND abbreviation = 'SCEe-C';
  UPDATE sport_titles SET prerequisite_title_id = (SELECT id FROM sport_titles WHERE sport_template_id = v_id AND abbreviation = 'SCEv')
  WHERE sport_template_id = v_id AND abbreviation = 'SCEv-C';
END;
$$;

-- Clean up helper functions (not needed at runtime)
DROP FUNCTION IF EXISTS _title_id(TEXT, TEXT);
DROP FUNCTION IF EXISTS _title_ids(TEXT, TEXT[]);
