import { describe, it, expect } from 'vitest';
import {
  compareClassesByProgression,
  compareLevelsByProgression,
  isKnownLevel,
  levelProgressionRank,
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
