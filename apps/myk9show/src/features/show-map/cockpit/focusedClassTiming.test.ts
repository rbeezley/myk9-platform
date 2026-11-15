import { describe, expect, it } from 'vitest';

import {
  actualTimingText,
  expectedStartValue,
  focusedClassSummaryParts,
} from './focusedClassTiming';

const TZ = 'America/Chicago';
const none = { evidence: 'unknown' as const, value: null };

describe('expectedStartValue', () => {
  it('prefers the revised time over the scheduled one', () => {
    const scheduledOnly = expectedStartValue(
      { scheduledStart: '09:00', revisedExpectedStart: null },
      TZ
    );
    const revised = expectedStartValue(
      // 15:30 UTC is 10:30 in Chicago in July.
      { scheduledStart: '09:00', revisedExpectedStart: '2026-07-20T15:30:00.000Z' },
      TZ
    );
    expect(scheduledOnly).not.toBe('');
    expect(revised).not.toBe('');
    expect(revised).not.toBe(scheduledOnly);
  });

  it('is empty when neither time is set', () => {
    expect(expectedStartValue({ scheduledStart: null, revisedExpectedStart: null }, TZ)).toBe('');
  });
});

describe('actualTimingText', () => {
  it('says Not started only for a class that has not started', () => {
    expect(actualTimingText({ actualStart: none, actualFinish: none }, 'not-started', TZ)).toBe(
      'Not started'
    );
    expect(actualTimingText({ actualStart: none, actualFinish: none }, 'in-progress', TZ)).toBe(
      'Start not recorded'
    );
  });

  it('names the start and the finish', () => {
    const text = actualTimingText(
      {
        actualStart: { evidence: 'recorded', value: '2026-07-20T14:42:00.000Z' },
        actualFinish: { evidence: 'recorded', value: '2026-07-20T16:05:00.000Z' },
      },
      'complete',
      TZ
    );
    expect(text).toMatch(/^Started 9:42\sAM · Finished 11:05\sAM$/);
  });
});

describe('focusedClassSummaryParts', () => {
  it('lists the facts, the expected start and a recorded timing', () => {
    expect(
      focusedClassSummaryParts({
        facts: ['8 entered', 'Judge Pat Donovan'],
        expectedStart: '9:00 AM',
        timing: 'Started 9:42 AM',
      })
    ).toEqual(['8 entered', 'Judge Pat Donovan', 'Expected 9:00 AM', 'Started 9:42 AM']);
  });

  it('says when no expected start is set and leaves Not started to the status badge', () => {
    expect(
      focusedClassSummaryParts({ facts: [], expectedStart: '', timing: 'Not started' })
    ).toEqual(['No expected start']);
  });

  it('keeps Start not recorded, which the badge does not say', () => {
    expect(
      focusedClassSummaryParts({ facts: [], expectedStart: '', timing: 'Start not recorded' })
    ).toEqual(['No expected start', 'Start not recorded']);
  });
});
