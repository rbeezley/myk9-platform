/**
 * The Review step computed blocking errors, rendered them in a red card, and
 * then let all three buttons fire anyway — while a green "Show Configuration
 * Complete" card sat directly beneath the red one, unconditionally. For a
 * nameless show it read `"" ready with 0 trials and 0 classes`.
 *
 * The refusal is deliberately EXPLAINED rather than a disabled button: an
 * earlier attempt at this fix disabled the buttons instead, which silently
 * short-circuited the round-11 publish gate and its money-aware messaging.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ReviewStep } from '../ReviewStep';
import { useClubStripeAccount } from '@/features/payments/useClubStripeAccount';
import { toast } from 'sonner';

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

// A club IS selected, so the publish path reaches the blocking-errors guard
// rather than stopping at the club check. No trials => a real blocking error.
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
      clubId: 'club-1',
      judgeIds: [],
      officials: { chairman: ['p-1'], secretary: ['p-2'] },
    },
    trials: [],
    judgeDetails: {},
    markStepCompleted: vi.fn(),
    setCurrentStep: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useClubStripeAccount).mockReturnValue({
    data: {
      id: 'csa-1',
      club_id: 'club-1',
      stripe_account_id: 'acct_x',
      onboarding_complete: true,
      payouts_enabled: true,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useClubStripeAccount>);
});

describe('ReviewStep — blocking errors must actually block', () => {
  it('does not claim the configuration is complete while errors are listed', () => {
    render(<ReviewStep />);

    expect(screen.getByText(/at least one trial is required/i)).toBeInTheDocument();
    expect(screen.queryByText(/show configuration complete/i)).not.toBeInTheDocument();
  });

  it('refuses the unpublished create and says why', async () => {
    const onCreateShow = vi.fn();
    render(<ReviewStep onCreateShow={onCreateShow} />);

    await userEvent.click(screen.getByRole('button', { name: /create show \(unpublished\)/i }));

    expect(onCreateShow).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/at least one trial is required/i)
    );
  });

  it('refuses publish for the same reason, with the club already selected', async () => {
    const onCreateAndPublish = vi.fn();
    render(<ReviewStep onCreateAndPublish={onCreateAndPublish} />);

    await userEvent.click(screen.getByRole('button', { name: /create & publish show/i }));

    expect(onCreateAndPublish).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/at least one trial is required/i)
    );
  });

  it('still allows Save as Draft — a draft IS the incomplete state', async () => {
    const onSaveDraft = vi.fn();
    render(<ReviewStep onSaveDraft={onSaveDraft} />);

    await userEvent.click(screen.getByRole('button', { name: /save as draft/i }));

    expect(onSaveDraft).toHaveBeenCalled();
  });
});
