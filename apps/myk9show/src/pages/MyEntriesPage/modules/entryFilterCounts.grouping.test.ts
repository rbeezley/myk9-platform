/**
 * MYK9-1210 — the filter strip's counts group the entries once per tab, and
 * the counts are the ones the per-status implementation produced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { day, makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import * as groupModule from './groupEntriesByShow';
import { countVisibleClassEntries, deriveStatusCounts, deriveTabCounts } from './entryFilterCounts';
import { ENTRY_TAB_DEFS, TAB_PREDICATES } from './entryTabDefs';
import { orderMatchesStatusFilter } from './statusFilterPredicate';
import type { EntryStatusFilter, MyEntry } from './my-entries-types';

vi.mock('./groupEntriesByShow', async importOriginal => {
  const actual = await importOriginal<typeof import('./groupEntriesByShow')>();
  return { ...actual, groupEntriesByShow: vi.fn(actual.groupEntriesByShow) };
});

const NO_POSITIONS = {
  activePositionCount: 0,
  displayedPositionCount: 0,
  isLoadingPositions: false,
  isScoped: false,
};
const STATUSES: EntryStatusFilter[] = ['any', 'pending', 'accepted', 'waitlist'];

/** Past and upcoming shows; one upcoming order holds a pending dog and an accepted dog. */
function mixedEntries(): MyEntry[] {
  const pending = { entryStatus: EntryStatus.PENDING, entryStatusKind: 'pending' as const };
  const waitlist = { entryStatus: EntryStatus.WAITLIST, entryStatusKind: 'waitlist' as const };
  const next = { showId: 'show-next', showName: 'Winter', showDate: day('2026-12-05') };
  return toOrders([
    makeRow({
      id: 'past',
      registrationId: 'r-past',
      showId: 'show-past',
      showName: 'Summer',
      showDate: day('2026-08-01'),
      showEndDate: day('2026-08-02'),
      classes: [makeClass({ id: 'c-past', trialDate: day('2026-08-01') })],
    }),
    makeRow({
      ...next,
      id: 'next-pending',
      registrationId: 'r-next',
      dogId: 'dog-a',
      dogName: 'A',
      entryStatus: EntryStatus.PENDING,
      classes: [makeClass({ id: 'c-a', trialDate: day('2026-12-05'), ...pending })],
    }),
    makeRow({
      ...next,
      id: 'next-accepted',
      registrationId: 'r-next',
      dogId: 'dog-b',
      dogName: 'B',
      classes: [
        makeClass({ id: 'c-b1', trialDate: day('2026-12-05') }),
        makeClass({ id: 'c-b2', trialDate: day('2026-12-05'), ...pending }),
      ],
    }),
    makeRow({
      ...next,
      id: 'next-waitlist',
      registrationId: 'r-wait',
      dogId: 'dog-c',
      dogName: 'C',
      entryStatus: EntryStatus.WAITLIST,
      paymentStatus: PaymentStatus.PENDING,
      classes: [
        makeClass({
          id: 'c-c',
          trialDate: day('2026-12-05'),
          paymentStatus: PaymentStatus.PENDING,
          ...waitlist,
        }),
      ],
    }),
  ]);
}

const groupSpy = vi.mocked(groupModule.groupEntriesByShow);

describe('count derivations group entries once per tab', () => {
  beforeEach(() => {
    groupSpy.mockClear();
  });

  it('deriveStatusCounts groups once for all four status counts', () => {
    deriveStatusCounts(mixedEntries(), 'all', 'any', NOW, NO_POSITIONS);
    expect(groupSpy).toHaveBeenCalledTimes(1);
  });

  it('deriveTabCounts groups once per tab (unchanged)', () => {
    const entries = mixedEntries();
    groupSpy.mockClear();
    deriveTabCounts(entries, 'pending', NOW, 0);
    expect(groupSpy).toHaveBeenCalledTimes(ENTRY_TAB_DEFS.length);
  });
});

describe('derived counts equal the per-status counts', () => {
  it('deriveStatusCounts matches countVisibleClassEntries for every tab and status', () => {
    const entries = mixedEntries();
    for (const tab of ENTRY_TAB_DEFS) {
      const inTab = entries.filter(entry => TAB_PREDICATES[tab.id](entry, NOW));
      const { counts, surface } = deriveStatusCounts(entries, tab.id, 'any', NOW, NO_POSITIONS);
      expect(counts.pending).toBe(countVisibleClassEntries(inTab, 'pending'));
      expect(counts.accepted).toBe(countVisibleClassEntries(inTab, 'accepted'));
      expect(counts.waitlist).toBe(surface.chipCount);
      expect(counts.any).toBe(countVisibleClassEntries(inTab));
    }
  });

  it('deriveTabCounts matches the order-filter-first count for every status', () => {
    const entries = mixedEntries();
    for (const status of STATUSES) {
      const kept = entries.filter(entry => orderMatchesStatusFilter(entry, status));
      const counts = deriveTabCounts(entries, status, NOW, 0);
      for (const tab of ENTRY_TAB_DEFS) {
        expect(counts[tab.id]).toBe(
          countVisibleClassEntries(
            kept.filter(entry => TAB_PREDICATES[tab.id](entry, NOW)),
            status
          )
        );
      }
    }
  });

  it('the fixture exercises a mixed order and a non-empty count in every status', () => {
    const all = deriveStatusCounts(mixedEntries(), 'all', 'any', NOW, NO_POSITIONS).counts;
    expect(all).toEqual({ any: 5, pending: 2, accepted: 2, waitlist: 1 });
  });
});
