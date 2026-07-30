import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRegistry, getSport } from '@/features/registries';
import { generateScentWorkClasses } from '@/features/registries/scentWork';
import type { RegistryId, RegistrySport } from '@/features/registries';

/**
 * Registry ↔ database parity for scent-work class structure.
 *
 * `features/registries/*.ts` and the seeded `sport_templates` / `sport_class_rules` rows
 * both describe which classes a registry offers. They are maintained independently — one
 * by TypeScript, one by seed migration — and nothing previously asserted they agree. A
 * silent divergence means the show wizard offers classes that do not exist, or withholds
 * ones that do, and it surfaces only when a secretary notices mid-setup.
 *
 * That is not hypothetical. The first version of this test compared only the flat
 * `sport_templates.elements` / `.levels` columns and passed while UKC Handler
 * Discrimination was seeded with Superior and Elite classes that UKC does not run
 * (rulebook Ch. 11 §2: HD has exactly four classes — Novice, Advanced, Excellent,
 * Master). The flat columns agreed; the actual class rows did not. Hence the class-tuple
 * comparison below: `sport_class_rules` is what the wizard reads, so that is what must
 * match.
 *
 * Reads the seed migrations rather than the live database so it runs offline in CI,
 * matching the other contract tests in this directory.
 */

const MIGRATIONS = join(process.cwd(), '..', '..', 'supabase', 'migrations');
const SPORT_ID = 'scent-work';

const read = (file: string) => readFileSync(join(MIGRATIONS, file), 'utf8');

/** `organization` → its `<org>_id` variable name inside the 030 DO block. */
const ORG_ID_VAR: Readonly<Record<RegistryId, string>> = {
  AKC: 'akc_id',
  UKC: 'ukc_id',
  ASCA: 'asca_id',
};

interface SeededTemplate {
  elements: string[];
  levels: string[];
}

/** A class row reduced to the fields that define its identity. */
interface ClassTuple {
  element: string;
  level: string | null;
  section: string | null;
}

const tupleKey = (t: ClassTuple) => `${t.element}|${t.level ?? '—'}|${t.section ?? '—'}`;
const sortedKeys = (tuples: ClassTuple[]) => tuples.map(tupleKey).sort();

function splitSqlStringArray(raw: string): string[] {
  return [...raw.matchAll(/'([^']*)'/g)].map(m => m[1]);
}

/**
 * `sport_templates` rows from 030. Deliberately narrow: it matches the exact tuple shape
 * the seed uses today and yields nothing if that shape changes, which the
 * "parses every seeded template" guard below turns into a loud failure.
 */
function parseSeededTemplates(sql: string): Record<string, SeededTemplate> {
  const out: Record<string, SeededTemplate> = {};
  const pattern =
    /\(\s*'([A-Z]+)',\s*'[^']*',\s*'[^']*',\s*ARRAY\[([^\]]*)\],\s*ARRAY\[([^\]]*)\]/g;

  for (const [, organization, elementsRaw, levelsRaw] of sql.matchAll(pattern)) {
    out[organization] = {
      elements: splitSqlStringArray(elementsRaw),
      levels: splitSqlStringArray(levelsRaw),
    };
  }
  return out;
}

/**
 * `sport_class_rules` tuples from 030, for one registry. Each VALUES row opens
 * `(<org>_id, '<element>', <level>, '<class_name>', <section>, <display_order>` where
 * level and section are either a quoted string or the bare keyword NULL.
 */
function parseSeededClasses(sql: string, orgVar: string): ClassTuple[] {
  const quotedOrNull = String.raw`(?:'((?:[^']|'')*)'|NULL)`;
  const pattern = new RegExp(
    String.raw`\(\s*${orgVar},\s*'([^']*)',\s*${quotedOrNull},\s*'[^']*',\s*${quotedOrNull},\s*\d+`,
    'g'
  );

  return [...sql.matchAll(pattern)].map(m => ({
    element: m[1],
    level: m[2] ?? null,
    section: m[3] ?? null,
  }));
}

const seedSql = read('030_seed_sport_templates.sql');
const seeded = parseSeededTemplates(seedSql);

/**
 * Class tuples as they stand AFTER every migration that touches `sport_class_rules`.
 *
 * 030 is parsed; later migrations are replayed as explicit deltas, because they use
 * `INSERT … SELECT` and `UPDATE`/`DELETE` rather than literal tuples a parser can read.
 *
 * MAINTENANCE: a new migration that adds, removes, or relabels class rules must be
 * replayed here. That is deliberate friction — this test is the thing that notices when
 * the wizard's catalog stops matching the registry, so it has to know the current state.
 */
function seededClassesFor(id: RegistryId): ClassTuple[] {
  let tuples = parseSeededClasses(seedSql, ORG_ID_VAR[id]);

  if (id === 'ASCA') {
    // 20260701130000_seed_asca_level_c_classes.sql — clones every base ASCA row into a
    // parallel `section = 'C'` continuation class ("the same methods and standards are
    // used for judging and scoring the Level C classes as the base level classes").
    tuples = [...tuples, ...tuples.map(t => ({ ...t, section: 'C' }))];
  }

  if (id === 'UKC') {
    // 20260730180000_fix_ukc_hd_levels.sql — HD runs Novice/Advanced/Excellent/Master
    // (rulebook Ch. 11 §2). 030 seeded it from the grid-element level list, so rank 3 was
    // labelled Superior and a nonexistent Elite was added.
    tuples = tuples
      .filter(t => !(t.element === 'Handler Discrimination' && t.level === 'Elite'))
      .map(t =>
        t.element === 'Handler Discrimination' && t.level === 'Superior'
          ? { ...t, level: 'Excellent' }
          : t
      );
  }

  return tuples;
}

