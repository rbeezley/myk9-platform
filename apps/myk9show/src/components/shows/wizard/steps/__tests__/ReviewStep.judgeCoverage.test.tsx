/**
 * F5 — the Review summary tile was labelled "Judges Assigned" and counted unique
 * judges USED over judges ADDED. Two classes sharing one judge read "1/1", and a
 * show with judges added but no class assignments read "0/0" — both of which look
 * complete while classes sit uncovered. The adjacent line ("n of m classes need
 * judges") was already correct, so the page contradicted itself.
 *
 * The tile must count the thing that has to be covered: classes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ReviewStep } from '../ReviewStep';
import { useClubStripeAccount } from '@/features/payments/useClubStripeAccount';

vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripeAccount: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useResolvePersonName', () => ({
  useResolvePersonName: () => (id: string) => `Person ${id}`,
}));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ clubs: [{ id: 'club-1', name: 'Test Club' }] }),
}));

// Two classes, ONE judge covering BOTH. The old tile read "1/1" (one judge used of
// one added) — indistinguishable from full coverage by coincidence.
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
      judgeIds: ['judge-1'],
      officials: { chairman: ['p-1'], secretary: ['p-2'] },
    },
    trials: [
      {
        id: 'trial-1',
        name: 'Trial 1',
        dateTime: '2026-07-01T08:00:00.000Z',
        classes: [
          { id: 'c1', name: 'Interior Novice A', judgeId: 'judge-1' },
          { id: 'c2', name: 'Interior Novice B', judgeId: undefined },
        ],
      },
    ],
    judgeDetails: { 'judge-1': { name: 'Test Judge' } },
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

describe('ReviewStep — judge coverage tile', () => {
  it('counts classes covered, not judges used', () => {
    render(<ReviewStep />);

    const tile = screen.getByText(/classes with a judge/i).closest('div') as HTMLElement;
    // One of two classes has a judge.
    expect(within(tile).getByText('1')).toBeInTheDocument();
    expect(within(tile).getByText('/2')).toBeInTheDocument();
  });

  it('does not present the old judges-used-over-judges-added ratio as the headline', () => {
    render(<ReviewStep />);
    // The old label stated coverage it was not measuring.
    expect(screen.queryByText(/^judges assigned$/i)).not.toBeInTheDocument();
  });

  it('still reports how many judges were added, as a secondary detail', () => {
    render(<ReviewStep />);
    expect(screen.getByText(/1 judge of 1 judge added/i)).toBeInTheDocument();
  });
});
