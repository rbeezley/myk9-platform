import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedShowsTable, type ReplicatedShow } from './ReplicatedShowsTable';

/**
 * MYK9-1198: the offline upcoming-shows read compared a DATE through `new Date('YYYY-MM-DD')`
 * (UTC midnight) against now, so a show starting today never counted as upcoming. It now
 * compares calendar days on the device, like the PostgREST read.
 */
describe('ReplicatedShowsTable.getUpcomingShows (MYK9-1198)', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Chicago';
    vi.useFakeTimers({ toFake: ['Date'] });
    // 19:00 on Nov 9 in Chicago, already Nov 10 in UTC.
    vi.setSystemTime(new Date('2026-11-10T01:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("keeps a show starting on this device's today and drops yesterday's", async () => {
    const table = new ReplicatedShowsTable();
    const show = (id: string, startDate: string) => ({ id, startDate }) as ReplicatedShow;
    vi.spyOn(
      table as unknown as { getAllOrThrow(): Promise<ReplicatedShow[]> },
      'getAllOrThrow'
    ).mockResolvedValue([
      show('tomorrow', '2026-11-10'),
      show('yesterday', '2026-11-08'),
      show('today', '2026-11-09'),
    ]);

    const upcoming = await table.getUpcomingShows();

    expect(upcoming.map(s => s.id)).toEqual(['today', 'tomorrow']);
  });
});
