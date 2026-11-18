import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { clubPayoutsMessage } from '@/features/payments/clubPayoutsState';
import { PublishAttentionChip } from '../PublishAttentionChip';

const control = vi.hoisted(() => ({
  value: {
    infoState: 'ready' as 'ready' | 'loading' | 'unavailable' | 'offline',
    hasPublishedPremium: false,
    landingUnpublished: false,
  },
}));

const canOpen = vi.hoisted(() => ({ value: true }));
vi.mock('@/features/payments/useCanOpenClubPayments', () => ({
  useCanOpenClubPayments: () => canOpen.value,
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));
const payouts = vi.hoisted(() => ({ state: 'ready' as string }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/features/payments/useClubPayoutsState', () => ({
  useClubPayoutsState: () => ({ state: payouts.state }),
}));

const store = vi.hoisted(() => ({
  shows: [{ id: 'show-1', usesLandingPage: true, publishesOwnPremium: false }] as Record<
    string,
    unknown
  >[],
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: { shows: unknown[] }) => unknown) =>
    selector({ shows: store.shows }),
}));

vi.mock('@/features/premium/usePremiumPublishControl', () => ({
  usePremiumPublishControl: () => control.value,
}));

describe('PublishAttentionChip', () => {
  beforeEach(() => {
    control.value = { infoState: 'ready', hasPublishedPremium: false, landingUnpublished: false };
    store.shows = [{ id: 'show-1', usesLandingPage: true, publishesOwnPremium: false }];
    payouts.state = 'ready';
    navigate.mockClear();
    canOpen.value = true;
  });

  describe('club payouts nudge (MYK9-2164)', () => {
    const draft = (overrides: Record<string, unknown> = {}) => {
      store.shows = [
        {
          id: 'show-1',
          clubId: 'club-9',
          status: 'draft',
          usesLandingPage: true,
          publishesOwnPremium: false,
          ...overrides,
        },
      ];
    };

    it.each([
      ['not-connected', "club's bank account not set up"],
      ['incomplete', 'bank account setup not finished'],
      ['in-review', 'Stripe is reviewing the bank account'],
    ])('shows "%s" nudge on a draft, linking the Payments tab', (state, label) => {
      draft();
      payouts.state = state;
      control.value = {
        infoState: 'loading',
        hasPublishedPremium: false,
        landingUnpublished: false,
      };
      render(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(navigate).toHaveBeenCalledWith('/clubs/club-9?tab=payments');
    });

    it('shows the full reason instead of navigating when she cannot open the Payments tab', async () => {
      const { toast } = await import('sonner');
      draft();
      canOpen.value = false;
      payouts.state = 'not-connected';
      render(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: "club's bank account not set up" }));
      expect(navigate).not.toHaveBeenCalled();
      expect(toast.info).toHaveBeenCalledWith(clubPayoutsMessage('not-connected'));
    });

    it('comes before the premium nudge', () => {
      draft();
      payouts.state = 'not-connected';
      render(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'premium list not yet published' })).toBeNull();
      expect(screen.getByRole('button', { name: "club's bank account not set up" })).toBeVisible();
    });

    it.each(['unknown', 'ready', 'demo'])('says nothing about payouts for %s', state => {
      draft();
      payouts.state = state;
      control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: false };
      const { container } = render(
        <PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('says nothing about payouts once the show is public', () => {
      draft({ status: 'published' });
      payouts.state = 'not-connected';
      control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: false };
      const { container } = render(
        <PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('still shows the premium nudge when payouts are fine', () => {
      draft();
      render(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'premium list not yet published' })).toBeVisible();
    });
  });

  it('says the premium list is not published, and opens About on the premium card on click', () => {
    const onOpen = vi.fn();
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'premium list not yet published' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('setup-publish-premium');
  });

  it('says the landing page is not published once the premium list is', () => {
    control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: true };
    const onOpen = vi.fn();
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'landing page not yet published' }));
    expect(onOpen).toHaveBeenCalledWith('setup-publish-premium');
  });

  it('says nothing about the premium list when the club publishes its own (MYK9-1686)', () => {
    store.shows = [{ id: 'show-1', usesLandingPage: true, publishesOwnPremium: true }];
    const { container } = render(
      <PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('still nudges the landing page when the club publishes its own premium list', () => {
    store.shows = [{ id: 'show-1', usesLandingPage: true, publishesOwnPremium: true }];
    control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: true };
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'landing page not yet published' })).toBeVisible();
  });

  it('warns about the landing page with no generated premium when the club publishes its own', () => {
    store.shows = [{ id: 'show-1', usesLandingPage: true, publishesOwnPremium: true }];
    control.value = { infoState: 'ready', hasPublishedPremium: false, landingUnpublished: true };
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'landing page not yet published' })).toBeVisible();
  });

  it('says nothing about the landing page when the show has no public landing page', () => {
    store.shows = [{ id: 'show-1', usesLandingPage: false }];
    control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: true };
    const { container } = render(
      <PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('still nudges the premium list when the landing page switch is off', () => {
    store.shows = [{ id: 'show-1', usesLandingPage: false }];
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'premium list not yet published' })).toBeVisible();
  });

  it('renders nothing once both are published', () => {
    control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: false };
    const { container } = render(
      <PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for someone who cannot manage the show, or while the state is unknown', () => {
    const { container, rerender } = render(
      <PublishAttentionChip showId="show-1" canManageShow={false} onOpen={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    control.value = { infoState: 'loading', hasPublishedPremium: false, landingUnpublished: false };
    rerender(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
