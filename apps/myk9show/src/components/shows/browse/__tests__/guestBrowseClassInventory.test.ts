/**
 * MYK9-756: a signed-out visitor's Browse Shows list comes from
 * `getPublicShows`, whose trials embed deliberately carries no classes (they
 * dominate the payload). The show mapper must read that as "classes not
 * fetched", not "this trial has no classes", or `getEntryStatus` labels every
 * open show "Classes Not Ready" to a guest.
 *
 * Runs the guest path `useBrowseShowsData` runs: the real PostgREST read (its
 * select string and the row shape PostgREST returns for it), the real mapper,
 * and the real label function.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicShows } from '@/services/database/shows';
import { mapDatabaseShowsArray } from '@/services/mappers/showMappers';
import { getEntryStatus } from '@/utils/entryStatusUtils';

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock('@/services/database/supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/supabaseClient')>();
  return {
    ...actual,
    supabase: { from: vi.fn(() => ({ select: mockSelect })) },
  };
});

/** An open show, as PostgREST returns it for the guest select: trials without a `class` key. */
function guestRow(trialExtras: Record<string, unknown> = {}) {
  return {
    id: 'show-1',
    name: 'Heartland Scent Work Trials',
    organization: 'AKC',
    start_date: '2099-10-10',
    end_date: '2099-10-11',
    status: 'published',
    entry_open_date: '2026-01-01',
    entry_close_date: '2099-10-01',
    club: { name: 'Heartland K9', address: null, email: null },
    trials: [
      {
        id: 'trial-1',
        name: 'Trial 1',
        date: '2099-10-10',
        trial_type: 'scent_work',
        timezone: 'America/Chicago',
        ...trialExtras,
      },
    ],
  };
}

function serve(rows: unknown[]) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const is = vi.fn().mockReturnValue({ order });
  const inFn = vi.fn().mockReturnValue({ is });
  mockSelect.mockReturnValue({ in: inFn });
}

async function guestShows() {
  const { data, error } = await getPublicShows();
  expect(error).toBeNull();
  return mapDatabaseShowsArray(data as Parameters<typeof mapDatabaseShowsArray>[0]);
}

describe('guest Browse Shows class inventory (MYK9-756)', () => {
  beforeEach(() => {
    mockSelect.mockReset();
  });

  it('fetches trials without their classes, which is the premise of this guard', async () => {
    serve([guestRow()]);
    await guestShows();
    const selectString = String(mockSelect.mock.calls[0]?.[0]);
    expect(selectString).toContain('trials(');
    expect(selectString).not.toMatch(/class(es)?[:(]/);
  });

  it('does not label an open show "Classes Not Ready" when the classes were never fetched', async () => {
    serve([guestRow()]);
    const [show] = await guestShows();

    expect(show!.trials?.[0]?.classes).toBeUndefined();
    const status = getEntryStatus(show!, false);
    expect(status.label).not.toBe('Classes Not Ready');
    expect(status).toMatchObject({ status: 'accepting', canEnter: true });
  });

  it('still says "Classes Not Ready" when a class read genuinely came back empty', async () => {
    // Positive control: the same mapper, handed a fetched-but-empty class list.
    serve([guestRow({ class: [] })]);
    const [show] = await guestShows();

    expect(show!.trials?.[0]?.classes).toEqual([]);
    expect(getEntryStatus(show!, false).label).toBe('Classes Not Ready');
  });
});
