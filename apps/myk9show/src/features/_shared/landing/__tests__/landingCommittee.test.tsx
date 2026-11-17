/**
 * MYK9-2064: every public landing style prints the show's Event Committee from the same facts
 * the premium PDF prints, and prints nothing when the club and show list none. Renders the REAL
 * pages; only the two reads are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { render } from '@/test/utils/testUtils';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import type { PremiumStyle } from '@/types/premium-types';

const { fetchShowClubOfficers, fetchShowCommittee } = vi.hoisted(() => ({
  fetchShowClubOfficers: vi.fn(),
  fetchShowCommittee: vi.fn(),
}));

vi.mock('@/services/database/club-memberships/officers', () => ({ fetchShowClubOfficers }));
vi.mock('@/services/database/club-memberships/committee', () => ({ fetchShowCommittee }));

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

describe.each(STYLES)('%s landing Event Committee (MYK9-2064)', (_style, Page) => {
  beforeEach(() => {
    mockViewportWidth(1280);
    fetchShowClubOfficers.mockReset();
    fetchShowCommittee.mockReset();
    fetchShowClubOfficers.mockResolvedValue([]);
  });

  it('prints the committee names, in order, under an Event Committee title', async () => {
    fetchShowCommittee.mockResolvedValue(['Pat Chair', 'Sam Typed', 'Linda Linked']);
    const { container } = render(<Page show={show} trial={trial} allTrials={[trial]} />);

    expect(await screen.findByText('Pat Chair, Sam Typed, Linda Linked')).toBeInTheDocument();
    expect(screen.getAllByText(/^Event Committee$/i).length).toBeGreaterThan(0);
    expect(fetchShowCommittee).toHaveBeenCalledWith('show-heartland');
    expect(container.textContent ?? '').toContain('Pat Chair');
  });

  it('prints no committee title or names when none is listed', async () => {
    fetchShowCommittee.mockResolvedValue([]);
    render(<Page show={show} trial={trial} allTrials={[trial]} />);

    await vi.waitFor(() => expect(fetchShowCommittee).toHaveBeenCalled());
    expect(screen.queryByText(/^Event Committee$/i)).toBeNull();
    expect(screen.queryByText(/Pat Chair/)).toBeNull();
  });
});
