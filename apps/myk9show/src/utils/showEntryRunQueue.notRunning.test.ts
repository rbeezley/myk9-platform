/**
 * MYK9-1940: the exhibitor's rows and the judge's list share one precedence. A lifecycle status
 * (moved, absent, withdrawn) beats a check-in `pulled`, the later and more definite fact.
 */
import { describe, expect, it } from 'vitest';
import { formatRunQueueState } from '@myk9/ringside/run-queue';
import type { ShowEntry } from '@/store/entry-store-types';
import { ownEntryQueueState } from './showEntryRunQueue';

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
