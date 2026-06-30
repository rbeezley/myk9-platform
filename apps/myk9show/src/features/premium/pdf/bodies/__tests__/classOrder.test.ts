import { describe, it, expect } from 'vitest';
import {
  compareClassesByProgression,
  compareLevelsByProgression,
  isKnownLevel,
  levelProgressionRank,
  makeClassComparator,
  type ClassLike,
} from '../classOrder';

/**
 * Characterization test for the scent-work class-ordering module (Phase 1 of the
 * multi-registry plan). These pin the EXACT current behavior of all four exports so the
 * upcoming refactor — sourcing the level order from the AKC registry instead of a
 * hardcoded LEVEL_ORDER array — provably changes nothing. Consumers: every premium PDF
 * body (compareClassesByProgression) and moveUpEligibility (levelProgressionRank/isKnownLevel).
 */
describe('classOrder — levelProgressionRank (characterization)', () => {
  // Exact ranks captured from the current LEVEL_ORDER array, including the vestigial
  // 'Novice A'/'Novice B' entries and the 'Masters' plural alias.
  const cases: Array<[string, number]> = [
    ['Novice A', 0],
    ['Novice B', 1],
    ['Novice', 2],
    ['Advanced', 3],
    ['Excellent', 4],
    ['Master', 5],
    ['Detective', 6],
    ['Masters', 5], // alias → Master
    ['novice', 2], // case-insensitive
    ['  Master  ', 5], // trimmed
    ['Elite', 999], // unknown → UNKNOWN_LEVEL_RANK
    ['', 999],
  ];
  it.each(cases)('rank(%j) === %i', (level, rank) => {
    expect(levelProgressionRank(level)).toBe(rank);
  });
});

describe('classOrder — isKnownLevel (characterization)', () => {
  const known = ['Novice', 'Advanced', 'Excellent', 'Master', 'Masters', 'Detective', 'novice'];
  const unknown = ['Elite', 'Open', 'Superior', '', 'Champion'];
  it.each(known)('isKnownLevel(%j) === true', l => expect(isKnownLevel(l)).toBe(true));
  it.each(unknown)('isKnownLevel(%j) === false', l => expect(isKnownLevel(l)).toBe(false));
});

describe('classOrder — compareLevelsByProgression (characterization)', () => {
  it('orders the full AKC ladder by progression', () => {
    const shuffled = ['Master', 'Novice', 'Detective', 'Excellent', 'Advanced'];
    expect([...shuffled].sort(compareLevelsByProgression)).toEqual([
      'Novice',
      'Advanced',
      'Excellent',
      'Master',
      'Detective',
    ]);
  });

  it('unknown levels sort last, alphabetically among themselves', () => {
    const mixed = ['Zeta', 'Master', 'Alpha', 'Novice'];
    expect([...mixed].sort(compareLevelsByProgression)).toEqual([
      'Novice',
      'Master',
      'Alpha',
      'Zeta',
    ]);
  });
});

describe('classOrder — compareClassesByProgression (characterization)', () => {
  it('sorts by element, then level, then section (nulls last)', () => {
    const classes: ClassLike[] = [
      { element: 'Interior', level: 'Novice', section: 'B' },
      { element: 'Container', level: 'Master', section: null },
      { element: 'Interior', level: 'Novice', section: 'A' },
      { element: 'Container', level: 'Novice', section: 'A' },
      { element: 'Container', level: 'Novice', section: 'B' },
      { element: 'Container', level: 'Advanced', section: null },
    ];
    const sorted = [...classes]
      .sort(compareClassesByProgression)
      .map(c => `${c.element} ${c.level}${c.section ? ' ' + c.section : ''}`);
    expect(sorted).toEqual([
      'Container Novice A',
      'Container Novice B',
      'Container Advanced',
      'Container Master',
      'Interior Novice A',
      'Interior Novice B',
    ]);
  });
});

/**
 * Phase 5b: classOrder.ts used to hardcode AKC's level ladder for EVERY premium PDF,
 * regardless of the show's actual registry — so a UKC premium document (premium generation
 * already supports UKC) sorted 'Superior'/'Elite' classes to the bottom (unknown → rank 999)
 * instead of their correct rank-3/rank-5 position. These tests pin the live bug fix.
 */
describe('classOrder — registry-aware (Phase 5b)', () => {
  it('without a registryId arg, UKC-only levels still rank unknown (AKC default unchanged)', () => {
    expect(levelProgressionRank('Superior')).toBe(999);
    expect(isKnownLevel('Superior')).toBe(false);
  });

  it('recognizes UKC Superior/Elite in their correct progression rank when passed UKC', () => {
    expect(isKnownLevel('Superior', 'UKC')).toBe(true);
    expect(isKnownLevel('Elite', 'UKC')).toBe(true);
    const shuffled = ['Elite', 'Novice', 'Superior', 'Advanced', 'Master'];
    expect([...shuffled].sort((a, b) => compareLevelsByProgression(a, b, 'UKC'))).toEqual([
      'Novice',
      'Advanced',
      'Superior',
      'Master',
      'Elite',
    ]);
  });

  it('recognizes ASCA Open/Champion in their correct progression rank when passed ASCA', () => {
    expect(isKnownLevel('Open', 'ASCA')).toBe(true);
    const shuffled = ['Champion', 'Novice', 'Open', 'Excellent', 'Advanced'];
    expect([...shuffled].sort((a, b) => compareLevelsByProgression(a, b, 'ASCA'))).toEqual([
      'Novice',
      'Open',
      'Advanced',
      'Excellent',
      'Champion',
    ]);
  });

  it("the AKC-only 'Masters' alias does not leak into UKC/ASCA canonicalization", () => {
    expect(isKnownLevel('Masters', 'AKC')).toBe(true); // AKC alias for 'Master'
    expect(isKnownLevel('Masters', 'UKC')).toBe(false); // UKC has no 'Masters' alias
    expect(isKnownLevel('Masters', 'ASCA')).toBe(false); // ASCA has no 'Masters' alias
  });

  it('makeClassComparator binds a registry once for a .sort()-ready comparator', () => {
    const classes: ClassLike[] = [
      { element: 'Container', level: 'Elite', section: null },
      { element: 'Container', level: 'Novice', section: null },
      { element: 'Container', level: 'Superior', section: null },
    ];
    const sorted = [...classes].sort(makeClassComparator('UKC')).map(c => c.level);
    expect(sorted).toEqual(['Novice', 'Superior', 'Elite']);
  });

  it('compareClassesByProgression accepts a registryId positionally, same element/section rules apply', () => {
    const classes: ClassLike[] = [
      { element: 'Container', level: 'Open', section: null },
      { element: 'Container', level: 'Novice', section: null },
      { element: 'Container', level: 'Champion', section: null },
    ];
    const sorted = [...classes]
      .sort((a, b) => compareClassesByProgression(a, b, 'ASCA'))
      .map(c => c.level);
    expect(sorted).toEqual(['Novice', 'Open', 'Champion']);
  });
});
