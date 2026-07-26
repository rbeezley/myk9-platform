import { describe, it, expect } from 'vitest';
import { deriveShowMarkerStatus } from './markerStatus';

const NOW = new Date('2026-07-26T12:00:00Z');

describe('deriveShowMarkerStatus', () => {
  it('returns open for accepting_entries with a far-off close date and light fill', () => {
    expect(
      deriveShowMarkerStatus(
        {
          status: 'accepting_entries',
          entryCloseDate: '2026-09-01',
          totalEntryCount: 10,
          maxTotalEntries: 100,
        },
        NOW
      )
    ).toBe('open');
  });

  it('returns closing-soon when entry close is within 7 days', () => {
    expect(
      deriveShowMarkerStatus({ status: 'accepting_entries', entryCloseDate: '2026-08-01' }, NOW)
    ).toBe('closing-soon');
  });

  it('returns open when entry close is just past 7 days out', () => {
    expect(
      deriveShowMarkerStatus({ status: 'accepting_entries', entryCloseDate: '2026-08-03' }, NOW)
    ).toBe('open');
  });

  it('returns closing-soon at exactly 90% capacity', () => {
    expect(
      deriveShowMarkerStatus(
        {
          status: 'accepting_entries',
          entryCloseDate: '2026-09-01',
          totalEntryCount: 90,
          maxTotalEntries: 100,
        },
        NOW
      )
    ).toBe('closing-soon');
  });

  it('returns open at 89% capacity', () => {
    expect(
      deriveShowMarkerStatus(
        {
          status: 'accepting_entries',
          entryCloseDate: '2026-09-01',
          totalEntryCount: 89,
          maxTotalEntries: 100,
        },
        NOW
      )
    ).toBe('open');
  });

  it('returns full at capacity without a waitlist', () => {
    expect(
      deriveShowMarkerStatus(
        { status: 'accepting_entries', totalEntryCount: 100, maxTotalEntries: 100 },
        NOW
      )
    ).toBe('full');
  });

  it('returns waitlist at capacity when the waitlist is enabled', () => {
    expect(
      deriveShowMarkerStatus(
        {
          status: 'accepting_entries',
          totalEntryCount: 100,
          maxTotalEntries: 100,
          waitlistEnabled: true,
        },
        NOW
      )
    ).toBe('waitlist');
  });

  it.each(['closed', 'in_progress', 'completed', 'cancelled', 'published', 'draft'])(
    'returns closed for status %s',
    status => {
      expect(deriveShowMarkerStatus({ status }, NOW)).toBe('closed');
    }
  );

  it('returns closed when the entry close date has passed even if status lags', () => {
    expect(
      deriveShowMarkerStatus({ status: 'accepting_entries', entryCloseDate: '2026-07-20' }, NOW)
    ).toBe('closed');
  });

  it('treats unknown capacity as open (no count data)', () => {
    expect(
      deriveShowMarkerStatus({ status: 'accepting_entries', entryCloseDate: '2026-09-01' }, NOW)
    ).toBe('open');
  });
});
