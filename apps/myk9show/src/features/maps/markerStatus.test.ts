import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deriveShowMarkerStatus } from './markerStatus';
import type { Show } from '@/types/show-types';

// Frozen clock so the delegated getEntryStatus window math is deterministic.
const NOW = new Date('2026-07-26T12:00:00');

function makeShow(overrides: Partial<Show>): Show {
  return {
    id: 'show-1',
    name: 'Status Test Show',
    organization: 'AKC',
    startDate: '2026-09-10',
    endDate: '2026-09-12',
    location: 'Tulsa, OK',
    status: 'published',
    events: [],
    source: 'myK9Show',
    entryOpenDate: '2026-06-01',
    entryCloseDate: '2026-09-01',
    preEntryFee: '25',
    ...overrides,
  } as unknown as Show;
}

describe('deriveShowMarkerStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('published show inside its entry window is open', () => {
    expect(deriveShowMarkerStatus(makeShow({}))).toBe('open');
  });

  it('accepting_entries status is also enterable', () => {
    expect(deriveShowMarkerStatus(makeShow({ status: 'accepting_entries' }))).toBe('open');
  });

  it('closing-soon when entry close is within 7 days', () => {
    expect(deriveShowMarkerStatus(makeShow({ entryCloseDate: '2026-08-01' }))).toBe('closing-soon');
  });

  it('still open just past the 7-day window', () => {
    expect(deriveShowMarkerStatus(makeShow({ entryCloseDate: '2026-08-04' }))).toBe('open');
  });

  it('closed before the entry window opens', () => {
    expect(deriveShowMarkerStatus(makeShow({ entryOpenDate: '2026-08-15' }))).toBe('closed');
  });

  it('closed after the entry window (close date itself is inclusive)', () => {
    expect(deriveShowMarkerStatus(makeShow({ entryCloseDate: '2026-07-20' }))).toBe('closed');
    // On the close date itself, entries are still open — closing-soon, not closed
    expect(deriveShowMarkerStatus(makeShow({ entryCloseDate: '2026-07-26' }))).toBe('closing-soon');
  });

  it('lifecycle statuses render closed regardless of dates', () => {
    for (const status of ['draft', 'closed', 'in_progress', 'completed', 'cancelled']) {
      expect(deriveShowMarkerStatus(makeShow({ status }))).toBe('closed');
    }
  });

  it('full at capacity without a waitlist', () => {
    expect(
      deriveShowMarkerStatus(makeShow({}), { totalEntryCount: 100, maxTotalEntries: 100 })
    ).toBe('full');
  });

  it('waitlist at capacity when the waitlist is enabled', () => {
    expect(
      deriveShowMarkerStatus(makeShow({}), {
        totalEntryCount: 100,
        maxTotalEntries: 100,
        waitlistEnabled: true,
      })
    ).toBe('waitlist');
  });

  it('closing-soon at 90% capacity even with a distant close date', () => {
    expect(
      deriveShowMarkerStatus(makeShow({}), { totalEntryCount: 90, maxTotalEntries: 100 })
    ).toBe('closing-soon');
  });

  it('open at 89% capacity', () => {
    expect(
      deriveShowMarkerStatus(makeShow({}), { totalEntryCount: 89, maxTotalEntries: 100 })
    ).toBe('open');
  });
});
