import { describe, expect, it } from 'vitest';
import { isConformationPuppyClass, isHeldEntry } from '../heldEntry';

const live = { entryStatus: 'confirmed' };

describe('isHeldEntry (MYK9-1162)', () => {
  it("answers from the server's flag, in either casing", () => {
    expect(isHeldEntry({ ...live, awaiting_registration_number: true })).toBe(true);
    expect(isHeldEntry({ ...live, awaitingRegistrationNumber: true })).toBe(true);
    expect(isHeldEntry({ ...live, awaitingRegistrationNumber: false })).toBe(false);
  });

  it('is not held when the row carries no flag: a class is never emptied on a guess', () => {
    expect(isHeldEntry(live)).toBe(false);
    expect(isHeldEntry({ ...live, awaiting_registration_number: null })).toBe(false);
  });

  it.each(['withdrawn', 'scratched', 'absent', 'moved', 'not_accepted'])(
    'is never held when the entry is %s, whatever the flag says',
    entryStatus => {
      expect(isHeldEntry({ entryStatus, awaiting_registration_number: true })).toBe(false);
    }
  );

  it('is not held when the entry is soft-deleted', () => {
    expect(
      isHeldEntry({ ...live, deletedAt: '2026-10-14T00:00:00Z', awaitingRegistrationNumber: true })
    ).toBe(false);
  });
});

describe('isConformationPuppyClass', () => {
  it('applies only when both the sport and the class prove it', () => {
    const puppy = {
      trialType: 'Conformation',
      className: 'Puppy 6-9 Months',
      element: 'Puppy',
      level: 'Puppy',
    };
    expect(isConformationPuppyClass(puppy)).toBe(true);
    expect(isConformationPuppyClass({ ...puppy, trialType: 'Scent Work' })).toBe(false);
    expect(isConformationPuppyClass({ ...puppy, trialType: null })).toBe(false);
    expect(
      isConformationPuppyClass({
        trialType: 'Conformation',
        className: 'Open Dog',
        element: null,
        level: null,
      })
    ).toBe(false);
  });
});
