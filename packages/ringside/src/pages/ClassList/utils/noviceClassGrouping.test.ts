/**
 * Unit Tests for Sectioned Class Grouping Utilities
 */

import {
  findPairedSectionedClass,
  groupSectionedClasses,
  isCombinedEntry,
  getClassIds,
  shouldCombineAllSections,
} from './noviceClassGrouping';
import type { ClassEntry } from '../types';

const createMockClass = (overrides: Partial<ClassEntry> = {}): ClassEntry => ({
  id: '1',
  class_name: 'Container Novice A',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  class_order: 1,
  judge_name: 'Test Judge',
  class_status: 'no-status',
  entry_count: 5,
  completed_count: 0,
  dogs: [],
  is_favorite: false,
  ...overrides,
});

describe('getClassIds', () => {
  test('should return single ID for regular class', () => {
    const regularClass = createMockClass({ id: '1', section: 'A' });
    const ids = getClassIds(regularClass);

    expect(ids).toEqual(['1']);
  });

  test('should return both IDs for combined class', () => {
    const combined = createMockClass({
      id: '1',
      section: 'A & B',
      pairedClassId: '2',
    });
    const ids = getClassIds(combined);

    expect(ids).toEqual(['1', '2']);
  });
});

// =============================================================================
// NEW: Tests for organization-aware sectioned class grouping
// =============================================================================

describe('shouldCombineAllSections', () => {
  test('should return true for UKC Nosework', () => {
    expect(shouldCombineAllSections('UKC Nosework')).toBe(true);
    expect(shouldCombineAllSections('ukc nosework')).toBe(true);
    expect(shouldCombineAllSections('UKC NOSEWORK')).toBe(true);
  });

  test("should return true for myK9Show's bare UKC registry id", () => {
    // myK9Show stores the show's organization as the registry id, not the
    // myK9Q-era "UKC Nosework" label; every UKC level has A/B divisions.
    expect(shouldCombineAllSections('UKC')).toBe(true);
    expect(shouldCombineAllSections(' ukc ')).toBe(true);
  });

  test('should return false for AKC', () => {
    expect(shouldCombineAllSections('AKC Scent Work')).toBe(false);
    expect(shouldCombineAllSections('AKC ScentWork')).toBe(false);
  });

  test('should return false for undefined/empty', () => {
    expect(shouldCombineAllSections(undefined)).toBe(false);
    expect(shouldCombineAllSections('')).toBe(false);
  });

  test('should return false for other UKC events without Nosework', () => {
    expect(shouldCombineAllSections('UKC Rally')).toBe(false);
    expect(shouldCombineAllSections('UKC Obedience')).toBe(false);
  });
});

describe('findPairedSectionedClass', () => {
  test('should pair Advanced classes for UKC Nosework', () => {
    const classA = createMockClass({ id: '1', level: 'Advanced', section: 'A' });
    const classB = createMockClass({ id: '2', level: 'Advanced', section: 'B' });
    const classes = [classA, classB];

    const result = findPairedSectionedClass(classA, classes, 'UKC Nosework');
    expect(result).toEqual(classB);
  });

  test('should pair Master classes for UKC Nosework', () => {
    const classA = createMockClass({ id: '1', level: 'Master', section: 'A' });
    const classB = createMockClass({ id: '2', level: 'Master', section: 'B' });
    const classes = [classA, classB];

    const result = findPairedSectionedClass(classA, classes, 'UKC Nosework');
    expect(result).toEqual(classB);
  });

  test('should NOT pair Advanced classes for AKC', () => {
    const classA = createMockClass({ id: '1', level: 'Advanced', section: 'A' });
    const classB = createMockClass({ id: '2', level: 'Advanced', section: 'B' });
    const classes = [classA, classB];

    const result = findPairedSectionedClass(classA, classes, 'AKC Scent Work');
    expect(result).toBeNull();
  });

  test('should still pair Novice classes for AKC', () => {
    const classA = createMockClass({ id: '1', level: 'Novice', section: 'A' });
    const classB = createMockClass({ id: '2', level: 'Novice', section: 'B' });
    const classes = [classA, classB];

    const result = findPairedSectionedClass(classA, classes, 'AKC Scent Work');
    expect(result).toEqual(classB);
  });

  test('should return null for classes without A/B sections', () => {
    const classNoSection = createMockClass({ id: '1', level: 'Advanced', section: '-' });
    const classes = [classNoSection];

    const result = findPairedSectionedClass(classNoSection, classes, 'UKC Nosework');
    expect(result).toBeNull();
  });
});

