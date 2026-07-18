import { describe, it, expect } from 'vitest';
import { buildEntryManagementRelatedLinks } from './entryManagementRelatedLinks';

describe('buildEntryManagementRelatedLinks', () => {
  it('returns [] when no trial filter is active', () => {
    const links = buildEntryManagementRelatedLinks({
      isStaff: true,
      showId: 'show-1',
      trialFilter: null,
      classFilter: null,
      loadedTrialClassIds: [],
    });
    expect(links).toEqual([]);
  });

  it('returns [] for non-staff even with an active trial filter', () => {
    const links = buildEntryManagementRelatedLinks({
      isStaff: false,
      showId: 'show-1',
      trialFilter: 'trial-1',
      classFilter: null,
      loadedTrialClassIds: [],
    });
    expect(links).toEqual([]);
  });

  it('returns only the trial link when no class filter is active', () => {
    const links = buildEntryManagementRelatedLinks({
      isStaff: true,
      showId: 'show-1',
      trialFilter: 'trial-1',
      classFilter: null,
      loadedTrialClassIds: ['class-1'],
    });
    expect(links).toEqual([
      { key: 'trial-details', label: 'Trial Details', href: '/shows/show-1/trials/trial-1' },
    ]);
  });

  it('adds the class link when the class filter is in loaded data', () => {
    const links = buildEntryManagementRelatedLinks({
      isStaff: true,
      showId: 'show-1',
      trialFilter: 'trial-1',
      classFilter: 'class-1',
      loadedTrialClassIds: ['class-1', 'class-2'],
    });
    expect(links).toEqual([
      { key: 'trial-details', label: 'Trial Details', href: '/shows/show-1/trials/trial-1' },
      {
        key: 'class-details',
        label: 'Class Details',
        href: '/shows/show-1/trials/trial-1/classes/class-1',
      },
    ]);
  });

  it('omits the class link when the class filter is not among loaded classes', () => {
    // Fixture: a class id from another trial/show that hasn't been loaded
    // for this trial scope must never produce a link.
    const links = buildEntryManagementRelatedLinks({
      isStaff: true,
      showId: 'show-1',
      trialFilter: 'trial-1',
      classFilter: 'class-from-other-trial',
      loadedTrialClassIds: ['class-1', 'class-2'],
    });
    expect(links).toEqual([
      { key: 'trial-details', label: 'Trial Details', href: '/shows/show-1/trials/trial-1' },
    ]);
  });

  it('never leaks another show scope into the built hrefs', () => {
    const currentShowId = 'show-current';
    const links = buildEntryManagementRelatedLinks({
      isStaff: true,
      showId: currentShowId,
      trialFilter: 'trial-1',
      classFilter: 'class-1',
      loadedTrialClassIds: ['class-1'],
    });
    for (const link of links) {
      expect(link.href.startsWith(`/shows/${currentShowId}/`)).toBe(true);
    }
  });
});
