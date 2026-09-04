import { describe, it, expect } from 'vitest';
import { resolveRingsideEntry, type ResolveRingsideEntryInput } from './ringsideEntryResolver';

const TODAY = '2026-06-23';

function input(overrides: Partial<ResolveRingsideEntryInput> = {}): ResolveRingsideEntryInput {
  return {
    judgeClasses: [],
    exhibitorToday: [],
    exhibitorUpcoming: [],
    managerToday: [],
    managerUpcoming: [],
    todayISO: TODAY,
    ...overrides,
  };
}

describe('resolveRingsideEntry', () => {
  it('returns nothing when all sources are empty', () => {
    const { liveShows, upcomingShows } = resolveRingsideEntry(input());
    expect(liveShows).toEqual([]);
    expect(upcomingShows).toEqual([]);
  });

  it('treats an in-progress judge class as live even if its trial date is not today', () => {
    const { liveShows } = resolveRingsideEntry(
      input({ judgeClasses: [{ showId: 's1', status: 'in-progress', trialDate: '2026-06-20' }] })
    );
    expect(liveShows).toEqual([{ showId: 's1', showName: null, phase: 'live' }]);
  });

  it("treats a judge class whose trial date is today as live", () => {
    const { liveShows } = resolveRingsideEntry(
      input({ judgeClasses: [{ showId: 's1', status: 'pending', trialDate: TODAY }] })
    );
    expect(liveShows.map(s => s.showId)).toEqual(['s1']);
  });

  it('includes the exhibitor today show as live with its name', () => {
    const { liveShows } = resolveRingsideEntry(
      input({ exhibitorToday: [{ showId: 's2', showName: 'Heartland Classic' }] })
    );
    expect(liveShows).toEqual([{ showId: 's2', showName: 'Heartland Classic', phase: 'live' }]);
  });

  it('dedups the same show across sources and keeps the known name', () => {
    const { liveShows } = resolveRingsideEntry(
      input({
        judgeClasses: [{ showId: 's1', status: 'in-progress', trialDate: TODAY }],
        managerToday: [{ showId: 's1', showName: 'Spring Trial' }],
      })
    );
    expect(liveShows).toEqual([{ showId: 's1', showName: 'Spring Trial', phase: 'live' }]);
  });

  it('splits today vs future judge assignments into live and upcoming', () => {
    const { liveShows, upcomingShows } = resolveRingsideEntry(
      input({
        judgeClasses: [
          { showId: 'live1', status: 'pending', trialDate: TODAY },
          { showId: 'fut1', status: 'pending', trialDate: '2026-07-01' },
        ],
      })
    );
    expect(liveShows.map(s => s.showId)).toEqual(['live1']);
    expect(upcomingShows.map(s => s.showId)).toEqual(['fut1']);
  });

  it('does not list an upcoming show that is also live', () => {
    const { liveShows, upcomingShows } = resolveRingsideEntry(
      input({
        managerToday: [{ showId: 's1', showName: 'Dual Show' }],
        managerUpcoming: [{ showId: 's1', showName: 'Dual Show' }],
      })
    );
    expect(liveShows.map(s => s.showId)).toEqual(['s1']);
    expect(upcomingShows).toEqual([]);
  });

  it('excludes completed future judge assignments from upcoming', () => {
    const { upcomingShows } = resolveRingsideEntry(
      input({ judgeClasses: [{ showId: 's1', status: 'completed', trialDate: '2026-07-01' }] })
    );
    expect(upcomingShows).toEqual([]);
  });

  it('orders named shows alphabetically before nameless ones', () => {
    const { liveShows } = resolveRingsideEntry(
      input({
        judgeClasses: [{ showId: 'zzz', status: 'in-progress', trialDate: TODAY }],
        managerToday: [
          { showId: 'b', showName: 'Bravo Show' },
          { showId: 'a', showName: 'Alpha Show' },
        ],
      })
    );
    expect(liveShows.map(s => s.showName)).toEqual(['Alpha Show', 'Bravo Show', null]);
  });

  // Ringside's exhibitor sources were TODAY-only, so an exhibitor entered in a
  // show running next weekend resolved to zero shows and the entry point fell
  // through to its empty state — where the passcode button was the only action.
  it('lists an exhibitor upcoming show under upcoming, with its name', () => {
    const { liveShows, upcomingShows } = resolveRingsideEntry(
      input({ exhibitorUpcoming: [{ showId: 's5', showName: 'Autumn Classic' }] })
    );
    expect(liveShows).toEqual([]);
    expect(upcomingShows).toEqual([{ showId: 's5', showName: 'Autumn Classic', phase: 'upcoming' }]);
  });

  it('does not list an exhibitor upcoming show that is already live today', () => {
    const { liveShows, upcomingShows } = resolveRingsideEntry(
      input({
        exhibitorToday: [{ showId: 's5', showName: 'Autumn Classic' }],
        exhibitorUpcoming: [{ showId: 's5', showName: 'Autumn Classic' }],
      })
    );
    expect(liveShows.map(s => s.showId)).toEqual(['s5']);
    expect(upcomingShows).toEqual([]);
  });

  it('merges an exhibitor and manager upcoming reference to the same show once', () => {
    const { upcomingShows } = resolveRingsideEntry(
      input({
        exhibitorUpcoming: [{ showId: 's6', showName: 'Shared Show' }],
        managerUpcoming: [{ showId: 's6', showName: 'Shared Show' }],
      })
    );
    expect(upcomingShows).toEqual([{ showId: 's6', showName: 'Shared Show', phase: 'upcoming' }]);
  });
});