describe('groupSectionedClasses', () => {
  test('should combine all levels for UKC Nosework', () => {
    const noviceA = createMockClass({ id: '1', level: 'Novice', section: 'A', entry_count: 5 });
    const noviceB = createMockClass({ id: '2', level: 'Novice', section: 'B', entry_count: 3 });
    const advancedA = createMockClass({ id: '3', level: 'Advanced', section: 'A', entry_count: 4 });
    const advancedB = createMockClass({ id: '4', level: 'Advanced', section: 'B', entry_count: 2 });
    const classes = [noviceA, noviceB, advancedA, advancedB];

    const result = groupSectionedClasses(classes, 'UKC Nosework');

    expect(result).toHaveLength(2); // Novice A&B and Advanced A&B
    expect(result[0].section).toBe('A & B');
    expect(result[0].entry_count).toBe(8); // 5 + 3
    expect(result[1].section).toBe('A & B');
    expect(result[1].entry_count).toBe(6); // 4 + 2
  });

  test('should only combine Novice for AKC', () => {
    const noviceA = createMockClass({ id: '1', level: 'Novice', section: 'A', entry_count: 5 });
    const noviceB = createMockClass({ id: '2', level: 'Novice', section: 'B', entry_count: 3 });
    const advancedA = createMockClass({ id: '3', level: 'Advanced', section: 'A', entry_count: 4 });
    const advancedB = createMockClass({ id: '4', level: 'Advanced', section: 'B', entry_count: 2 });
    const classes = [noviceA, noviceB, advancedA, advancedB];

    const result = groupSectionedClasses(classes, 'AKC Scent Work');

    expect(result).toHaveLength(3); // Novice A&B (combined) + Advanced A + Advanced B (separate)
    expect(result[0].section).toBe('A & B'); // Novice combined
    expect(result[1].section).toBe('A'); // Advanced A kept separate
    expect(result[2].section).toBe('B'); // Advanced B kept separate
  });

  test('should default to AKC behavior when no organization provided', () => {
    const advancedA = createMockClass({ id: '1', level: 'Advanced', section: 'A' });
    const advancedB = createMockClass({ id: '2', level: 'Advanced', section: 'B' });
    const classes = [advancedA, advancedB];

    const result = groupSectionedClasses(classes, undefined);

    // Advanced classes should NOT be combined without organization
    expect(result).toHaveLength(2);
    expect(result[0].section).toBe('A');
    expect(result[1].section).toBe('B');
  });
});

