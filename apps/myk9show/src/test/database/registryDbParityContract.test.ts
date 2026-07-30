import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRegistry, getSport } from '@/features/registries';
import type { RegistryId, RegistrySport } from '@/features/registries';

/**
 * Registry ↔ database parity for scent-work class structure.
 *
 * `sport_templates.elements` / `.levels` and `features/registries/*.ts` both describe
 * the same thing: which classes a registry offers. They are maintained independently —
 * the DB by seed migration, the registry by TypeScript — and nothing previously asserted
 * they agree. A silent divergence means the show wizard and the printed entry blank
 * disagree about what classes exist, which is invisible until a secretary notices a
 * missing class mid-setup.
 *
 * This reads the seed migration rather than the live database so it runs offline in CI,
 * matching the other contract tests in this directory.
 *
 * Added by docs/plan-template-authoring-removal.md, which removed the UI that let these
 * two sources drift without review.
 */

const SEED_MIGRATION = join(
  process.cwd(),
  '..',
  '..',
  'supabase',
  'migrations',
  '030_seed_sport_templates.sql'
);

const SPORT_ID = 'scent-work';

/** Rows as seeded, keyed by the `organization` column. */
interface SeededTemplate {
  elements: string[];
  levels: string[];
}

/**
 * Pull the `elements` and `levels` ARRAY[...] literals out of each INSERT tuple in the
 * seed. Deliberately narrow: it matches the exact shape the seed uses today and throws
 * if that shape changes, rather than silently parsing zero rows and passing vacuously.
 */
function parseSeededTemplates(sql: string): Record<string, SeededTemplate> {
  const out: Record<string, SeededTemplate> = {};

  // Each tuple opens with the quoted organization, then sport name, then sport code,
  // then the two ARRAY literals we care about.
  const tuplePattern =
    /\(\s*'([A-Z]+)',\s*'[^']*',\s*'[^']*',\s*ARRAY\[([^\]]*)\],\s*ARRAY\[([^\]]*)\]/g;

  for (const match of sql.matchAll(tuplePattern)) {
    const [, organization, elementsRaw, levelsRaw] = match;
    out[organization] = {
      elements: splitSqlStringArray(elementsRaw),
      levels: splitSqlStringArray(levelsRaw),
    };
  }

  return out;
}

function splitSqlStringArray(raw: string): string[] {
  return [...raw.matchAll(/'([^']*)'/g)].map(m => m[1]);
}

/** Levels reachable from the grid elements, in the sport's own progression order. */
function gridLevelLabels(sport: RegistrySport): string[] {
  const gridLevelKeys = new Set(sport.elements.filter(e => e.grid).flatMap(e => e.levels));
  return [...sport.levels]
    .sort((a, b) => a.order - b.order)
    .filter(level => gridLevelKeys.has(level.key))
    .map(level => level.label);
}

const seeded = parseSeededTemplates(readFileSync(SEED_MIGRATION, 'utf8'));

const REGISTRY_IDS: readonly RegistryId[] = ['AKC', 'UKC', 'ASCA'];

/**
 * Registry elements that are deliberately NOT seeded as `sport_templates.elements`.
 *
 * ASCA "Champion" (Champion Detection Level) is modeled in the registry as a standalone
 * one-level element, but no `sport_templates.elements` entry and no `sport_class_rules`
 * rows exist for it — so a secretary cannot currently create an ASCA Champion class.
 * That is a real gap, not a modeling choice; it is pinned here so the parity test can be
 * green on today's reality while still failing on any NEW divergence. Closing it means
 * seeding the element plus its class rules, then deleting this entry.
 */
const KNOWN_UNSEEDED_ELEMENTS: Readonly<Partial<Record<RegistryId, readonly string[]>>> = {
  ASCA: ['Champion'],
};

describe('registry ↔ sport_templates parity', () => {
  it('parses every seeded template (guards against a vacuous pass)', () => {
    expect(Object.keys(seeded).sort()).toEqual(['AKC', 'ASCA', 'UKC']);
    for (const [org, row] of Object.entries(seeded)) {
      expect(row.elements.length, `${org} seeded no elements`).toBeGreaterThan(0);
      expect(row.levels.length, `${org} seeded no levels`).toBeGreaterThan(0);
    }
  });

  describe.each(REGISTRY_IDS)('%s', id => {
    const sport = getSport(getRegistry(id), SPORT_ID);
    const row = seeded[id];

    it('seeds exactly the registry element labels', () => {
      const expectedElements = sport.elements
        .map(e => e.label)
        .filter(label => !(KNOWN_UNSEEDED_ELEMENTS[id] ?? []).includes(label));

      expect([...row.elements].sort()).toEqual([...expectedElements].sort());
    });

    it('seeds the grid-element levels, in progression order', () => {
      // The DB `levels` column is a flat list describing the main progression. The
      // registry additionally carries element-specific levels that never belong here:
      // AKC "Detective", UKC "Excellent" (Handler Discrimination's rank-3 label), and
      // ASCA "Champion" all exist only to give a standalone element its own level slot.
      expect(row.levels).toEqual(gridLevelLabels(sport));
    });

    it('seeds no element or level the registry does not define', () => {
      const registryElements = new Set(sport.elements.map(e => e.label));
      const registryLevels = new Set(sport.levels.map(l => l.label));

      for (const element of row.elements) {
        expect(
          registryElements,
          `${id} seeds element "${element}" with no registry entry`
        ).toContain(element);
      }
      for (const level of row.levels) {
        expect(registryLevels, `${id} seeds level "${level}" with no registry entry`).toContain(
          level
        );
      }
    });
  });

  it('documents every known gap, and no more', () => {
    // If a gap is closed, its entry must be deleted — an allowlist that outlives the
    // problem it describes silently re-permits the drift it was meant to expose.
    for (const [id, labels] of Object.entries(KNOWN_UNSEEDED_ELEMENTS)) {
      const sport = getSport(getRegistry(id as RegistryId), SPORT_ID);
      const registryLabels = sport.elements.map(e => e.label);

      for (const label of labels ?? []) {
        expect(registryLabels, `${id} no longer defines "${label}"`).toContain(label);
        expect(
          seeded[id].elements,
          `${id} now seeds "${label}" — remove it from KNOWN_UNSEEDED_ELEMENTS`
        ).not.toContain(label);
      }
    }
  });
});
