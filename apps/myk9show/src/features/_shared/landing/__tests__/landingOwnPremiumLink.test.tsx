/**
 * MYK9-2054: a club that publishes its own premium as a link gets "Download premium (PDF)" on
 * every public landing style, pointing at that link and nowhere else.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { render } from '@/test/utils/testUtils';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import { PREMIUM_DOWNLOAD_LABEL } from '@/features/_shared/landing/PremiumDownloadSection';
import type { PremiumStyle } from '@/types/premium-types';

interface PageProps {
  show: Show;
  trial: Trial;
  allTrials: Trial[];
}

const STYLES = Object.entries(STYLED_LANDING_BY_STYLE) as Array<
  [PremiumStyle, ComponentType<PageProps>]
>;

const LINK = 'https://club.example.org/our-premium.pdf';

const baseShow = {
  id: '6f1c2b8e-1d2a-4c3b-9e4f-5a6b7c8d9e0f',
  name: 'Heartland Scent Work Classic',
  organization: 'Heartland Dog Club',
  preEntryFee: 32,
  dayOfShowFee: 47,
} as unknown as Show;

const trial = {
  id: 'trial-1',
  showId: baseShow.id,
  showName: baseShow.name,
  trialDate: '2026-08-01',
  trialNumber: 'Trial 1',
  status: 'no-status',
} as unknown as Trial;

describe.each(STYLES)('%s landing, club-supplied premium link (MYK9-2054)', (_style, Page) => {
  it("offers one download pointing at the club's own link", () => {
    mockViewportWidth(1280);
    render(
      <Page
        show={{ ...baseShow, publishesOwnPremium: true, ownPremiumLink: LINK }}
        trial={trial}
        allTrials={[trial]}
      />
    );

    const links = screen.getAllByRole('link', { name: PREMIUM_DOWNLOAD_LABEL });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', LINK);
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: PREMIUM_DOWNLOAD_LABEL })).toBeNull();
  });

  it('does not offer a leftover link once the show no longer publishes its own premium', () => {
    mockViewportWidth(1280);
    render(
      <Page
        show={{ ...baseShow, publishesOwnPremium: false, ownPremiumLink: LINK }}
        trial={trial}
        allTrials={[trial]}
      />
    );
    expect(screen.queryByRole('link', { name: PREMIUM_DOWNLOAD_LABEL })).toBeNull();
  });

  it('serves the published PDF, not the leftover link, when the switch is off', () => {
    mockViewportWidth(1280);
    render(
      <Page
        show={
          {
            ...baseShow,
            publishesOwnPremium: false,
            ownPremiumLink: LINK,
            publishedPremiumPath: `${baseShow.id}/11111111-1111-1111-1111-111111111111.pdf`,
            publishedPremiumUrl: 'https://example.test/x.pdf',
            publishedPremiumAt: '2026-08-01T00:00:00Z',
          } as Show
        }
        trial={trial}
        allTrials={[trial]}
      />
    );
    expect(screen.queryByRole('link', { name: PREMIUM_DOWNLOAD_LABEL })).toBeNull();
    expect(screen.getByRole('button', { name: PREMIUM_DOWNLOAD_LABEL })).toBeInTheDocument();
  });

  it('never renders a non-web address as a link', () => {
    mockViewportWidth(1280);
    render(
      <Page
        show={{ ...baseShow, publishesOwnPremium: true, ownPremiumLink: 'javascript:alert(1)' }}
        trial={trial}
        allTrials={[trial]}
      />
    );
    expect(screen.queryByRole('link', { name: PREMIUM_DOWNLOAD_LABEL })).toBeNull();
  });
});
