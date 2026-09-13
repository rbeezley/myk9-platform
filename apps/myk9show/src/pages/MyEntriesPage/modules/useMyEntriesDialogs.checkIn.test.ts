/**
 * The day-gated batch check-in's loop semantics (MYK9-482, task 3.2).
 *
 * INTENT (design D7): this is a sequential LOOP over the same
 * `updateEntryCheckIn` the single-class dialog calls — never a bulk RPC. What
 * is asserted here is exactly what that buys: one call per class, in class
 * order, each with the literal `'checked-in'` status, and a failure that STOPS
 * the loop while leaving the writes already made in place. A `Promise.all`, a
 * different status string, or a swallowed rejection each break one of those
 * and nothing else in the suite would see it.
 *
 * Which classes reach this function is a separate question, derived by
 * `deriveDayCheckInTargets` and asserted through the rendered list in
 * `MyShowsList.test.tsx`.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { heartlandRows, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { groupEntriesByShow, type MyShowClass, type MyShowDog } from './groupEntriesByShow';
import { deriveDayCheckInTargets } from './dayCheckIn';
import { indexOrdersById } from './groupEntriesByShow';
import { useMyEntriesDialogs } from './useMyEntriesDialogs';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

/** The Heartland show group every test in this file reckons against. */
function heartlandGroup() {
  const group = groupEntriesByShow(toOrders(heartlandRows()))[0];
  const dog = (name: string): MyShowDog => {
    const found = group.dogs.find(candidate => candidate.dogName === name);
    if (!found) throw new Error(`no dog ${name}`);
    return found;
  };
  return { group, dog };
}

function setup(updateEntryCheckIn: (...args: never[]) => Promise<void>) {
  const refreshEntries = vi.fn(() => Promise.resolve());
  return renderHook(() =>
    useMyEntriesDialogs({
      updateEntryCheckIn: updateEntryCheckIn as unknown as Parameters<
        typeof useMyEntriesDialogs
      >[0]['updateEntryCheckIn'],
      refreshEntries,
    })
  );
}

describe('checkInClassesForDay — one write per class, sequentially', () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes 'checked-in' once per class, in class order", async () => {
    const { dog } = heartlandGroup();
    const scout = dog('Scout');
    // Two classes on the same Saturday, so the day button covers both.
    const saturday: MyShowClass[] = [
      scout.classes[0],
      { ...scout.classes[1], id: 'c-scout-1b', trialDate: scout.classes[0].trialDate },
    ];
    const updateEntryCheckIn = vi.fn(() => Promise.resolve());
    const { result } = setup(updateEntryCheckIn);

    await act(() => result.current.checkInClassesForDay(scout, saturday));

    expect(updateEntryCheckIn).toHaveBeenCalledTimes(2);
    expect(updateEntryCheckIn).toHaveBeenNthCalledWith(
      1,
      saturday[0].orderId,
      'c-scout-1',
      'checked-in'
    );
    expect(updateEntryCheckIn).toHaveBeenNthCalledWith(
      2,
      saturday[1].orderId,
      'c-scout-1b',
      'checked-in'
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('checks in one class from a row link', async () => {
    const { dog } = heartlandGroup();
    const scout = dog('Scout');
    const updateEntryCheckIn = vi.fn(() => Promise.resolve());
    const { result } = setup(updateEntryCheckIn);

    await act(() => result.current.checkInClassesForDay(scout, [scout.classes[0]]));

    expect(updateEntryCheckIn).toHaveBeenCalledTimes(1);
    expect(updateEntryCheckIn).toHaveBeenCalledWith(
      scout.classes[0].orderId,
      'c-scout-1',
      'checked-in'
    );
  });

  it('stops at the first failure and leaves the earlier writes made', async () => {
    const { dog } = heartlandGroup();
    const scout = dog('Scout');
    const three: MyShowClass[] = [
      scout.classes[0],
      { ...scout.classes[0], id: 'boom' },
      { ...scout.classes[0], id: 'never' },
    ];
    const updateEntryCheckIn = vi.fn((_entryId: string, classId: string) =>
      classId === 'boom' ? Promise.reject(new Error('offline')) : Promise.resolve()
    );
    const { result } = setup(updateEntryCheckIn);

    await act(() => result.current.checkInClassesForDay(scout, three));

    // Two attempts: the one that succeeded and the one that threw. The third
    // is never reached — a `Promise.all` would have issued it anyway.
    expect(updateEntryCheckIn).toHaveBeenCalledTimes(2);
    expect(updateEntryCheckIn.mock.calls.map(call => call[1])).toEqual(['c-scout-1', 'boom']);
    expect(toast.error).toHaveBeenCalledWith('We could not check Scout in. Please try again.');
  });
});

describe('deriveDayCheckInTargets — what the day button actually writes', () => {
  it("takes only today's untouched, self-check-in-enabled classes", () => {
    const { group, dog } = heartlandGroup();
    const context = {
      now: NOW,
      ordersById: indexOrdersById(group),
      selfCheckinByClassId: undefined,
      isPastShow: false,
    };

    // Scout: Saturday + Sunday. Only Saturday's class is a target.
    expect(deriveDayCheckInTargets(dog('Scout'), context).classes.map(cls => cls.id)).toEqual([
      'c-scout-1',
    ]);
    // Willow: Saturday's class is already at the gate, so nothing is offered.
    expect(deriveDayCheckInTargets(dog('Willow'), context).classes).toEqual([]);
  });
});
