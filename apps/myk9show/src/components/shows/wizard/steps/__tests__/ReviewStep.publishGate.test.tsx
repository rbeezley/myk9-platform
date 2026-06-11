import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ReviewStep } from '../ReviewStep';
import { useClubStripeAccount } from '@/features/payments/useClubStripeAccount';
import { toast } from 'sonner';

// The wizard is the PRIMARY way shows get published, and onlineEntryGate never
// un-publishes — a show created already-published would permanently escape the
// transition-surface gates (ShowStatusPill/EditShowDialog). These tests pin
// that Create & Publish is gated on the club's Stripe payouts.

vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripeAccount: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/hooks/useResolvePersonName', () => ({
  useResolvePersonName: () => (id: string) => `Person ${id}`,
}));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ clubs: [{ id: 'club-1', name: 'Test Club' }] }),
}));
// Mutable so tests can exercise the clubless publish path.
const wizardShowHolder = { clubId: 'club-1' as string | '' };
vi.mock('@/store/wizardStore', () => ({
  useWizardStore: () => ({
    show: {
      name: 'Spring Classic',
      organization: 'AKC',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      entryOpenDate: '2026-06-01',
      entryCloseDate: '2026-06-25',
      preEntryFee: 30,
      dayOfShowFee: 35,
      location: 'Fairgrounds',
      get clubId() {
        return wizardShowHolder.clubId;
      },
      judgeIds: ['judge-1'],
      officials: { chairman: ['p-1'], secretary: ['p-2'] },
    },
    trials: [
      {
        id: 'trial-1',
        name: 'Trial 1',
        dateTime: '2026-07-01T09:00:00Z',
        type: 'scent_work',
        classes: [{ id: 'class-1', name: 'Novice A', level: 'novice', element: 'container' }],
      },
    ],
    judgeDetails: {},
    markStepCompleted: vi.fn(),
    setCurrentStep: vi.fn(),
  }),
}));

const mockedUseAccount = vi.mocked(useClubStripeAccount);

function mockAccount(payoutsEnabled: boolean | null, isLoading = false, isError = false) {
  mockedUseAccount.mockReturnValue({
    data:
      payoutsEnabled === null
        ? null
        : {
            id: 'csa-1',
            club_id: 'club-1',
            stripe_account_id: 'acct_x',
            onboarding_complete: payoutsEnabled,
            payouts_enabled: payoutsEnabled,
          },
    isLoading,
    isError,
  } as unknown as ReturnType<typeof useClubStripeAccount>);
}

describe('ReviewStep publish gate', () => {
  let onCreateAndPublish: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onCreateAndPublish = vi.fn();
    wizardShowHolder.clubId = 'club-1';
  });

  it('blocks Create & Publish when the club has no payout-enabled account', async () => {
    mockAccount(null);
    const user = userEvent.setup();
    render(<ReviewStep onCreateAndPublish={onCreateAndPublish} />);

    await user.click(screen.getByRole('button', { name: /create & publish/i }));

    expect(onCreateAndPublish).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/payment account/i),
      expect.objectContaining({ action: expect.anything() })
    );
  });

  it('publishes when payouts are enabled', async () => {
    mockAccount(true);
    const user = userEvent.setup();
    render(<ReviewStep onCreateAndPublish={onCreateAndPublish} />);

    await user.click(screen.getByRole('button', { name: /create & publish/i }));

    expect(onCreateAndPublish).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('fails CLOSED when no club is selected (round-11: pill and wizard must agree)', async () => {
    wizardShowHolder.clubId = '';
    mockAccount(true);
    const user = userEvent.setup();
    render(<ReviewStep onCreateAndPublish={onCreateAndPublish} />);

    await user.click(screen.getByRole('button', { name: /create & publish/i }));

    expect(onCreateAndPublish).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/select a club/i));
  });

  it('reports a lookup failure honestly instead of "not connected"', async () => {
    mockAccount(null, false, true);
    const user = userEvent.setup();
    render(<ReviewStep onCreateAndPublish={onCreateAndPublish} />);

    await user.click(screen.getByRole('button', { name: /create & publish/i }));

    expect(onCreateAndPublish).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not check/i));
  });

  it('waits instead of misreporting while the account query is loading', async () => {
    mockAccount(null, true);
    const user = userEvent.setup();
    render(<ReviewStep onCreateAndPublish={onCreateAndPublish} />);

    await user.click(screen.getByRole('button', { name: /create & publish/i }));

    expect(onCreateAndPublish).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
