/**
 * MYK9-1940: the exhibitor's rows and the judge's list share one precedence. A lifecycle status
 * (moved, absent, withdrawn) beats a check-in `pulled`, the later and more definite fact.
 */
import { describe, expect, it } from 'vitest';
import { formatRunQueueState } from '@myk9/ringside/run-queue';
import type { ShowEntry } from '@/store/entry-store-types';
import { dogsAheadInClass, ownEntryQueueState } from './showEntryRunQueue';

const wordFor = (status: string, checkInStatus: string) => {
  const entry = { id: 'e1', status, checkInStatus } as unknown as ShowEntry;
  const state = ownEntryQueueState(entry);
  return state ? formatRunQueueState(state) : null;
};

describe('ownEntryQueueState precedence', () => {
  it.each([
    ['moved', 'pulled', 'Moved'],
    ['absent', 'pulled', 'Absent'],
    ['withdrawn', 'pulled', 'Withdrawn'],
    ['moved', 'in-ring', 'Moved'],
    ['scratched', 'checked-in', 'Pulled'],
    ['confirmed', 'pulled', 'Pulled'],
  ])('lifecycle %s with check-in %s reads %s', (status, checkIn, word) => {
    expect(wordFor(status, checkIn)).toBe(word);
  });
});

// MYK9-2391: an entry awaiting approval has no place in line, for itself or for the dogs behind it.
describe('a Pending entry in the class queue', () => {
  const entry = (id: string, status: string, runOrder: number) =>
    ({
      id,
      status,
      checkInStatus: 'no-status',
      registrationData: { armband: String(runOrder), runOrder },
    }) as unknown as ShowEntry;

  it.each(['submitted', 'pending', 'draft', 'paid', 'promotion-expired'])(
    'is not counted ahead of a confirmed dog and names no state of its own (%s)',
    status => {
      const entries = [
        entry('p', status, 1),
        entry('a', 'confirmed', 2),
        entry('me', 'confirmed', 3),
      ];
      expect(dogsAheadInClass(entries, 'me')).toBe(1);
      expect(dogsAheadInClass(entries, 'p')).toBeNull();
      expect(ownEntryQueueState(entries[0]!)).toBeNull();
    }
  );
});
