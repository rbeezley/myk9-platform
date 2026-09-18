import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { StickyNav } from '../sections/StickyNav';

/**
 * Exhibitor touch-target floor is 44px. This pins the header entry CTA at
 * the minimum so a future restyle can't drop it back under (the sweep found
 * the sticky-nav CTA at ~28px).
 *
 * MYK9-633: HeroBlock and FinalCtaBand no longer render their own "Enter
 * this show" link (they duplicated this one) — the mobile-only sticky bar
 * that replaced FinalCtaBand's CTA is StickyEntryCtaBar, covered by its own
 * shared-component tests and by HeritageLandingPage.test.tsx.
 */

const WIZARD_URL = '/shows/show-1/register';

describe('Heritage landing touch targets (>=44px)', () => {
  it('sticky-nav enter CTA clears the 44px floor', () => {
    render(<StickyNav clubName="Heritage Kennel Club" entryWizardUrl={WIZARD_URL} />);
    const link = screen.getByRole('link', { name: /enter this show/i });
    expect(link.className).toContain('min-h-[44px]');
  });
});
