/**
 * Pins the manager path into the ringside entry chooser: a secretary's own
 * in-progress show must resolve as LIVE for every day of its run, not just its
 * first. `managerToday` is the only source of live shows for a manager, so a
 * show that slips out of the `today` bucket is neither auto-opened nor listed
 * (it is not in `upcoming` either) — the day-two disappearance of MYK9-306.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { addDays, format, subDays } from 'date-fns';
import { UserRole } from '@/types/auth-types';
import type { Show } from '@/types/show-types';
import { showFactory } from '@/test/utils/factories';

const judgeAssignments = { assignments: [] as unknown[], isLoading: false };
const banner = { items: [] as unknown[], isLoading: false };
const exhibitorUpcoming = {
  upcomingShows: [] as { showId: string; showName: string }[],
  isLoading: false,
};
let storeShows: Show[] = [];

vi.mock('@/hooks/queries/useJudgeAssignments', () => ({
  useJudgeAssignments: () => judgeAssignments,
}));
vi.mock('@/features/show-today/useShowTodayBanner', () => ({
  useShowTodayBanner: () => banner,
}));
vi.mock('./useExhibitorUpcomingShows', () => ({
  useExhibitorUpcomingShows: () => exhibitorUpcoming,
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: { shows: Show[]; isLoading: boolean }) => unknown) =>
    selector({ shows: storeShows, isLoading: false }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  // Site admin: account access to every show, so the test isolates the phase
  // bucketing rather than the scoped-role plumbing.
  useAuthContext: () => ({
    userWithRoles: { id: 'u1', scopes: [] },
    hasRole: (role: UserRole) => role === UserRole.SITE_ADMIN,
  }),
}));

import { useRingsideEntryShows } from './useRingsideEntryShows';

const toDateOnly = (date: Date) => format(date, 'yyyy-MM-dd');

describe('useRingsideEntryShows', () => {
  beforeEach(() => {
    storeShows = [];
    banner.items = [];
    exhibitorUpcoming.upcomingShows = [];
    exhibitorUpcoming.isLoading = false;
  });

  it('lists a manager multi-day in-progress show as live on its second day', () => {
    storeShows = [
      showFactory.build({
        id: 'weekend-trial',
        name: 'Weekend Trial',
        startDate: toDateOnly(subDays(new Date(), 1)),
        endDate: toDateOnly(addDays(new Date(), 1)),
        status: 'in_progress',
      }),
    ];

    const { result } = renderHook(() => useRingsideEntryShows());

    expect(result.current.liveShows).toEqual([
      { showId: 'weekend-trial', showName: 'Weekend Trial', phase: 'live' },
    ]);
    expect(result.current.upcomingShows).toHaveLength(0);
  });

  it('drops a manager show from live once its end date has passed', () => {
    storeShows = [
      showFactory.build({
        id: 'finished-trial',
        name: 'Finished Trial',
        startDate: toDateOnly(subDays(new Date(), 3)),
        endDate: toDateOnly(subDays(new Date(), 1)),
        status: 'in_progress',
      }),
    ];

    const { result } = renderHook(() => useRingsideEntryShows());

    expect(result.current.liveShows).toHaveLength(0);
    expect(result.current.upcomingShows).toHaveLength(0);
  });

  // The exhibitor half of the same chooser: entered in a show that has not
  // started yet, the exhibitor used to resolve to zero shows (the today-only
  // banner was their only source) and landed on the empty state, where the
  // passcode button was the sole remaining action.
  it("lists the exhibitor's entered upcoming show in the chooser", () => {
    exhibitorUpcoming.upcomingShows = [{ showId: 'entered-1', showName: 'Autumn Classic' }];

    const { result } = renderHook(() => useRingsideEntryShows());

    expect(result.current.liveShows).toHaveLength(0);
    expect(result.current.upcomingShows).toEqual([
      { showId: 'entered-1', showName: 'Autumn Classic', phase: 'upcoming' },
    ]);
  });

  it('keeps the chooser loading while the exhibitor entry lookup is in flight', () => {
    exhibitorUpcoming.isLoading = true;

    const { result } = renderHook(() => useRingsideEntryShows());

    expect(result.current.isLoading).toBe(true);
  });
});
