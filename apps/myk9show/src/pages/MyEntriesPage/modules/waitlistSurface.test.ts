import { describe, it, expect } from 'vitest';
import { resolveWaitlistSurface, type WaitlistSurfaceInput } from './waitlistSurface';

/**
 * MYK9-417's reproduction, as data: one `waitlist_entries` row, and NO entry
 * whose own status is waitlisted. Every field the resolver reads is named here
 * so each test states only the one thing it varies.
 */
function surface(overrides: Partial<WaitlistSurfaceInput> = {}) {
  return resolveWaitlistSurface({
    waitlistEntryCount: 0,
    activePositionCount: 1,
    displayedPositionCount: 1,
    isLoadingPositions: false,
    selectedTab: 'all',
    selectedStatus: 'any',
    isScoped: false,
    ...overrides,
  });
}

describe('resolveWaitlistSurface', () => {
  it('counts a waitlist_entries row the entries table cannot see', () => {
    // The bug: the chip read 0 while "My Wait List Positions #1" sat below it.
    expect(surface().chipCount).toBe(1);
  });

  it('adds the two sources rather than picking one', () => {
    expect(
      surface({ waitlistEntryCount: 2, activePositionCount: 3, displayedPositionCount: 3 })
        .chipCount
    ).toBe(5);
  });

  it('shows the positions section under the Waitlist filter', () => {
    const result = surface({ selectedStatus: 'waitlist' });
    expect(result.showPositions).toBe(true);
    // ...and therefore never the "Nothing to do here right now" copy.
    expect(result.allowEmptyState).toBe(false);
  });

  it('allows the empty state only when both sources are genuinely empty', () => {
    const result = surface({
      selectedStatus: 'waitlist',
      activePositionCount: 0,
      displayedPositionCount: 0,
    });
    expect(result.chipCount).toBe(0);
    expect(result.showPositions).toBe(false);
    expect(result.allowEmptyState).toBe(true);
  });

  it('keeps the section up while the positions query is still in flight', () => {
    // A settled zero and an unsettled unknown are different states; suppressing
    // the section on the unknown one would flash "nothing waitlisted" and then
    // contradict itself.
    const result = surface({
      activePositionCount: 0,
      displayedPositionCount: 0,
      isLoadingPositions: true,
    });
    expect(result.showPositions).toBe(true);
    expect(result.allowEmptyState).toBe(false);
  });

  it('hides positions behind a status filter that excludes them', () => {
    for (const selectedStatus of ['pending', 'accepted'] as const) {
      const result = surface({ selectedStatus });
      expect(result.showPositions).toBe(false);
      // The Pending/Accepted empty states are still the right copy here.
      expect(result.allowEmptyState).toBe(true);
    }
  });

  it('keeps a waiting position out of Completed, count included', () => {
    // A queue for a class nobody has run is not a finished show, and a chip
    // must count what clicking it will show.
    const result = surface({ selectedTab: 'completed', waitlistEntryCount: 1 });
    expect(result.chipCount).toBe(1);
    expect(result.showPositions).toBe(false);
  });

  it('explains a deep-linked dead offer without counting it as a position', () => {
    // `?waitlistOffer=` pulls an expired/declined row into the DISPLAY list so
    // the section can say what happened. Counting it on the chip would tell the
    // exhibitor they hold a position they have just lost.
    const result = surface({
      selectedStatus: 'waitlist',
      activePositionCount: 0,
      displayedPositionCount: 1,
    });

    expect(result.chipCount).toBe(0);
    expect(result.showPositions).toBe(true);
    // And the section's explanation must not sit under "Nothing to do here".
    expect(result.allowEmptyState).toBe(false);
  });

  it('leaves positions out of a My Payments receipt scope', () => {
    // `?showId=&entryIds=` names entry rows. A position is not one of them and
    // carries no show id here, so counting it would widen a list the scope
    // banner has just promised is narrowed.
    const result = surface({ isScoped: true });
    expect(result.chipCount).toBe(0);
    expect(result.showPositions).toBe(false);
  });
});
