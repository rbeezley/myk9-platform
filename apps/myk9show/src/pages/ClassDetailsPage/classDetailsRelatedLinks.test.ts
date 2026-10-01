import { describe, it, expect } from 'vitest';
import { buildClassDetailsRelatedLinks } from './classDetailsRelatedLinks';

describe('buildClassDetailsRelatedLinks', () => {
  it('returns both links for staff with all IDs loaded', () => {
    const links = buildClassDetailsRelatedLinks({
      isStaff: true,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    });

    expect(links).toEqual([
      {
        key: 'class-management',
        label: 'Setup → Classes',
        href: '/shows/show-1/setup?section=classes',
      },
      {
        key: 'entry-management',
        label: 'Entry Management',
        href: '/shows/show-1/entries?trial=trial-1&class=class-1',
      },
    ]);
  });

  it('omits both links for non-staff', () => {
    const links = buildClassDetailsRelatedLinks({
      isStaff: false,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    });

    expect(links).toEqual([]);
  });

  it('omits all links when showId is not loaded', () => {
    const links = buildClassDetailsRelatedLinks({
      isStaff: true,
      showId: null,
      trialId: 'trial-1',
      classId: 'class-1',
    });

    expect(links).toEqual([]);
  });

  it('keeps the Setup → Classes link when trialId is not loaded (it is not trial-scoped)', () => {
    const links = buildClassDetailsRelatedLinks({
      isStaff: true,
      showId: 'show-1',
      trialId: null,
      classId: 'class-1',
    });

    expect(links).toEqual([
      {
        key: 'class-management',
        label: 'Setup → Classes',
        href: '/shows/show-1/setup?section=classes',
      },
      {
        key: 'entry-management',
        label: 'Entry Management',
        href: '/shows/show-1/entries?class=class-1',
      },
    ]);
  });

  it('omits the entry-management link when classId is not loaded', () => {
    const links = buildClassDetailsRelatedLinks({
      isStaff: true,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: null,
    });

    expect(links).toEqual([
      {
        key: 'class-management',
        label: 'Setup → Classes',
        href: '/shows/show-1/setup?section=classes',
      },
    ]);
  });

  it('never leaks another show scope into the built hrefs', () => {
    // Fixture: an entry that "belongs" to another show's trial/class must
    // never be used to build a link scoped to the current show.
    const currentShowId = 'show-current';
    const otherShowTrialId = 'trial-other-show';
    const links = buildClassDetailsRelatedLinks({
      isStaff: true,
      showId: currentShowId,
      trialId: otherShowTrialId,
      classId: 'class-1',
    });

    for (const link of links) {
      expect(link.href.startsWith(`/shows/${currentShowId}/`)).toBe(true);
    }
  });
});