describe('different judges (MYK9-1092)', () => {
  test('A and B with different judges are not paired', () => {
    const classA = createMockClass({ id: '1', level: 'Advanced', section: 'A', judge_name: 'Ann' });
    const classB = createMockClass({ id: '2', level: 'Advanced', section: 'B', judge_name: 'Bob' });
    expect(findPairedSectionedClass(classA, [classA, classB], 'UKC')).toBeNull();
    expect(findPairedSectionedClass(classB, [classA, classB], 'UKC')).toBeNull();
  });

  test('judge names compare ignoring case and surrounding space', () => {
    const classA = createMockClass({ id: '1', section: 'A', judge_name: 'Ann Lee' });
    const classB = createMockClass({ id: '2', section: 'B', judge_name: ' ann lee ' });
    expect(findPairedSectionedClass(classA, [classA, classB], 'AKC')).toEqual(classB);
  });

  test('different-judge sections stay two cards with their own ids and no pairedClassId', () => {
    const classA = createMockClass({ id: '1', level: 'Master', section: 'A', judge_name: 'Ann' });
    const classB = createMockClass({ id: '2', level: 'Master', section: 'B', judge_name: 'Bob' });
    const result = groupSectionedClasses([classA, classB], 'UKC');
    expect(result.map(c => c.id)).toEqual(['1', '2']);
    expect(result.map(c => c.section)).toEqual(['A', 'B']);
    expect(result.every(c => !isCombinedEntry(c))).toBe(true);
    expect(result.map(c => getClassIds(c))).toEqual([['1'], ['2']]);
  });

  test('two classes both with no judge assigned still combine', () => {
    const classA = createMockClass({ id: '1', section: 'A', judge_name: 'No Judge Assigned' });
    const classB = createMockClass({ id: '2', section: 'B', judge_name: 'No Judge Assigned' });
    expect(groupSectionedClasses([classA, classB], 'AKC')).toHaveLength(1);
  });
});

