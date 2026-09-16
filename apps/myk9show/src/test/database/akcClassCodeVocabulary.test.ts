// apps/myk9show/src/test/database/akcClassCodeVocabulary.test.ts
//
// MYK9-547 — pins the AKC result-submission class mapping against the class
// vocabulary the DATABASE can actually store, not the one the formatter wishes
// for.
//
// Why it lives in the app and not in `packages/secretary`: the canonical class
// generator (`generateScentWorkClasses` over the AKC registry) is app code, and
// the package must not import from the app. The generator is the right source:
// `registryDbParityContract.test.ts` already asserts that `sport_class_rules`
// seeds exactly the catalog it produces, so every triple below is a row a live
// class can carry — including the one that started this: Detective, with a NULL
// level, which the adapter coalesces to ''.

import { describe, it, expect } from 'vitest';
import { mapAKCClassCodes, collectUnmappableAKCClasses } from '@myk9/secretary';
import type { AKCSubmissionEntry } from '@myk9/secretary';
import { generateScentWorkClasses, getScentWorkSport } from '@/features/registries/scentWork';
import { generateAKCScentWorkClasses } from '@/data/templates/akcScentWorkRules';

/** The class catalog as the wizard generates it, in the shape the adapter emits. */
const catalog = generateScentWorkClasses(getScentWorkSport('AKC')).map(cls => ({
  className: cls.className,
  // `useAKCSubmissionData` coalesces the NULL columns to '' / null exactly here.
  element: cls.element ?? '',
  level: cls.level ?? '',
  section: cls.section ?? null,
}));

/** Every (element, level, section) triple, mapped to its expected AKC pair. */
const EXPECTED: Record<string, { primaryClass: string; secondaryClass: string | null }> = {
  'Container|Novice|A': { primaryClass: 'SWNOVA', secondaryClass: 'CONTAINR' },
  'Container|Novice|B': { primaryClass: 'SWNOVB', secondaryClass: 'CONTAINR' },
  'Container|Advanced|': { primaryClass: 'SWADV', secondaryClass: 'CONTAINR' },
  'Container|Excellent|': { primaryClass: 'SWEXC', secondaryClass: 'CONTAINR' },
  'Container|Master|': { primaryClass: 'SWMAST', secondaryClass: 'CONTAINR' },
  'Interior|Novice|A': { primaryClass: 'SWNOVA', secondaryClass: 'INTERIOR' },
  'Interior|Novice|B': { primaryClass: 'SWNOVB', secondaryClass: 'INTERIOR' },
  'Interior|Advanced|': { primaryClass: 'SWADV', secondaryClass: 'INTERIOR' },
  'Interior|Excellent|': { primaryClass: 'SWEXC', secondaryClass: 'INTERIOR' },
  'Interior|Master|': { primaryClass: 'SWMAST', secondaryClass: 'INTERIOR' },
  'Exterior|Novice|A': { primaryClass: 'SWNOVA', secondaryClass: 'EXTERIOR' },
  'Exterior|Novice|B': { primaryClass: 'SWNOVB', secondaryClass: 'EXTERIOR' },
  'Exterior|Advanced|': { primaryClass: 'SWADV', secondaryClass: 'EXTERIOR' },
  'Exterior|Excellent|': { primaryClass: 'SWEXC', secondaryClass: 'EXTERIOR' },
  'Exterior|Master|': { primaryClass: 'SWMAST', secondaryClass: 'EXTERIOR' },
  'Buried|Novice|A': { primaryClass: 'SWNOVA', secondaryClass: 'BURIED' },
  'Buried|Novice|B': { primaryClass: 'SWNOVB', secondaryClass: 'BURIED' },
  'Buried|Advanced|': { primaryClass: 'SWADV', secondaryClass: 'BURIED' },
  'Buried|Excellent|': { primaryClass: 'SWEXC', secondaryClass: 'BURIED' },
  'Buried|Master|': { primaryClass: 'SWMAST', secondaryClass: 'BURIED' },
  'Handler Discrimination|Novice|A': { primaryClass: 'SWNOVA', secondaryClass: 'HANDDISC' },
  'Handler Discrimination|Novice|B': { primaryClass: 'SWNOVB', secondaryClass: 'HANDDISC' },
  'Handler Discrimination|Advanced|': { primaryClass: 'SWADV', secondaryClass: 'HANDDISC' },
  'Handler Discrimination|Excellent|': { primaryClass: 'SWEXC', secondaryClass: 'HANDDISC' },
  'Handler Discrimination|Master|': { primaryClass: 'SWMAST', secondaryClass: 'HANDDISC' },
  // The bug: a standalone element with no level and no section.
  'Detective||': { primaryClass: 'SWDC', secondaryClass: null },
};

function key(cls: { element: string; level: string; section: string | null }): string {
  return `${cls.element}|${cls.level}|${cls.section ?? ''}`;
}

describe('AKC class codes cover the class vocabulary the database stores', () => {
  it('generates a non-empty catalog (guards against a vacuous pass)', () => {
    expect(catalog.length).toBe(26);
    expect(catalog.some(c => c.element === 'Detective')).toBe(true);
  });

  it('pins every generated triple, with no untested triple and no stale expectation', () => {
    expect(catalog.map(key).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(catalog.map(cls => [cls.className, cls] as const))(
    'maps %s to its AKC class codes',
    (_name, cls) => {
      expect(mapAKCClassCodes(cls.element, cls.level, cls.section)).toEqual(EXPECTED[key(cls)]);
    }
  );

  it('maps no class to SWNOVA unless it really is Novice A', () => {
    // The old silent fallback. Every unrecognised class landed here.
    for (const cls of catalog) {
      const codes = mapAKCClassCodes(cls.element, cls.level, cls.section);
      if (codes?.primaryClass === 'SWNOVA') {
        expect(`${cls.level} ${cls.section ?? ''}`.trim()).toBe('Novice A');
      }
    }
  });

  it('leaves no generated class unmappable', () => {
    const entries = catalog.map(
      cls => ({ ...cls, section: cls.section }) as unknown as AKCSubmissionEntry
    );
    expect(collectUnmappableAKCClasses(entries)).toEqual([]);
  });

  it('covers the rule-template catalog too (same triples, with AKC overrides attached)', () => {
    // `generateAKCScentWorkClasses` is what seeds `sport_class_rules`; it maps
    // over the same generator, so a divergence here means one of the two
    // dropped or renamed a column the formatter keys on.
    const fromRules = generateAKCScentWorkClasses().map(cls =>
      key({ element: cls.element, level: cls.level ?? '', section: cls.section ?? null })
    );
    expect(fromRules.sort()).toEqual(Object.keys(EXPECTED).sort());
  });
});
