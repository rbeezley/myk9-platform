import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ShowPublishBlockers } from '../ShowPublishBlockers';
import { WizardPublishBlockers } from '../WizardPublishBlockers';
import { WizardSuccessOverlay } from '@/pages/secretary/ShowCreationWizard/WizardSuccessOverlay';
import type { PublishBlockersState } from '../usePublishBlockers';

const harness = vi.hoisted(() => ({
  show: undefined as unknown,
  club: undefined as unknown,
  canOpenPayments: false,
}));

vi.mock('../usePublishBlockers', () => ({
  usePublishBlockers: () => harness.show,
  useClubPublishBlockers: () => harness.club,
}));
vi.mock('@/features/payments/useCanOpenClubPayments', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/payments/useCanOpenClubPayments')>()),
  useCanOpenClubPayments: () => harness.canOpenPayments,
}));
vi.mock('@/components/secretary/ShowAccessCodesCard', () => ({
  ShowAccessCodesCard: () => null,
}));

const ALL_FIVE: PublishBlockersState = {
  status: 'ready',
  blockers: [
    { key: 'club_not_approved', waitingOn: 'myk9', eta: 'about a day' },
    { key: 'payouts_not_enabled', waitingOn: 'club_admin', eta: null },
    { key: 'premium_not_published', waitingOn: 'secretary', eta: null },
    { key: 'entry_dates_missing', waitingOn: 'secretary', eta: null },
    { key: 'entry_dates_out_of_order', waitingOn: 'secretary', eta: null },
  ],
};

beforeEach(() => {
  harness.show = ALL_FIVE;
  harness.club = { status: 'ready', blockers: [] };
  harness.canOpenPayments = false;
});

describe('ShowPublishBlockers links (MYK9-2198)', () => {
  it('opens the place to fix each line', () => {
    harness.canOpenPayments = true;
    render(<ShowPublishBlockers showId="show-1" clubId="club-1" />);

    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));
    expect(hrefs).toEqual([
      '/clubs/club-1',
      '/clubs/club-1?tab=payments',
      '/shows/show-1/about#setup-publish-premium',
      expect.stringContaining('/shows/show-1'),
      expect.stringContaining('/shows/show-1'),
    ]);
  });

  it('offers no payments link to someone who cannot open the Payments tab, and says who it waits on', () => {
    render(<ShowPublishBlockers showId="show-1" clubId="club-1" />);

    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByText('Waiting on your club admin')).toBeInTheDocument();
  });
});

describe('WizardPublishBlockers (MYK9-2198)', () => {
  const props = {
    clubId: 'club-1',
    entryOpenDate: '2026-06-01T12:00:00.000Z',
    entryCloseDate: '2026-06-25T12:00:00.000Z',
    onEditDetails: vi.fn(),
  };

  it('combines the club lines from the server with the draft’s own lines', () => {
    harness.club = {
      status: 'ready',
      blockers: [{ key: 'club_not_approved', waitingOn: 'myk9', eta: 'about a day' }],
    };
    render(<WizardPublishBlockers {...props} entryOpenDate="" />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Waiting on myK9Show, usually about a day')).toBeInTheDocument();
  });

  it('jumps back to Show Details from a dates line', async () => {
    render(<WizardPublishBlockers {...props} entryOpenDate="" />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /fix it: set when entries/i }));
    expect(props.onEditDetails).toHaveBeenCalledTimes(1);
  });

  it('says it could not check, rather than looking ready, when the club lines are unreadable', () => {
    harness.club = { status: 'error', retry: vi.fn() };
    render(<WizardPublishBlockers {...props} />);

    expect(
      screen.getByText('Could not check what blocks publishing. Try again.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Publish the premium list/)).not.toBeInTheDocument();
  });
});

describe('Show Created overlay (MYK9-2198)', () => {
  it('lists what blocks publishing for the created show', () => {
    render(
      <WizardSuccessOverlay
        createdShow={{
          id: 'show-1',
          name: 'Heartland Classic',
          passcodes: null,
          passcodeError: null,
        }}
        onReviewShow={vi.fn()}
      />
    );

    expect(screen.getByText('Show Created!')).toBeInTheDocument();
    expect(screen.getByText('Before you can publish')).toBeInTheDocument();
  });
});
