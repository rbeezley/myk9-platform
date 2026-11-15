/**
 * MYK9-2045: every public landing style prints the club's Officers list, from the same facts
 * the premium PDF prints, and prints no officer rows when the club lists none. Renders the REAL
 * pages; only the officers read is stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { render } from '@/test/utils/testUtils';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import type { PremiumStyle } from '@/types/premium-types';

const { fetchShowClubOfficers } = vi.hoisted(() => ({ fetchShowClubOfficers: vi.fn() }));

vi.mock('@/services/database/club-memberships/officers', () => ({ fetchShowClubOfficers }));

interface PageProps {
  show: Show;
  trial: Trial;
  allTrials: Trial[];
}

const STYLES = Object.entries(STYLED_LANDING_BY_STYLE) as Array<
  [PremiumStyle, ComponentType<PageProps>]
>;

const show = {
  id: 'show-heartland',
  name: 'Heartland Scent Work Classic',
  organization: 'Heartland Dog Club',
} as Show;

const trial = {
  id: 'trial-1',
  showId: show.id,
  showName: show.name,
  trialDate: '2026-08-01',
  trialNumber: 'Trial 1',
  status: 'no-status',
  registryId: 'AKC',
} as unknown as Trial;

describe.each(STYLES)('%s landing club officers (MYK9-2045)', (_style, Page) => {
  beforeEach(() => {
    mockViewportWidth(1280);
    fetchShowClubOfficers.mockReset();
  });

  it('prints the club officers as Title and Name, president first', async () => {
    fetchShowClubOfficers.mockResolvedValue([
      { position: 'secretary', name: 'Sam Typed' },
      { position: 'president', name: 'Pat President' },
    ]);
    const { container } = render(<Page show={show} trial={trial} allTrials={[trial]} />);

    expect(await screen.findByText('Sam Typed')).toBeInTheDocument();
    expect(screen.getByText('Pat President')).toBeInTheDocument();
    expect(within(container).getAllByText(/^Club secretary$/i).length).toBeGreaterThan(0);
    const text = container.textContent ?? '';
    expect(text.indexOf('Pat President')).toBeLessThan(text.indexOf('Sam Typed'));
  });

  it('prints no officer names when the club lists none', async () => {
    fetchShowClubOfficers.mockResolvedValue([]);
    render(<Page show={show} trial={trial} allTrials={[trial]} />);

    await vi.waitFor(() => expect(fetchShowClubOfficers).toHaveBeenCalled());
    expect(screen.queryByText('Sam Typed')).toBeNull();
    expect(screen.queryByText(/^Club secretary$/i)).toBeNull();
  });
});
