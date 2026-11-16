// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildSheetDescriptorFromRows,
  type PaperworkClassRow,
  type PaperworkEntryRow,
} from './rowDescriptors.ts';
import { compactFingerprint } from './paperworkFingerprint.ts';

const classes: PaperworkClassRow[] = [
  {
    id: 'class-1',
    trial_id: 'trial-1',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'in_progress',
    judge_name: 'Judge One',
    time_limit_seconds: '180.5',
    num_areas: 1,
    num_hides: 2,
  },
  { id: 'class-2', trial_id: 'trial-2', element: 'Interior', level: 'Excellent', section: null },
];
const entries: PaperworkEntryRow[] = [
  {
    id: 'e1',
    class_id: 'class-1',
    dog_id: 'd1',
    armband: '101',
    run_order: 2,
    check_in_status: 'checked-in',
    entry_status: 'confirmed',
  },
  {
    id: 'e2',
    class_id: 'class-1',
    dog_id: 'd2',
    armband: 102,
    run_order: 1,
    check_in_status: null,
    entry_status: 'withdrawn',
  },
  {
    id: 'e3',
    class_id: 'class-2',
    dog_id: 'd3',
    armband: null,
    run_order: null,
    check_in_status: 'no-show',
  },
];
const scope = { kind: 'class', showId: 's1', trialId: 'trial-1', classId: 'class-1' } as const;

describe('compactFingerprint', () => {
  it('is key-order independent and prefixed', () => {
    expect(compactFingerprint({ a: 1, b: 2 })).toBe(compactFingerprint({ b: 2, a: 1 }));
    expect(compactFingerprint('x')).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });
});

describe('buildSheetDescriptorFromRows', () => {
  it('keys the check-in sheet by entry and ignores the class', () => {
    const d = buildSheetDescriptorFromRows({ reportId: 'check-in-sheet', scope, classes, entries });
    expect(Object.keys(d?.coverage.subjectFingerprints ?? {})).toEqual(['entry:e1', 'entry:e2']);
  });

  it('adds class subjects to the scoresheet, without the class status', () => {
    const a = buildSheetDescriptorFromRows({ reportId: 'scoresheet', scope, classes, entries });
    const b = buildSheetDescriptorFromRows({
      reportId: 'scoresheet',
      scope,
      classes: [{ ...classes[0]!, status: 'completed' }, classes[1]!],
      entries,
    });
    expect(Object.keys(a?.coverage.subjectFingerprints ?? {})).toContain('class:class-1');
    expect(b?.fingerprint).toBe(a?.fingerprint);
  });

  it('changes when a withdrawal or run order changes', () => {
    const base = buildSheetDescriptorFromRows({
      reportId: 'check-in-sheet',
      scope,
      classes,
      entries,
    });
    const moved = buildSheetDescriptorFromRows({
      reportId: 'check-in-sheet',
      scope,
      classes,
      entries: [{ ...entries[0]!, run_order: 3 }, entries[1]!, entries[2]!],
    });
    expect(moved?.fingerprint).not.toBe(base?.fingerprint);
  });

  it('scopes a trial to its classes and returns null for empty or other reports', () => {
    const trial = { kind: 'trial', showId: 's1', trialId: 'trial-2' } as const;
    const d = buildSheetDescriptorFromRows({
      reportId: 'check-in-sheet',
      scope: trial,
      classes,
      entries,
    });
    expect(Object.keys(d?.coverage.subjectFingerprints ?? {})).toEqual(['entry:e3']);
    expect(
      buildSheetDescriptorFromRows({ reportId: 'check-in-sheet', scope, classes, entries: [] })
    ).toBeNull();
    expect(
      buildSheetDescriptorFromRows({ reportId: 'results-sheet', scope, classes, entries })
    ).toBeNull();
  });
});
