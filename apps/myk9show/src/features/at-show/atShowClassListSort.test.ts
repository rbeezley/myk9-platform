/**
 * MYK9-637 (round 2): the picker's order must not change after first paint.
 *
 * `classScanPriority` used to rank a class with entries above an empty one.
 * That was stable only by accident: the entries replica on this route was
 * permanently cold, so every class scored the same forever. With the show's
 * entries now arriving a second or two after paint, a count-sensitive order
 * re-sorts the list under a judge's finger on venue wifi.
 */
import { describe, it, expect } from 'vitest';
import { groupSectionedClasses, type ClassEntry } from '@myk9/ringside';
import {
  classScanPriority,
  sortClassesForAtShowScan,
  sortClassesForYourRing,
  yourRingScanPriority,
} from './atShowClassListSort';

function classEntry(overrides: Partial<ClassEntry>): ClassEntry {
  return {
    id: 'class-1',
    element: 'Container',
    level: 'Novice',
    section: '',
    class_name: 'Container Novice',
    class_order: 1,
    judge_name: 'Jane Judge',
    entry_count: 0,
    completed_count: 0,
    class_status: 'setup',
    is_favorite: false,
    dogs: [],
    ...overrides,
  } as ClassEntry;
}

const COLD = [
  classEntry({ id: 'a', class_name: 'Alpha', class_order: 3 }),
  classEntry({ id: 'b', class_name: 'Bravo', class_order: 1 }),
  classEntry({ id: 'c', class_name: 'Charlie', class_order: 2 }),
];
// The same three classes once the show-scoped entries sync lands. Only 'a' has
// entries, so a count-sensitive order would pull it from last to first.
const WARM = [
  classEntry({ id: 'a', class_name: 'Alpha', class_order: 3, entry_count: 66 }),
  classEntry({ id: 'b', class_name: 'Bravo', class_order: 1 }),
  classEntry({ id: 'c', class_name: 'Charlie', class_order: 2 }),
];

describe('at-show scan ordering is stable across entry hydration', () => {
  it('keeps the full picker in the same order when counts arrive', () => {
    const before = sortClassesForAtShowScan(COLD).map(entry => entry.id);
    const after = sortClassesForAtShowScan(WARM).map(entry => entry.id);

    expect(before).toEqual(['b', 'c', 'a']);
    expect(after).toEqual(before);
  });

  it('keeps Your ring in the same order when counts arrive', () => {
    const rows = (classes: ClassEntry[]) =>
      classes.map(entry => ({
        entry,
        scanPriority: yourRingScanPriority(entry),
        trialTimeZone: 'America/New_York',
      }));

    const before = sortClassesForYourRing(rows(COLD)).map(row => row.entry.id);
    const after = sortClassesForYourRing(rows(WARM)).map(row => row.entry.id);

    expect(before).toEqual(['b', 'c', 'a']);
    expect(after).toEqual(before);
  });

  it('still ranks favorites and live rings above the rest', () => {
    expect(classScanPriority(classEntry({ is_favorite: true }))).toBe(0);
    expect(classScanPriority(classEntry({ class_status: 'in_progress' }))).toBe(1);
    expect(classScanPriority(classEntry({ entry_count: 66 }))).toBe(2);
    expect(yourRingScanPriority(classEntry({ class_status: 'in_progress' }))).toBe(0);
    expect(yourRingScanPriority(classEntry({ entry_count: 66 }))).toBe(1);
  });
});

describe('combined A/B card sorts on both sections (MYK9-1092)', () => {
  const ukcPair = (aStatus: ClassEntry['class_status'], bStatus: ClassEntry['class_status']) => [
    classEntry({ id: 'a', section: 'A', class_name: 'Interior Advanced A', class_status: aStatus }),
    classEntry({ id: 'b', section: 'B', class_name: 'Interior Advanced B', class_status: bStatus }),
  ];
  const other = classEntry({ id: 'x', class_name: 'Zulu', class_order: 9, class_status: 'setup' });

  it('does not sort as finished while Section B is still running', () => {
    const grouped = groupSectionedClasses(ukcPair('completed', 'in_progress'), 'UKC');
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.class_status).toBe('in_progress');
    const sorted = sortClassesForAtShowScan([other, ...grouped]);
    expect(sorted.map(c => c.id)).toEqual(['a', 'x']);
  });

  it('is no longer live once both sections are completed', () => {
    const [live] = groupSectionedClasses(ukcPair('completed', 'in_progress'), 'UKC');
    const [done] = groupSectionedClasses(ukcPair('completed', 'completed'), 'UKC');
    expect(done?.class_status).toBe('completed');
    expect(classScanPriority(live as ClassEntry)).toBeLessThan(
      classScanPriority(done as ClassEntry)
    );
  });
});
