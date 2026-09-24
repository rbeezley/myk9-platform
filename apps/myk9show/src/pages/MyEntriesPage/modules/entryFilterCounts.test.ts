/**
 * MYK9-657 — the When and Status chip rows narrow each other, and now say so.
 *
 * Unit coverage on the COMPOSED count derivation: each axis's counts are
 * scoped to the other axis's selection, so the interesting cases are the
 * pairs, not either axis alone.
 */
import { describe, it, expect } from 'vitest';
import { EntryStatus } from '@/types/show-registration-types';
import { day, makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import {
  deriveStatusCounts,
  deriveTabCounts,
  describeFilterScope,
  statusChipCountText,
} from './entryFilterCounts';

const NO_POSITIONS = {
  activePositionCount: 0,
  displayedPositionCount: 0,
  isLoadingPositions: false,
  isScoped: false,
};

/** One accepted order at a show that ended, one pending order still ahead. */
function entries() {
  return toOrders([
    makeRow({
      id: 'past-accepted',
      registrationId: 'r-past',
      showId: 'show-past',
      showName: 'Summer Classic',
      showDate: day('2026-08-01'),
      showEndDate: day('2026-08-02'),
      classes: [makeClass({ id: 'c-past', trialDate: day('2026-08-01') })],
    }),
    makeRow({
      id: 'next-pending',
      registrationId: 'r-next',
      showId: 'show-next',
      showName: 'Winter Classic',
      showDate: day('2026-12-05'),
      showEndDate: day('2026-12-06'),
      entryStatus: EntryStatus.PENDING,
      classes: [
        makeClass({
          id: 'c-next',
          entryStatus: EntryStatus.PENDING,
          entryStatusKind: 'pending',
          trialDate: day('2026-12-05'),
        }),
      ],
    }),
  ]);
}

describe('deriveStatusCounts — Status counts scoped to the When choice', () => {
  it('counts every status across all shows under When: All', () => {
    const { counts } = deriveStatusCounts(entries(), 'all', 'any', NOW, NO_POSITIONS);
    expect(counts).toEqual({ any: 2, pending: 1, accepted: 1, waitlist: 0 });
  });

  it('narrows to Completed: the pending entry drops to 0 there', () => {
    const { counts } = deriveStatusCounts(entries(), 'completed', 'any', NOW, NO_POSITIONS);
    expect(counts).toEqual({ any: 1, pending: 0, accepted: 1, waitlist: 0 });
  });

  it('narrows to Upcoming: the accepted past entry drops to 0 there', () => {
    const { counts } = deriveStatusCounts(entries(), 'upcoming', 'any', NOW, NO_POSITIONS);
    expect(counts).toEqual({ any: 1, pending: 1, accepted: 0, waitlist: 0 });
  });

  it('adds held wait-list positions to Waitlist and Any outside Completed', () => {
    const positions = { ...NO_POSITIONS, activePositionCount: 2, displayedPositionCount: 2 };
    expect(deriveStatusCounts(entries(), 'upcoming', 'any', NOW, positions).counts).toEqual({
      any: 3,
      pending: 1,
      accepted: 0,
      waitlist: 2,
    });
    expect(deriveStatusCounts(entries(), 'completed', 'any', NOW, positions).counts.waitlist).toBe(
      0
    );
  });
});

describe('deriveTabCounts — When counts scoped to the Status choice', () => {
  it('partitions All into Upcoming + Completed under Any status', () => {
    expect(deriveTabCounts(entries(), 'any', NOW, 0)).toEqual({
      all: 2,
      upcoming: 1,
      completed: 1,
    });
  });

  it('narrows to Pending: Completed reads 0 though a completed show exists', () => {
    expect(deriveTabCounts(entries(), 'pending', NOW, 0)).toEqual({
      all: 1,
      upcoming: 1,
      completed: 0,
    });
  });
});

describe('statusChipCountText — a narrowed 0 is not "none at all"', () => {
  it('says where the 0 is when the exhibitor has some in another window', () => {
    expect(statusChipCountText('pending', 0, 1, 'completed')).toBe('0 in Completed');
  });

  it('stays a bare 0 when there are none anywhere', () => {
    expect(statusChipCountText('pending', 0, 0, 'completed')).toBe('0');
  });

  it('stays a bare number under When: All, and for any non-zero count', () => {
    expect(statusChipCountText('pending', 0, 0, 'all')).toBe('0');
    expect(statusChipCountText('accepted', 1, 1, 'completed')).toBe('1');
  });
});

describe('describeFilterScope — the relationship, stated on screen', () => {
  it('says nothing when neither row narrows the other', () => {
    expect(describeFilterScope('all', 'any')).toBeNull();
  });

  it('names the When window the Status counts are scoped to', () => {
    expect(describeFilterScope('completed', 'any')).toBe(
      'Status counts are for completed shows only.'
    );
  });

  it('names the Status the When counts are scoped to', () => {
    expect(describeFilterScope('all', 'pending')).toBe('When counts are for pending entries only.');
  });

  it('names both when both narrow', () => {
    expect(describeFilterScope('upcoming', 'accepted')).toBe(
      'Status counts are for upcoming shows only. When counts are for accepted entries only.'
    );
  });
});
