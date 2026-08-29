/**
 * The public show landing is what a prospective exhibitor sees BEFORE they have
 * decided to trust the platform, and the URL a club shares. Everything it states
 * about entering — whether entries are open, whether there are classes, what it
 * costs — has to be something the page actually knows.
 *
 * These pin the three claims it used to make from data it had not read.
 */
import { describe, it, expect } from 'vitest';
import { getEntryStatus } from '@/utils/entryStatusUtils';
import { mapDatabaseToShow } from '@/services/mappers/showMappers';
import type { Show } from '@/types/show-types';

type DbShow = Parameters<typeof mapDatabaseToShow>[0];

function makeDbShow(overrides: Record<string, unknown>): DbShow {
  return {
    id: 'show-1',
    name: 'Spring Classic',
    organization: 'AKC',
    start_date: '2026-09-01T00:00:00+00:00',
    end_date: '2026-09-02T00:00:00+00:00',
    entry_open_date: '2026-07-01T00:00:00+00:00',
    entry_close_date: '2026-08-25T00:00:00+00:00',
    ...overrides,
  } as unknown as DbShow;
}

describe('an unset entry fee is not a free show', () => {
  it('maps a NULL pre_entry_fee to empty, not "0"', () => {
    // '0' is truthy, so every landing's `if (show?.preEntryFee)` guard passed
    // and the shareable page advertised "First entry — $0.00" for a club that
    // simply had not entered a fee yet.
    const show = mapDatabaseToShow(makeDbShow({ pre_entry_fee: null }));
    expect(show.preEntryFee).toBe('');
    expect(Boolean(show.preEntryFee)).toBe(false);
  });

  it('still carries a real fee, including a genuine zero', () => {
    expect(mapDatabaseToShow(makeDbShow({ pre_entry_fee: 35 })).preEntryFee).toBe('35');
    // A deliberately free show stores 0 and should still say so.
    expect(mapDatabaseToShow(makeDbShow({ pre_entry_fee: 0 })).preEntryFee).toBe('0');
  });
});

describe('entries that have not opened yet', () => {
  const baseShow = {
    id: 'show-1',
    name: 'Spring Classic',
    entryOpenDate: '2027-07-01',
    entryCloseDate: '2027-08-25',
  } as unknown as Show;

  it('reports not_yet_open, which the public landing must respect', () => {
    // The landings only ever checked `entryClosed`, so a show opening months
    // from now advertised "Enter This Show" and dead-ended the visitor.
    const status = getEntryStatus(baseShow, false, { hasEntryClassInventory: true });
    expect(status.status).toBe('not_yet_open');
    expect(status.canEnter).toBe(false);
  });

  it('does not treat an unknown class inventory as a blocker', () => {
    // null means unresolved. It must stay permissive, or a slow read hides the
    // CTA for a show that is genuinely open.
    const openShow = {
      ...baseShow,
      entryOpenDate: '2020-01-01',
      entryCloseDate: '2099-01-01',
    } as unknown as Show;
    const status = getEntryStatus(openShow, false, { hasEntryClassInventory: null });
    expect(status.canEnter).toBe(true);
  });
});