describe('combined card merges both sections (MYK9-1092)', () => {
  const pair = (a: Partial<ClassEntry>, b: Partial<ClassEntry>) =>
    groupSectionedClasses(
      [
        createMockClass({ id: '1', level: 'Advanced', section: 'A', ...a }),
        createMockClass({ id: '2', level: 'Advanced', section: 'B', ...b }),
      ],
      'UKC'
    )[0];

  test('completed only when both are completed', () => {
    expect(pair({ class_status: 'completed' }, { class_status: 'in_progress' }).class_status).toBe(
      'in_progress'
    );
    expect(pair({ class_status: 'in_progress' }, { class_status: 'completed' }).class_status).toBe(
      'in_progress'
    );
    expect(pair({ class_status: 'completed' }, { class_status: 'setup' }).class_status).toBe(
      'in_progress'
    );
    expect(pair({ class_status: 'completed' }, { class_status: 'completed' }).class_status).toBe(
      'completed'
    );
  });

  test('in progress if either is; otherwise the earlier state', () => {
    expect(pair({ class_status: 'setup' }, { class_status: 'in_progress' }).class_status).toBe(
      'in_progress'
    );
    expect(pair({ class_status: 'briefing' }, { class_status: 'setup' }).class_status).toBe(
      'setup'
    );
    expect(pair({ class_status: 'no-status' }, { class_status: 'break' }).class_status).toBe(
      'no-status'
    );
  });

  test('status matrix: every A/B combination', () => {
    const all = [
      'no-status',
      'setup',
      'briefing',
      'break',
      'start_time',
      'in_progress',
      'offline-scoring',
      'completed',
    ] as const;
    const rank = ['no-status', 'setup', 'briefing', 'break', 'start_time'];
    for (const a of all) {
      for (const b of all) {
        let want: string;
        if (a === 'offline-scoring' || b === 'offline-scoring') want = 'offline-scoring';
        else if (a === 'in_progress' || b === 'in_progress') want = 'in_progress';
        else if (a === 'completed' && b === 'completed') want = 'completed';
        else if (a === 'completed' || b === 'completed') want = 'in_progress';
        else want = rank.indexOf(a) <= rank.indexOf(b) ? a : b;
        expect(pair({ class_status: a }, { class_status: b }).class_status, `${a}/${b}`).toBe(want);
      }
    }
  });

  test('offline-scoring survives against completed and in progress', () => {
    expect(
      pair({ class_status: 'completed' }, { class_status: 'offline-scoring' }).class_status
    ).toBe('offline-scoring');
    expect(
      pair({ class_status: 'offline-scoring' }, { class_status: 'in_progress' }).class_status
    ).toBe('offline-scoring');
  });

  test('times compare as instants, not strings', () => {
    const z = pair(
      { planned_start_time: '2026-10-10T15:00:00Z' },
      {
        planned_start_time: '2026-10-10T10:30:00-05:00',
      }
    ).planned_start_time;
    // 15:00Z is earlier than 15:30Z (10:30-05:00); winner keeps its original string.
    expect(z).toBe('2026-10-10T15:00:00Z');
    const same = pair(
      { start_time: '2026-10-10T09:00:00+00:00' },
      {
        start_time: '2026-10-10T08:30:00Z',
      }
    ).start_time;
    expect(same).toBe('2026-10-10T08:30:00Z');
  });

  test('clock times compare numerically and with AM/PM', () => {
    expect(pair({ start_time: '10:00' }, { start_time: '9:00' }).start_time).toBe('9:00');
    expect(pair({ start_time: '1:00 PM' }, { start_time: '11:30 AM' }).start_time).toBe('11:30 AM');
    expect(pair({ start_time: '12:15 AM' }, { start_time: '9:00 AM' }).start_time).toBe('12:15 AM');
  });

  test('ISO vs HH:MM keeps the dated instant; unparseable loses to parseable', () => {
    expect(pair({ start_time: '8:00' }, { start_time: '2026-10-10T15:00:00Z' }).start_time).toBe(
      '2026-10-10T15:00:00Z'
    );
    expect(pair({ start_time: 'soon' }, { start_time: '9:00' }).start_time).toBe('9:00');
    expect(pair({ start_time: '9:00' }, { start_time: 'soon' }).start_time).toBe('9:00');
  });

  test('release shows only when both are released, at the later stamp', () => {
    const early = '2026-10-10T10:00:00Z';
    const late = '2026-10-10T12:00:00Z';
    expect(
      pair({ results_released_at: early }, { results_released_at: null }).results_released_at
    ).toBeNull();
    expect(
      pair({ results_released_at: null }, { results_released_at: late }).results_released_at
    ).toBeNull();
    expect(
      pair({ results_released_at: late }, { results_released_at: early }).results_released_at
    ).toBe(late);
  });

  test('finalized only when both are', () => {
    expect(pair({ is_scoring_finalized: true }, {}).is_scoring_finalized).toBeFalsy();
    expect(
      pair({ is_scoring_finalized: true }, { is_scoring_finalized: true }).is_scoring_finalized
    ).toBe(true);
  });

  test('earliest start, end only once both have ended', () => {
    const merged = pair(
      { actual_start_time: '2026-10-10T09:30:00Z', actual_end_time: '2026-10-10T10:00:00Z' },
      { actual_start_time: '2026-10-10T09:00:00Z' }
    );
    expect(merged.actual_start_time).toBe('2026-10-10T09:00:00Z');
    expect(merged.actual_end_time).toBeUndefined();

    const both = pair(
      { actual_end_time: '2026-10-10T10:00:00Z' },
      { actual_end_time: '2026-10-10T11:00:00Z' }
    );
    expect(both.actual_end_time).toBe('2026-10-10T11:00:00Z');
  });

  test('planned start is the earlier of the two; last result the later', () => {
    const merged = pair(
      { planned_start_time: '2026-10-10T09:30:00Z', last_result_at: '2026-10-10T10:00:00Z' },
      { planned_start_time: '2026-10-10T09:00:00Z', last_result_at: '2026-10-10T10:30:00Z' }
    );
    expect(merged.planned_start_time).toBe('2026-10-10T09:00:00Z');
    expect(merged.last_result_at).toBe('2026-10-10T10:30:00Z');
  });
});

describe('isCombinedEntry', () => {
  test('should identify combined entries', () => {
    const combined = createMockClass({ section: 'A & B', pairedClassId: '2' });
    expect(isCombinedEntry(combined)).toBe(true);
  });

  test('should return false for single sections', () => {
    const single = createMockClass({ section: 'A' });
    expect(isCombinedEntry(single)).toBe(false);
  });
});
