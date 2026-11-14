import { describe, expect, it } from 'vitest';
import type { ShowEntry } from '@/store/entry-store-types';
import { isAwaitingServerPlace, ownEntryQueueState } from './showEntryRunQueue';

function entry(overrides: Partial<ShowEntry> = {}, runOrder = 5): ShowEntry {
  return {
    id: 'e1',
    dogId: 'd1',
    classId: 'c1',
    showId: 's1',
    checkInStatus: 'checked-in',
    status: 'confirmed',
    registrationData: {
      submittedAt: '',
      handler: '',
      entryFee: 0,
      paymentStatus: 'paid',
      armband: '101',
      runOrder,
    },
    statusHistory: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as ShowEntry;
}

describe('ownEntryQueueState on a paper class (MYK9-1970)', () => {
  it('reads a waiting dog in a class the device holds as paper as the paper line, with no place', () => {
    expect(ownEntryQueueState(entry(), true)).toEqual({ kind: 'paper' });
  });

  it('keeps the waiting-unknown state for a phone-scored class', () => {
    expect(ownEntryQueueState(entry(), false)).toEqual({ kind: 'waiting-unknown' });
    expect(ownEntryQueueState(entry())).toEqual({ kind: 'waiting-unknown' });
  });

  it('says nothing before the secretary numbers the class, paper or not', () => {
    expect(ownEntryQueueState(entry({}, 0), true)).toBeNull();
  });

  it('keeps every other state its own fact on a paper class', () => {
    expect(ownEntryQueueState(entry({ checkInStatus: 'in-ring' }), true)).toEqual({
      kind: 'in-ring',
    });
    expect(ownEntryQueueState(entry({ status: 'withdrawn' }), true)).toEqual({
      kind: 'withdrawn',
    });
  });

  it('lets a paper or waiting-unknown state, and nothing else, take the server place', () => {
    expect(isAwaitingServerPlace({ kind: 'paper' })).toBe(true);
    expect(isAwaitingServerPlace({ kind: 'waiting-unknown' })).toBe(true);
    expect(isAwaitingServerPlace({ kind: 'in-ring' })).toBe(false);
    expect(isAwaitingServerPlace(null)).toBe(false);
  });
});
