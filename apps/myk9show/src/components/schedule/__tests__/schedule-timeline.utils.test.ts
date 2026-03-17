import { describe, expect, it } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';
import type { ClassStatusValue } from '@myk9/core';
import type {
  LevelDetail,
  TimelineClassRow,
  TrialTimelineClassRow,
} from '../schedule-timeline.types';
import {
  deriveElementStatus,
  formatLevelRange,
  groupByDay,
  groupByJudge,
} from '../schedule-timeline.utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLevelDetail(
  overrides: Partial<LevelDetail> & { level: string; status: ClassStatusValue }
): LevelDetail {
  return {
    classId: 'cls-1',
    entryCount: 0,
    ...overrides,
  };
}

function makeTimelineRow(overrides: Partial<TimelineClassRow>): TimelineClassRow {
  return {
    trialId: 'trial-1',
    trialDate: '2026-04-01',
    trialNumber: '1',
    trialPlannedStartTime: '08:00:00',
    classId: 'cls-1',
    className: 'Rally Novice',
    element: 'Rally',
    level: 'Novice',
    startTime: '08:00:00',
    status: 'Scheduled',
    totalEntriesCount: 5,
    ...overrides,
  };
}

function makeTrialRow(overrides: Partial<TrialTimelineClassRow>): TrialTimelineClassRow {
  return {
    classId: 'cls-1',
    className: 'Rally Novice',
    element: 'Rally',
    level: 'Novice',
    startTime: '08:00:00',
    status: 'Scheduled',
    totalEntriesCount: 5,
    judgePersonId: 'judge-1',
    judgeFirstName: 'Jane',
    judgeLastName: 'Doe',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deriveElementStatus
// ---------------------------------------------------------------------------

describe('deriveElementStatus', () => {
  it('returns Completed when all levels Completed', () => {
    const levels = [
      makeLevelDetail({ level: 'Novice', status: CLASS_STATUS.COMPLETED }),
      makeLevelDetail({ level: 'Advanced', status: CLASS_STATUS.COMPLETED }),
    ];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.COMPLETED);
  });

  it('returns In Progress when any level In Progress', () => {
    const levels = [
      makeLevelDetail({ level: 'Novice', status: CLASS_STATUS.IN_PROGRESS }),
      makeLevelDetail({ level: 'Advanced', status: CLASS_STATUS.SCHEDULED }),
    ];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.IN_PROGRESS);
  });

  it('returns Scheduled when all levels Scheduled', () => {
    const levels = [
      makeLevelDetail({ level: 'Novice', status: CLASS_STATUS.SCHEDULED }),
      makeLevelDetail({ level: 'Advanced', status: CLASS_STATUS.SCHEDULED }),
    ];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.SCHEDULED);
  });

  it('returns In Progress for mixed Completed + Scheduled', () => {
    const levels = [
      makeLevelDetail({ level: 'Novice', status: CLASS_STATUS.COMPLETED }),
      makeLevelDetail({ level: 'Advanced', status: CLASS_STATUS.SCHEDULED }),
    ];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.IN_PROGRESS);
  });

  it('returns Cancelled when all Cancelled', () => {
    const levels = [
      makeLevelDetail({ level: 'Novice', status: CLASS_STATUS.CANCELLED }),
      makeLevelDetail({ level: 'Advanced', status: CLASS_STATUS.CANCELLED }),
    ];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.CANCELLED);
  });

  it('ignores cancelled when deriving from remaining', () => {
    const levels = [
      makeLevelDetail({ level: 'Novice', status: CLASS_STATUS.COMPLETED }),
      makeLevelDetail({ level: 'Advanced', status: CLASS_STATUS.CANCELLED }),
    ];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.COMPLETED);
  });

  it('returns Scheduled for empty array', () => {
    expect(deriveElementStatus([])).toBe(CLASS_STATUS.SCHEDULED);
  });
});

// ---------------------------------------------------------------------------
// formatLevelRange
// ---------------------------------------------------------------------------

describe('formatLevelRange', () => {
  it('formats full range "Nov–Mst"', () => {
    expect(formatLevelRange(['Novice', 'Advanced', 'Open', 'Excellent', 'Utility', 'Master'])).toBe(
      'Nov–Mst'
    );
  });

  it('formats partial range "Adv–Exc"', () => {
    expect(formatLevelRange(['Advanced', 'Open', 'Excellent'])).toBe('Adv–Exc');
  });

  it('formats single level "Nov"', () => {
    expect(formatLevelRange(['Novice'])).toBe('Nov');
  });

  it('sorts by progression order', () => {
    expect(formatLevelRange(['Master', 'Novice'])).toBe('Nov–Mst');
  });

  it('handles Utility → "Util"', () => {
    expect(formatLevelRange(['Utility'])).toBe('Util');
  });

  it('returns empty string for empty array', () => {
    expect(formatLevelRange([])).toBe('');
  });

  it('passes unknown levels through as-is', () => {
    expect(formatLevelRange(['Custom'])).toBe('Custom');
  });
});

