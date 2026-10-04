import { describe, expect, it } from 'vitest';
import type { EntrySubmissionOutcome } from '@/services/database/entries';
import {
  filterClassSelectionsToCreatedOutcomes,
  getCreatedOutcomeTotalFees,
  getEntrySubmissionDenialMessage,
  hasCreatedEntryOutcome,
  summarizeEntrySubmissionOutcomes,
} from './entrySubmissionOutcomes';

const outcomes: EntrySubmissionOutcome[] = [
  {
    dogId: 'dog-1',
    classId: 'class-created',
    outcome: 'created',
    entryId: 'entry-1',
    waitlistEntryId: null,
    feeCents: 2500,
    capacityOverride: false,
  },
  {
    dogId: 'dog-1',
    classId: 'class-waitlisted',
    outcome: 'waitlisted',
    entryId: null,
    waitlistEntryId: 'wait-1',
    feeCents: 0,
    capacityOverride: false,
  },
  {
    dogId: 'dog-2',
    classId: 'class-denied',
    outcome: 'denied',
    entryId: null,
    waitlistEntryId: null,
    feeCents: 0,
    capacityOverride: false,
  },
];

describe('entry submission outcome helpers', () => {
  it('uses created outcomes only for receipt classes and fees', () => {
    const selections = [
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        selectedClasses: [{ classId: 'class-created' }, { classId: 'class-waitlisted' }],
      },
      {
        dogId: 'dog-2',
        trialId: 'trial-1',
        selectedClasses: [{ classId: 'class-denied' }],
      },
    ];

    expect(filterClassSelectionsToCreatedOutcomes(selections, outcomes)).toEqual([
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        selectedClasses: [{ classId: 'class-created' }],
      },
    ]);
    expect(getCreatedOutcomeTotalFees(outcomes, 50)).toBe(25);
  });

  it('treats absent and empty outcomes as legacy created success', () => {
    expect(hasCreatedEntryOutcome(undefined)).toBe(true);
    expect(hasCreatedEntryOutcome([])).toBe(true);
    expect(getCreatedOutcomeTotalFees([], 50)).toBe(50);
  });

  it('summarizes each outcome kind once', () => {
    expect(summarizeEntrySubmissionOutcomes(outcomes)).toEqual({
      createdCount: 1,
      waitlistedCount: 1,
      deniedCount: 1,
      overrideCount: 0,
    });
  });

  it('names a withdrawn or pulled class instead of calling it full (MYK9-980)', () => {
    const denied = outcomes[2]!;
    expect(
      getEntrySubmissionDenialMessage({
        ...denied,
        denialReason: 'dog was withdrawn or pulled from this class',
      })
    ).toBe(
      'was withdrawn or pulled from this class, so it cannot be entered online again. The show secretary can add it.'
    );
    expect(
      getEntrySubmissionDenialMessage({
        ...denied,
        denialReason: 'dog already on this class wait list for a different exhibitor',
      })
    ).toBe('already has an active wait-list spot for another exhibitor.');
    expect(getEntrySubmissionDenialMessage({ ...denied, denialReason: null })).toBe(
      'could not be entered because the class is full.'
    );
  });
});
