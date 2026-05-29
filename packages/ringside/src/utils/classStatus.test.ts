/**
 * Tests for class-status detection + display utilities.
 *
 * Lifted from `apps/myk9q/src/utils/statusUtils.test.ts` during PR E1a,
 * specifically the `class status utilities` describe block. The
 * entry-related describes (`determineEntryStatus`, `entry status
 * display utilities`) remain in `apps/myk9q/src/utils/statusUtils.test.ts`
 * pending PR E2.
 */

import { describe, expect, test } from 'vitest';

import {
  getClassDisplayStatus,
  getClassStatusColor,
  getFormattedClassStatus,
  type ClassStatusInput,
} from './classStatus';

function makeClassEntry(overrides: Partial<ClassStatusInput> = {}): ClassStatusInput {
  return {
    id: '1',
    class_status: 'no-status',
    entry_count: 3,
    completed_count: 0,
    dogs: [],
    ...overrides,
  };
}

describe('class status utilities', () => {
  test('prioritizes finalized and manual class statuses', () => {
    expect(getClassDisplayStatus(makeClassEntry({ is_scoring_finalized: true }))).toBe('completed');
    expect(getClassDisplayStatus(makeClassEntry({ class_status: 'completed' }))).toBe('completed');
    expect(getClassDisplayStatus(makeClassEntry({ class_status: 'in_progress' }))).toBe(
      'in-progress'
    );
  });

  test('detects progress only for no-status classes', () => {
    expect(
      getClassDisplayStatus(
        makeClassEntry({
          completed_count: 3,
          entry_count: 3,
        })
      )
    ).toBe('completed');
    expect(
      getClassDisplayStatus(
        makeClassEntry({
          dogs: [{ in_ring: true }],
        })
      )
    ).toBe('in-progress');
    expect(getClassDisplayStatus(makeClassEntry({ completed_count: 1 }))).toBe('in-progress');
  });

  test('keeps manual setup status from being overridden by progress counts', () => {
    expect(
      getClassDisplayStatus(makeClassEntry({ class_status: 'setup', completed_count: 1 }))
    ).toBe('not-started');
  });

  test('maps class statuses to colors with smart fallbacks', () => {
    // completed_count === entry_count would normally return 'completed'; offline-scoring wins.
    expect(getClassStatusColor('offline-scoring', makeClassEntry({ completed_count: 3 }))).toBe(
      'offline-scoring'
    );
    expect(getClassStatusColor('setup')).toBe('setup');
    expect(getClassStatusColor('briefing')).toBe('briefing');
    expect(getClassStatusColor('break')).toBe('break');
    expect(getClassStatusColor('start_time')).toBe('start-time');
    expect(getClassStatusColor('completed')).toBe('completed');
    expect(
      getClassStatusColor(
        'no-status',
        makeClassEntry({
          completed_count: 3,
          entry_count: 3,
        })
      )
    ).toBe('completed');
    expect(getClassStatusColor('no-status', makeClassEntry({ dogs: [{ in_ring: true }] }))).toBe(
      'in-progress'
    );
  });

  test('formats class status labels and times', () => {
    expect(getFormattedClassStatus(makeClassEntry({ class_status: 'offline-scoring' }))).toEqual({
      label: 'Offline Scoring',
      time: null,
    });
    expect(
      getFormattedClassStatus(makeClassEntry({ class_status: 'briefing', briefing_time: '8:45' }))
    ).toEqual({
      label: 'Briefing at',
      time: '8:45',
    });
    expect(
      getFormattedClassStatus(makeClassEntry({ class_status: 'break', break_until: '12:30' }))
    ).toEqual({
      label: 'Break until',
      time: '12:30',
    });
    expect(
      getFormattedClassStatus(makeClassEntry({ class_status: 'start_time', start_time: '9:00' }))
    ).toEqual({
      label: 'Start at',
      time: '9:00',
    });
    expect(getFormattedClassStatus(makeClassEntry({ class_status: 'setup' }))).toEqual({
      label: 'Setup',
      time: null,
    });
    expect(getFormattedClassStatus(makeClassEntry())).toEqual({
      label: 'No Status',
      time: null,
    });
  });
});