// ---------------------------------------------------------------------------
// groupByDay
// ---------------------------------------------------------------------------

describe('groupByDay', () => {
  it('groups rows into days and trials with elements', () => {
    const rows = [
      makeTimelineRow({ classId: 'cls-1', element: 'Rally', level: 'Novice' }),
      makeTimelineRow({ classId: 'cls-2', element: 'Rally', level: 'Advanced' }),
    ];
    const result = groupByDay(rows);

    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe('2026-04-01');
    expect(result[0]!.trials).toHaveLength(1);
    expect(result[0]!.trials[0]!.elements).toHaveLength(1);
    expect(result[0]!.trials[0]!.elements[0]!.element).toBe('Rally');
    expect(result[0]!.trials[0]!.elements[0]!.levels).toHaveLength(2);
  });

  it('separates different dates', () => {
    const rows = [
      makeTimelineRow({ trialDate: '2026-04-01' }),
      makeTimelineRow({ trialDate: '2026-04-02', trialId: 'trial-2' }),
    ];
    const result = groupByDay(rows);
    expect(result).toHaveLength(2);
    expect(result[0]!.date).toBe('2026-04-01');
    expect(result[1]!.date).toBe('2026-04-02');
  });

  it('separates different trials on same day', () => {
    const rows = [
      makeTimelineRow({ trialId: 'trial-1', trialNumber: '1' }),
      makeTimelineRow({ trialId: 'trial-2', trialNumber: '2' }),
    ];
    const result = groupByDay(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.trials).toHaveLength(2);
  });

  it('orders elements by earliest start time', () => {
    const rows = [
      makeTimelineRow({ element: 'Obedience', startTime: '10:00:00', classId: 'cls-2' }),
      makeTimelineRow({ element: 'Rally', startTime: '08:00:00', classId: 'cls-1' }),
    ];
    const result = groupByDay(rows);
    expect(result[0]!.trials[0]!.elements[0]!.element).toBe('Rally');
    expect(result[0]!.trials[0]!.elements[1]!.element).toBe('Obedience');
  });

  it('handles null element by using class name', () => {
    const rows = [makeTimelineRow({ element: null, className: 'Special Class', classId: 'cls-1' })];
    const result = groupByDay(rows);
    expect(result[0]!.trials[0]!.elements[0]!.element).toBe('Special Class');
  });

  it('shows null for null start time', () => {
    const rows = [makeTimelineRow({ startTime: null })];
    const result = groupByDay(rows);
    expect(result[0]!.trials[0]!.elements[0]!.startTime).toBeNull();
  });

  it('returns empty array for no rows', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// groupByJudge
// ---------------------------------------------------------------------------

describe('groupByJudge', () => {
  it('groups by judge with elements', () => {
    const rows = [
      makeTrialRow({
        classId: 'cls-1',
        element: 'Rally',
        level: 'Novice',
        judgePersonId: 'j1',
        judgeFirstName: 'Jane',
        judgeLastName: 'Doe',
      }),
      makeTrialRow({
        classId: 'cls-2',
        element: 'Rally',
        level: 'Advanced',
        judgePersonId: 'j1',
        judgeFirstName: 'Jane',
        judgeLastName: 'Doe',
      }),
    ];
    const result = groupByJudge(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.judgeName).toBe('Jane Doe');
    expect(result[0]!.judgeId).toBe('j1');
    expect(result[0]!.elements).toHaveLength(1);
    expect(result[0]!.elements[0]!.levels).toHaveLength(2);
  });

  it('groups unassigned under "Unassigned"', () => {
    const rows = [
      makeTrialRow({
        judgePersonId: null,
        judgeFirstName: null,
        judgeLastName: null,
      }),
    ];
    const result = groupByJudge(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.judgeName).toBe('Unassigned');
    expect(result[0]!.judgeId).toBeNull();
    expect(result[0]!.ringNumber).toBeNull();
  });

  it('returns empty array for no rows', () => {
    expect(groupByJudge([])).toEqual([]);
  });
});
