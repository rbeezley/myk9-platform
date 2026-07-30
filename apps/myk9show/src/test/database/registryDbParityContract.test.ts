import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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

/**
 * Migration SQL with comments removed.
 *
 * `proves` predicates MUST match against this rather than the raw file. These migrations
 * quote their own SQL in their rationale headers, so a predicate like
 * `/timer_mode = 'single'/` would happily match the comment describing the change even if
 * someone deleted the statement performing it — the guard would then be asserting that
 * the migration is well documented, not that it does anything.
 */
function executableSql(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/--[^\n]*/g, ' '); // line comments
}

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
 * Every migration that mutates `sport_class_rules`, and how it changes the class set.
 *
 * The seed's literal tuples are parseable; later migrations use `INSERT … SELECT` and
 * `UPDATE`/`DELETE`, which a static parser cannot evaluate. So each is modelled as a
 * delta — but the model is NOT taken on trust. `mutatesClassRules()` below enumerates
 * every migration that touches the table and fails if one is unaccounted for, and each
 * delta declares a `proves` predicate asserting its own migration's SQL actually does
 * what the delta claims. Without those two guards this file would be asserting its
 * author's intent rather than the database's contents.
 */
interface ClassRuleDelta {
  migration: string;
  why: string;
  /**
   * Asserts the migration really performs this delta. Receives COMMENT-STRIPPED SQL —
   * see `executableSql` for why matching the raw file would be self-defeating.
   */
  proves: (sql: string) => void;
  apply: (tuples: ClassTuple[]) => ClassTuple[];
}

const CLASS_RULE_DELTAS: Readonly<Partial<Record<RegistryId, readonly ClassRuleDelta[]>>> = {
  ASCA: [
    {
      migration: '20260701130000_seed_asca_level_c_classes.sql',
      why: 'clones every base ASCA row into a parallel section=C continuation class',
      proves: sql => {
        expect(sql).toMatch(/INSERT INTO public\.sport_class_rules/i);
        expect(sql).toMatch(/'C'\s+AS\s+section|section\s*=\s*'C'|,\s*'C',/i);
        expect(sql).toMatch(/FROM\s+public\.sport_class_rules/i);
      },
      apply: tuples => [...tuples, ...tuples.map(t => ({ ...t, section: 'C' }))],
    },
  ],
  UKC: [
    {
      migration: '20260730180000_fix_ukc_hd_levels.sql',
      why: "HD runs Novice/Advanced/Excellent/Master — 030 seeded it from the grid-element list, mislabelling rank 3 'Superior' and adding a nonexistent Elite",
      proves: sql => {
        expect(sql).toMatch(/SET level = 'Excellent'/);
        expect(sql).toMatch(/AND level = 'Superior'/);
        expect(sql).toMatch(/DELETE FROM public\.sport_class_rules/i);
        expect(sql).toMatch(/AND level = 'Elite'/);
        expect(sql).toMatch(/element = 'Handler Discrimination'/);
      },
      apply: tuples =>
        tuples
          .filter(t => !(t.element === 'Handler Discrimination' && t.level === 'Elite'))
          .map(t =>
            t.element === 'Handler Discrimination' && t.level === 'Superior'
              ? { ...t, level: 'Excellent' }
              : t
          ),
    },
    {
      migration: '20260730200000_fix_ukc_hd_scoring_rules.sql',
      why: 'corrects HD scoring columns only (single timer, no odor, one hide) — no class is added or removed',
      proves: sql => {
        expect(sql).toMatch(/timer_mode = 'single'/);
        expect(sql).toMatch(/odors = '\{\}'::text\[\]/);
        expect(sql).toMatch(/hide_count_fixed = 1/);
        // Must not change the class SET — no inserts, no deletes, no level relabelling.
        expect(sql).not.toMatch(/INSERT INTO/i);
        expect(sql).not.toMatch(/DELETE FROM/i);
        expect(sql).not.toMatch(/SET[^;]*\blevel\s*=/i);
      },
      apply: tuples => tuples,
    },
    {
      migration: '20260730210000_fix_ukc_hd_hides_known.sql',
      why: "marks HD hide counts as rules-set — the count is 1 by rule at every level, never a judge's choice; no class is added or removed",
      proves: sql => {
        expect(sql).toMatch(/hides_known = TRUE/i);
        expect(sql).toMatch(/element = 'Handler Discrimination'/);
        expect(sql).not.toMatch(/INSERT INTO/i);
        expect(sql).not.toMatch(/DELETE FROM/i);
        expect(sql).not.toMatch(/SET[^;]*\blevel\s*=/i);
      },
      apply: tuples => tuples,
    },
  ],
};

/** Migration filenames that write to `sport_class_rules`, newest last. */
function migrationsMutatingClassRules(): string[] {
  return readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .filter(f => {
      const sql = read(f);
      return /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?sport_class_rules/i.test(sql);
    })
    .sort();
}

function seededClassesFor(id: RegistryId): ClassTuple[] {
  const base = parseSeededClasses(seedSql, ORG_ID_VAR[id]);
  return (CLASS_RULE_DELTAS[id] ?? []).reduce((acc, delta) => delta.apply(acc), base);
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
  // ── Guards on the delta model itself ────────────────────────────────────────
  // Without these, everything below asserts what this file's author believed the
  // migrations do, not what they actually do.

  it('accounts for every migration that writes to sport_class_rules', () => {
    const modelled = new Set([
      '030_seed_sport_templates.sql',
      ...Object.values(CLASS_RULE_DELTAS)
        .flat()
        .map(d => d?.migration),
    ]);

    const unaccounted = migrationsMutatingClassRules().filter(f => !modelled.has(f));

    expect(
      unaccounted,
      'A migration writes to sport_class_rules but is not modelled in CLASS_RULE_DELTAS. ' +
        'Add a delta (with a `proves` predicate) so this contract still reflects the database.'
    ).toEqual([]);
  });

  it('verifies each delta against its migration SQL', () => {
    for (const [id, deltas] of Object.entries(CLASS_RULE_DELTAS)) {
      for (const delta of deltas ?? []) {
        const sql = executableSql(delta.migration);
        // A migration that is all rationale and no statements must not pass.
        expect(sql.trim().length, `${delta.migration} has no executable SQL`).toBeGreaterThan(0);
        // Throws with vitest's diff if the SQL stopped doing what the delta models.
        delta.proves(sql);
        expect(delta.why.length, `${id} ${delta.migration} has no rationale`).toBeGreaterThan(0);
      }
    }
  });

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
