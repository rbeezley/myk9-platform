import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { StickyNav } from '../sections/StickyNav';
import { HeroBlock } from '../sections/HeroBlock';
import { FinalCtaBand } from '../sections/FinalCtaBand';

/**
 * Exhibitor touch-target floor is 44px. These pin the landing CTAs at the
 * minimum so a future restyle can't drop them back under (the sweep found the
 * hero CTA at ~42px and the sticky-nav CTA at ~28px).
 */

const WIZARD_URL = '/shows/show-1/register';

const HERO_PROPS = {
  clubName: 'Heritage Kennel Club',
  showName: 'Heritage Trial',
  showSubtitle: 'AKC Licensed Trial',
  entryCloseDate: null,
  trialStartDate: '2026-06-12',
  trialEndDate: '2026-06-14',
  venueName: 'Show Grounds',
  venueCity: 'Austin',
  timezone: 'America/Chicago',
  entryWizardUrl: WIZARD_URL,
  classesHref: '/shows/show-1/classes',
};

describe('Heritage landing touch targets (>=44px)', () => {
  it('sticky-nav enter CTA clears the 44px floor', () => {
    render(<StickyNav clubName="Heritage Kennel Club" entryWizardUrl={WIZARD_URL} />);
    const link = screen.getByRole('link', { name: /enter this show/i });
    expect(link.className).toContain('min-h-[44px]');
  });

  it('hero enter CTA clears the 44px floor', () => {
    render(<HeroBlock {...HERO_PROPS} />);
    const link = screen.getByRole('link', { name: /enter this show/i });
    expect(link.className).toContain('min-h-[44px]');
  });

  it('final-band enter CTA clears the 44px floor', () => {
    render(<FinalCtaBand entryWizardUrl={WIZARD_URL} />);
    const link = screen.getByRole('link', { name: /enter this show/i });
    expect(link.className).toContain('min-h-[44px]');
  });
});
