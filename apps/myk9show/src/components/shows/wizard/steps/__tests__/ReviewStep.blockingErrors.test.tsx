/**
 * The Review step computed blocking errors, rendered them in a red card, and
 * then let its creation buttons fire anyway — while a green "Show Configuration
 * Complete" card sat directly beneath the red one, unconditionally. For a
 * nameless show it read `"" ready with 0 trials and 0 classes`.
 *
 * The refusal is deliberately EXPLAINED rather than a disabled button: an
 * disabled button would give the secretary no explanation or route to recovery.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ReviewStep } from '../ReviewStep';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/hooks/useResolvePersonName', () => ({
  useResolvePersonName: () => (id: string) => `Person ${id}`,
}));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ clubs: [{ id: 'club-1', name: 'Test Club' }] }),
}));

// No trials => a real blocking error.
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
});

describe('ReviewStep — blocking errors must actually block', () => {
  it('does not claim the configuration is complete while errors are listed', () => {
    render(<ReviewStep />);

    expect(screen.getByText(/at least one trial is required/i)).toBeInTheDocument();
    expect(screen.queryByText(/show configuration complete/i)).not.toBeInTheDocument();
  });

  it('refuses create and says why', async () => {
    const onCreateShow = vi.fn();
    render(<ReviewStep onCreateShow={onCreateShow} />);

    await userEvent.click(screen.getByRole('button', { name: /^create show$/i }));

    expect(onCreateShow).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/at least one trial is required/i)
    );
  });
});
