/**
 * The real AKC Scent Work title catalogue, as seeded by
 * `031_seed_sport_titles.sql` and chained by
 * `20260904214500_seed_akc_scent_work_title_prerequisites.sql`.
 *
 * Written out literally rather than derived from the engine or the migration:
 * this file is an independent statement of what the data is supposed to be, so
 * a test that reads it can contradict both.
 *
 * `akcScentWorkTitlePrerequisites.source.test.ts` pins AKC_TITLE_PREREQUISITES
 * against the migration itself, so the fixture cannot drift from what ships.
 */
import type { SportTitleRow } from '@/types/sport-template-types';

export const AKC_TEMPLATE_ID = 'tmpl-akc-scent-work';

/** What `sport_templates.levels` holds for akc-scent-work. */
export const AKC_FLAT_LEVELS = ['Novice', 'Advanced', 'Excellent', 'Master'];

/** Element → the four graded levels, with the abbreviation stem for each. */
const ELEMENTS: ReadonlyArray<{ element: string; stem: string; base: number }> = [
  { element: 'Container', stem: 'SC', base: 100 },
  { element: 'Interior', stem: 'SI', base: 110 },
  { element: 'Exterior', stem: 'SE', base: 120 },
  { element: 'Buried', stem: 'SB', base: 130 },
  { element: 'Handler Discrimination', stem: 'SHD', base: 200 },
];

const LEVELS: ReadonlyArray<{ level: string; suffix: string }> = [
  { level: 'Novice', suffix: 'N' },
  { level: 'Advanced', suffix: 'A' },
  { level: 'Excellent', suffix: 'E' },
  { level: 'Master', suffix: 'M' },
];

/** The four elements a level title is composed from (Handler Discrimination is not one). */
const LEVEL_ELEMENTS = ['Container', 'Interior', 'Exterior', 'Buried'];

/**
 * child abbreviation → its single prerequisite.
 *
 * Roots (no prerequisite): the five Novice element titles, SWN, and SWD.
 *
 * Detective has no edge on purpose. The registry rule is "any Master title"
 * (see `docs/design_handoff_heritage/Multi-Registry Scoping.md` §7.5.2) and one
 * parent column cannot express a disjunction, so seeding SWM would lock out a
 * dog the regulations let in.
 */
export const AKC_TITLE_PREREQUISITES: Readonly<Record<string, string>> = {
  // Element level progression — the AKC move-up rule.
  SCA: 'SCN',
  SCE: 'SCA',
  SCM: 'SCE',
  SIA: 'SIN',
  SIE: 'SIA',
  SIM: 'SIE',
  SEA: 'SEN',
  SEE: 'SEA',
  SEM: 'SEE',
  SBA: 'SBN',
  SBE: 'SBA',
  SBM: 'SBE',
  SHDA: 'SHDN',
  SHDE: 'SHDA',
  SHDM: 'SHDE',
  // An Elite element title accumulates on top of its base element title.
  SCNE: 'SCN',
  SCAE: 'SCA',
  SCEE: 'SCE',
  SCME: 'SCM',
  SINE: 'SIN',
  SIAE: 'SIA',
  SIEE: 'SIE',
  SIME: 'SIM',
  SENE: 'SEN',
  SEAE: 'SEA',
  SEEE: 'SEE',
  SEME: 'SEM',
  SBNE: 'SBN',
  SBAE: 'SBA',
  SBEE: 'SBE',
  SBME: 'SBM',
  SHDNE: 'SHDN',
  SHDAE: 'SHDA',
  SHDEE: 'SHDE',
  SHDME: 'SHDM',
  // Level titles are strictly sequential.
  SWA: 'SWN',
  SWE: 'SWA',
  SWM: 'SWE',
  // An Elite level title sits on the matching level title.
  SWNE: 'SWN',
  SWAE: 'SWA',
  SWEE: 'SWE',
  SWME: 'SWM',
};

export const AKC_TITLE_ROOTS = ['SCN', 'SIN', 'SEN', 'SBN', 'SHDN', 'SWN', 'SWD'] as const;

function titleId(abbreviation: string): string {
  return `akc-${abbreviation}`;
}

function makeRow(
  abbreviation: string,
  full_name: string,
  title_type: SportTitleRow['title_type'],
  required_legs: number,
  required_elements: string[],
  sort_order: number,
  withChain: boolean
): SportTitleRow {
  const parent = AKC_TITLE_PREREQUISITES[abbreviation];
  return {
    id: titleId(abbreviation),
    sport_template_id: AKC_TEMPLATE_ID,
    abbreviation,
    full_name,
    title_type,
    required_legs,
    required_elements,
    prerequisite_title_id: withChain && parent ? titleId(parent) : null,
    // Supersession is deliberately not modelled: the seed sets it on the level
    // titles, but nothing here earns a title that would supersede another, and
    // the source contract does not compare it. Add it before writing a test
    // that turns on `isSuperseded`.
    supersedes_title_ids: [],
    sort_order,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
}

/**
 * All 49 AKC Scent Work titles.
 *
 * @param withChain when false, every `prerequisite_title_id` is NULL — the state
 *   the database was actually in before the prerequisite migration. Tests use it
 *   as a positive control, so a passing assertion is known to distinguish the
 *   fixed data from the broken data rather than passing either way.
 */
export function buildAkcScentWorkTitles(withChain = true): SportTitleRow[] {
  const rows: SportTitleRow[] = [];

  // 20 element titles (3 qualifying runs each).
  for (const { element, stem, base } of ELEMENTS) {
    LEVELS.forEach(({ level, suffix }, index) => {
      rows.push(
        makeRow(
          `${stem}${suffix}`,
          `Scent Work ${element} ${level}`,
          'element',
          3,
          [element],
          base + index,
          withChain
        )
      );
    });
  }

  // 4 level titles, composed from the four element titles at that level.
  LEVELS.forEach(({ level, suffix }, index) => {
    rows.push(
      makeRow(
        `SW${suffix}`,
        `Scent Work ${level}`,
        'level',
        0,
        [...LEVEL_ELEMENTS],
        300 + index,
        withChain
      )
    );
  });

  // 20 Elite element titles (10 qualifying runs each).
  for (const { element, stem, base } of ELEMENTS) {
    LEVELS.forEach(({ level, suffix }, index) => {
      rows.push(
        makeRow(
          `${stem}${suffix}E`,
          `Scent Work ${element} ${level} Elite`,
          'elite',
          10,
          [element],
          (base === 200 ? 500 : base + 300) + index,
          withChain
        )
      );
    });
  }

  // 4 Elite level titles, composed from the four Elite element titles.
  LEVELS.forEach(({ level, suffix }, index) => {
    rows.push(
      makeRow(
        `SW${suffix}E`,
        `Scent Work ${level} Elite`,
        'champion',
        0,
        [...LEVEL_ELEMENTS],
        600 + index,
        withChain
      )
    );
  });

  // Detective.
  rows.push(makeRow('SWD', 'Scent Work Detective', 'elite', 10, ['Detective'], 700, withChain));

  return rows;
}