/** Levels reachable from the grid elements, in the sport's own progression order. */
function gridLevelLabels(sport: RegistrySport): string[] {
  const gridLevelKeys = new Set(sport.elements.filter(e => e.grid).flatMap(e => e.levels));
  return [...sport.levels]
    .sort((a, b) => a.order - b.order)
    .filter(level => gridLevelKeys.has(level.key))
    .map(level => level.label);
}

const REGISTRY_IDS: readonly RegistryId[] = ['AKC', 'UKC', 'ASCA'];

/**
 * Registry elements deliberately NOT seeded into the wizard template.
 *
 * ASCA "Champion" (Champion Detection Level) is real — it arrived with the June 2026 ASCA
 * Scent Detection Program Rules, Chapter 9, motion SC.26.01. See
 * `docs/design_handoff_heritage/Multi-Registry Scoping.md` §9.2–9.3, the source of record.
 * The rulebook extract at `docs/rulebooks/asca-scent-detection-rules.txt` PREDATES that
 * amendment (its §9 is Faults), so its silence is not evidence of absence.
 *
 * It is absent by decision, not omission: `20260701130000_seed_asca_level_c_classes.sql`
 * records the 2026-07-01 product call — "Level C IS a separately-scheduled class and
 * should be seedable; Champion is titling/invitational and is intentionally NOT seeded
 * here (it stays a config-only construct)". Champion is also points-based with mixed,
 * non-element-split search areas, which `sport_class_rules` (max time / hide count /
 * timer mode / odors) cannot express.
 *
 * This pins an intentional asymmetry, not a bug. If Champion ever becomes schedulable,
 * delete this entry.
 */
const UNSEEDED_ELEMENTS: Readonly<Partial<Record<RegistryId, readonly string[]>>> = {
  ASCA: ['Champion'],
};

describe('registry ↔ database parity', () => {
  it('parses the seed (guards against a vacuous pass)', () => {
    expect(Object.keys(seeded).sort()).toEqual(['AKC', 'ASCA', 'UKC']);
    for (const id of REGISTRY_IDS) {
      expect(seeded[id].elements.length, `${id} seeded no elements`).toBeGreaterThan(0);
      expect(seeded[id].levels.length, `${id} seeded no levels`).toBeGreaterThan(0);
      expect(seededClassesFor(id).length, `${id} parsed no class rules`).toBeGreaterThan(0);
    }
  });

  describe.each(REGISTRY_IDS)('%s', id => {
    const sport = getSport(getRegistry(id), SPORT_ID);
    const unseeded = new Set(UNSEEDED_ELEMENTS[id] ?? []);

    /** What the wizard should offer: the registry catalog, minus deliberately unseeded elements. */
    const expectedClasses: ClassTuple[] = generateScentWorkClasses(sport)
      .filter(c => !unseeded.has(c.element))
      .map(c => ({ element: c.element, level: c.level ?? null, section: c.section ?? null }));

    it('seeds exactly the class catalog the registry generates', () => {
      // THE assertion. `sport_class_rules` is what the show wizard reads, so a mismatch
      // here is a class a secretary can or cannot create, not a metadata discrepancy.
      expect(sortedKeys(seededClassesFor(id))).toEqual(sortedKeys(expectedClasses));
    });

    it('seeds exactly the registry element labels', () => {
      const expected = sport.elements.map(e => e.label).filter(label => !unseeded.has(label));
      expect([...seeded[id].elements].sort()).toEqual([...expected].sort());
    });

    it('seeds the grid-element levels, in progression order', () => {
      // `sport_templates.levels` is a flat list of the levels the wizard offers, which is
      // the GRID elements' level set. The registry carries more, for two different reasons:
      //   - AKC "Detective" / UKC "Excellent" exist to give a standalone or divergent
      //     element its own level slot;
      //   - ASCA "Champion" is a genuine fifth level held back by the decision above.
      expect(seeded[id].levels).toEqual(gridLevelLabels(sport));
    });

    it('seeds no element or level the registry does not define', () => {
      const registryElements = new Set(sport.elements.map(e => e.label));
      const registryLevels = new Set(sport.levels.map(l => l.label));

      for (const element of seeded[id].elements) {
        expect(
          registryElements,
          `${id} seeds element "${element}" with no registry entry`
        ).toContain(element);
      }
      for (const level of seeded[id].levels) {
        expect(registryLevels, `${id} seeds level "${level}" with no registry entry`).toContain(
          level
        );
      }
    });
  });

  it('models UKC Handler Discrimination as the exception it is', () => {
    // Regression guard for the bug that motivated the class-tuple comparison. UKC's grid
    // elements run Novice/Advanced/Superior/Master/Elite; HD runs Novice/Advanced/
    // Excellent/Master. Rulebook Ch. 11 §2 lists exactly four HD classes and contains no
    // "Handler Discrimination Superior" or "… Elite" anywhere; the source of record
    // (Multi-Registry Scoping.md §8) says HD "swaps 'Excellent' for 'Superior' at rank 3
    // and has no Elite".
    const hdLevels = new Set(
      seededClassesFor('UKC')
        .filter(t => t.element === 'Handler Discrimination')
        .map(t => t.level)
    );

    expect([...hdLevels].sort()).toEqual(['Advanced', 'Excellent', 'Master', 'Novice']);

    const gridLevels = new Set(
      seededClassesFor('UKC')
        .filter(t => t.element === 'Container')
        .map(t => t.level)
    );

    expect(gridLevels.has('Superior')).toBe(true);
    expect(gridLevels.has('Elite')).toBe(true);
    expect(gridLevels.has('Excellent')).toBe(false);
  });
});
