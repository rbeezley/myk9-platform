/**
 * MYK9-931 (Codex round 6): clear a trial's start time, jump straight to Review,
 * click Add Show. Review read only the stale `dateTime`, so the show was created
 * with the OLD time while the field showed empty. The typed draft is the single
 * source of truth: Review blocks on it and says which trial.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ReviewStep } from '../ReviewStep';
import { toast } from 'sonner';
import { createWizardTrialView } from '@/utils/wizardTrialNames';

const mocks = vi.hoisted(() => ({ draft: '' as string | undefined }));

const trialView = createWizardTrialView(
  [{ id: 't1', trialDate: '2026-07-01T09:00:00', nameOverride: 'Saturday Trial' }],
  []
);

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useResolvePersonName', () => ({
  useResolvePersonName: () => (id: string) => `Person ${id}`,
}));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ clubs: [{ id: 'club-1', name: 'Test Club' }] }),
}));
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
    trials: [
      {
        id: 't1',
        nameOverride: 'Saturday Trial',
        trialDate: '2026-07-01',
        startTimeDraft: '09:00 AM',
        eventNumber: '1',
        trialType: 'Scent Work',
        ...(mocks.draft !== undefined ? { startTimeDraft: mocks.draft } : {}),
        classes: [{ templateId: 'x', customizations: {} }],
      },
    ],
    judgeDetails: {},
    markStepCompleted: vi.fn(),
    setCurrentStep: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.draft = '';
});

describe('Review blocks on the typed start time', () => {
  it('a cleared start time blocks Add Show and names the trial', async () => {
    const onCreateShow = vi.fn();
    render(<ReviewStep trialView={trialView} onCreateShow={onCreateShow} />);

    expect(screen.getByText(/please enter a start time for saturday trial/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^add show$/i }));
    expect(onCreateShow).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/start time for saturday trial/i)
    );
  });

  it('an invalid start time blocks too', async () => {
    mocks.draft = 'soon';
    const onCreateShow = vi.fn();
    render(<ReviewStep trialView={trialView} onCreateShow={onCreateShow} />);
    expect(screen.getByText(/valid start time for saturday trial/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^add show$/i }));
    expect(onCreateShow).not.toHaveBeenCalled();
  });

  it('a valid typed time does not block', async () => {
    mocks.draft = '10:15 AM';
    const onCreateShow = vi.fn();
    render(<ReviewStep trialView={trialView} onCreateShow={onCreateShow} />);
    await userEvent.click(screen.getByRole('button', { name: /^add show$/i }));
    expect(onCreateShow).toHaveBeenCalled();
  });
});
