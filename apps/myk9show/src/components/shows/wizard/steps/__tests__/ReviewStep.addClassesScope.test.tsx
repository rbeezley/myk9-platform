/**
 * MYK9-899: add-classes saves classes onto an EXISTING show whose Basics/Trials steps are
 * unreachable. Review must therefore evaluate only the class rules there: a show missing
 * officials, venue, club and entry window must still be able to save new classes (a dead end
 * otherwise). Create mode keeps every requirement (control).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ReviewStep } from '../ReviewStep';
import { toast } from 'sonner';
import { createWizardTrialView } from '@/utils/wizardTrialNames';

const trialView = createWizardTrialView([], []);

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useResolvePersonName', () => ({
  useResolvePersonName: () => (id: string) => `Person ${id}`,
}));
vi.mock('@/store/clubStore', () => ({ useClubStore: () => ({ clubs: [] }) }));

// A show with none of the creation-time requirements: no name, venue, club, officials, entry
// window (dates stay valid: Review formats them for display). One trial with one new class.
vi.mock('@/store/wizardStore', () => ({
  useWizardStore: () => ({
    show: {
      name: '',
      organization: 'AKC',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      entryOpenDate: '',
      entryCloseDate: '',
      preEntryFee: 0,
      dayOfShowFee: 0,
      location: '',
      clubId: '',
      judgeIds: [],
      officials: { chairman: [], secretary: [] },
    },
    trials: [
      {
        id: 'trial-1',
        dateTime: '2026-07-01T08:00:00',
        eventNumber: '',
        classes: [
          {
            templateId: 't',
            customizations: { className: 'Container Novice A', element: 'Container' },
          },
        ],
      },
    ],
    judgeDetails: {},
    markStepCompleted: vi.fn(),
    setCurrentStep: vi.fn(),
    allowedSteps: [2, 3],
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReviewStep scope', () => {
  it('class-selection scope: nothing about the show can block saving new classes', async () => {
    const onCreateShow = vi.fn();
    render(
      <ReviewStep trialView={trialView} onCreateShow={onCreateShow} scope="class-selection" />
    );

    expect(screen.queryByText(/please address the following/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^add show$/i }));
    expect(onCreateShow).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    // No dead-end links to unreachable steps.
    expect(screen.queryByText(/set the entry window/i)).not.toBeInTheDocument();
  });

  it('full scope still blocks on the same show (control)', async () => {
    const onCreateShow = vi.fn();
    render(<ReviewStep trialView={trialView} onCreateShow={onCreateShow} />);

    await userEvent.click(screen.getByRole('button', { name: /^add show$/i }));
    expect(onCreateShow).not.toHaveBeenCalled();
    expect(screen.getByText(/show name is required/i)).toBeInTheDocument();
  });
});

describe('ReviewStep official labels', () => {
  it('labels the chairman line "Chair"', () => {
    render(<ReviewStep trialView={trialView} onCreateShow={vi.fn()} />);

    expect(screen.getByText('Chair')).toBeInTheDocument();
    expect(screen.queryByText('Chairman')).not.toBeInTheDocument();
  });
});
