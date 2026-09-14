import { describe, it, expect } from 'vitest';
import { buildFullChipReason } from '../ClassSelectionStep.fullReason';

describe('revB scratch: same element+level, different name (MYK9-489 scenario)', () => {
  it('recommends a Preliminary class as an alternative to a non-Preliminary class of the same element+level', () => {
    const availability = [
      {
        classId: 'advanced-main',
        element: 'Interior',
        level: 'Advanced',
        trialId: 'trial-sat',
        trialDate: '2026-10-24',
        entryLimit: 5,
        currentEntries: 5,
        isFull: true,
        allowsWaitlist: false,
        judgeDayFull: false,
      },
      {
        classId: 'advanced-preliminary',
        element: 'Interior',
        level: 'Advanced', // same level column value, distinguished only by class NAME
        trialId: 'trial-sun',
        trialDate: '2026-10-25',
        entryLimit: 5,
        currentEntries: 1,
        isFull: false,
        allowsWaitlist: false,
        judgeDayFull: false,
      },
    ];
    const reason = buildFullChipReason({ classId: 'advanced-main', availability });
    console.log('REASON:', reason);
    expect(reason).toContain('space');
  });
});
