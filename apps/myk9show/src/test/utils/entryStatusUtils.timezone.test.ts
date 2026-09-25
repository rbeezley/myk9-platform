/**
 * MYK9-714: Browse Shows judges entry status in the show's OWN zone.
 *
 * Signed-in visitors see store shows, which carry no `trials`, so every label
 * ("Closes Today!", "Entries Closed") used to be computed in the
 * America/New_York fallback. `submit_show_entries` accepts until midnight in
 * the show's first-trial zone, so near midnight a western show read "Entries
 * Closed" on Browse while the server still took entries.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEntryStatus } from '@/utils/entryStatusUtils';
import { withEntryWindowTimeZones } from '@/utils/entryWindowZones';
import { mapDatabaseToShow } from '@/services/mappers/showMappers';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/store/trial-store-types';

function showClosingOn(closeDate: string, overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-west',
    name: 'West Coast Scent Work',
    entryOpenDate: '2026-09-01',
    entryCloseDate: closeDate,
    startDate: '2026-10-24',
    endDate: '2026-10-25',
    ...overrides,
  } as Show;
}

describe('getEntryStatus in the show zone (MYK9-714)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a Central-time show at 23:30 CT on close day is still open', () => {
    // 2026-10-09 23:30 CDT = 2026-10-10 04:30Z = 00:30 EDT on the 10th.
    vi.setSystemTime(new Date('2026-10-10T04:30:00Z'));

    const status = getEntryStatus(
      showClosingOn('2026-10-09', { entryWindowTimeZone: 'America/Chicago' })
    );

    expect(status.status).toBe('closing_soon');
    expect(status.label).toBe('Closes Today!');
    expect(status.canEnter).toBe(true);
  });

  it('a Pacific-time show at 23:30 PT on close day is still open', () => {
    // 2026-10-09 23:30 PDT = 2026-10-10 06:30Z = 02:30 EDT on the 10th.
    vi.setSystemTime(new Date('2026-10-10T06:30:00Z'));

    const status = getEntryStatus(
      showClosingOn('2026-10-09', { entryWindowTimeZone: 'America/Los_Angeles' })
    );

    expect(status.label).toBe('Closes Today!');
  });

  it('the same Pacific show is closed once its own midnight passes', () => {
    // 2026-10-10 00:30 PDT.
    vi.setSystemTime(new Date('2026-10-10T07:30:00Z'));

    const status = getEntryStatus(
      showClosingOn('2026-10-09', { entryWindowTimeZone: 'America/Los_Angeles' })
    );

    expect(status.status).toBe('closed');
  });

  it('without a known zone, keeps the documented Eastern fallback', () => {
    vi.setSystemTime(new Date('2026-10-10T06:30:00Z'));

    expect(getEntryStatus(showClosingOn('2026-10-09')).status).toBe('closed');
  });
});

describe('Browse resolves the zone for both audiences (MYK9-714)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-10-09 23:30 PDT: still close day in the show zone, not in Eastern.
    vi.setSystemTime(new Date('2026-10-10T06:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function storeTrial(overrides: Partial<Trial>): Trial {
    return { id: 'trial-1', showId: 'show-west', trialDate: '2026-10-24', ...overrides } as Trial;
  }

  it('signed in: a store show takes its zone from its FIRST trial in the trial store', () => {
    const [show, other] = withEntryWindowTimeZones(
      [showClosingOn('2026-10-09'), showClosingOn('2026-10-09', { id: 'show-east' })],
      [
        storeTrial({ id: 'day-2', trialDate: '2026-10-25', timezone: 'America/New_York' }),
        storeTrial({ id: 'day-1', trialDate: '2026-10-24', timezone: 'America/Los_Angeles' }),
      ]
    );

    expect(show?.entryWindowTimeZone).toBe('America/Los_Angeles');
    expect(getEntryStatus(show as Show).label).toBe('Closes Today!');
    // No trial in the store: untouched, so the documented fallback still applies.
    expect(other?.entryWindowTimeZone).toBeUndefined();
    expect(getEntryStatus(other as Show).status).toBe('closed');
  });

  it('guest: the embedded trial timezone reaches the label through the mapper', () => {
    const show = mapDatabaseToShow({
      id: 'show-west',
      name: 'West Coast Scent Work',
      organization: 'AKC',
      entry_open_date: '2026-09-01',
      entry_close_date: '2026-10-09',
      start_date: '2026-10-24',
      end_date: '2026-10-25',
      trials: [
        {
          id: 'day-1',
          name: 'Day 1',
          date: '2026-10-24',
          trial_type: 'scent_work',
          timezone: 'America/Los_Angeles',
        },
      ],
    } as Parameters<typeof mapDatabaseToShow>[0]);

    expect(getEntryStatus(show, false, { hasEntryClassInventory: true }).label).toBe(
      'Closes Today!'
    );
  });
});
