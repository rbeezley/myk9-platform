import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import { useHeritageLandingData } from '../useHeritageLandingData';

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: [] }),
}));

describe('useHeritageLandingData', () => {
  it('uses published experience supplemental content for public landing details', () => {
    const show = {
      id: 'show-1',
      name: 'Bluegrass Classic',
      organization: 'AKC',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      entryOpenDate: '2026-04-01',
      entryCloseDate: '2026-04-15',
      preEntryFee: '25',
      experienceIsPublished: true,
      experiencePublishedContent: {
        style: 'heritage',
        generatedAt: '2026-05-09T14:00:00.000Z',
        narratives: { showHours: 'Hours', trialInformation: 'Info' },
        supplemental: {
          vetClinic: null,
          accommodations: [{ name: 'The Lodge', address: '100 Main', phone: '555-0100' }],
          hospitalityNotes: 'Coffee in the morning.',
          awardsDescription: 'Rosettes for placements.',
          additionalNotes: null,
        },
        outputs: { premiumUrl: null },
      },
    } as Show;

    const { result } = renderHook(() => useHeritageLandingData(show, null, []));

    expect(result.current.hospitalityNotes).toBe('Coffee in the morning.');
    expect(result.current.awardsDescription).toBe('Rosettes for placements.');
    expect(result.current.accommodations).toEqual([
      { name: 'The Lodge', address: '100 Main', phone: '555-0100' },
    ]);
  });
});
