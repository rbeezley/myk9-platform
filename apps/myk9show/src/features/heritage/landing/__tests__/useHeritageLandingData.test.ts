import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useHeritageLandingData } from '../useHeritageLandingData';
import { ukcRegistry } from '@/features/registries/ukc';
import { akcRegistry } from '@/features/registries/akc';

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: [] }),
}));

const SHOW = {
  id: 'show-1',
  name: 'Bluegrass Classic',
  organization: 'AKC',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
} as Show;

function trial(registryId: string | null): Trial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    showName: 'Bluegrass Classic',
    trialDate: '2026-05-01',
    trialNumber: '1',
    status: 'Upcoming',
    registryId,
  } as Trial;
}

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

  // Phase 5a — the landing reads the trial's registry (camelCase registryId on the mapped
  // domain Trial), not a hardcoded AKC. A UKC trial must show UKC license/member-club copy.
  it('renders the trial registry license + member-club copy (UKC)', () => {
    const { result } = renderHook(() => useHeritageLandingData(SHOW, trial('UKC'), [trial('UKC')]));
    expect(result.current.licenseLanguage).toBe(ukcRegistry.licenseLanguage);
    expect(result.current.memberClubLanguage).toBe(ukcRegistry.memberClubLanguage);
    expect(result.current.showSubtitle).toContain(ukcRegistry.licenseLanguage);
  });

  it('falls back to AKC copy when the trial has no registry', () => {
    const { result } = renderHook(() => useHeritageLandingData(SHOW, trial(null), [trial(null)]));
    expect(result.current.licenseLanguage).toBe(akcRegistry.licenseLanguage);
  });
});
