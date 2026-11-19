/**
 * MYK9-716, MYK9-2198: a draft may be saved without being ready to publish. Review shows the one
 * "Before you can publish" list: the club's lines from the server plus the lines the draft
 * itself decides (premium, entry dates). It links back to the entry dates and never blocks
 * saving the draft.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ReviewStep } from '../ReviewStep';
import { createWizardTrialView } from '@/utils/wizardTrialNames';

const trialView = createWizardTrialView(
  [{ id: 'trial-1', nameOverride: 'Trial 1', trialDate: '2026-07-01T09:00:00Z' }],
  []
);

const { entryWindow, setCurrentStep } = vi.hoisted(() => ({
  entryWindow: { open: '', close: '' },
  setCurrentStep: vi.fn(),
}));

vi.mock('@/features/publishing/usePublishBlockers', () => ({
  useClubPublishBlockers: () => ({ status: 'ready', blockers: [] }),
}));
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
      entryOpenDate: entryWindow.open,
      entryCloseDate: entryWindow.close,
      preEntryFee: 30,
      dayOfShowFee: 35,
      location: 'Fairgrounds',
      latitude: 39.78,
      longitude: -89.65,
      clubId: 'club-1',
      judgeIds: [],
      officials: { chairman: ['p-1'], secretary: ['p-2'], steward: [] },
    },
    trials: [
      {
        id: 'trial-1',
        nameOverride: 'Trial 1',
        trialDate: '2026-07-01',
        startTimeDraft: '09:00 AM',
        classes: [{ id: 'class-1', judgeId: undefined }],
      },
    ],
    judgeDetails: {},
    markStepCompleted: vi.fn(),
    setCurrentStep,
  }),
}));

describe('ReviewStep publish blockers (MYK9-2198)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entryWindow.open = '';
    entryWindow.close = '';
  });

  it('lists a missing window, links back to it, and still saves the draft', async () => {
    const onCreateShow = vi.fn();
    const user = userEvent.setup();
    render(<ReviewStep trialView={trialView} onCreateShow={onCreateShow} />);

    const list = screen.getByTestId('publish-blockers');
    expect(list).toHaveTextContent('Before you can publish');
    expect(list).toHaveTextContent('Set when entries open and close.');
    // A readiness list, not a blocking error.
    expect(screen.queryByText(/please address the following issues/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /fix it: set when entries open/i }));
    expect(setCurrentStep).toHaveBeenCalledWith(0);

    await user.click(screen.getByRole('button', { name: /^add show$/i }));
    expect(onCreateShow).toHaveBeenCalledTimes(1);
  });

  it('lists a window that closes before it opens', () => {
    entryWindow.open = '2026-06-25T12:00:00.000Z';
    entryWindow.close = '2026-06-01T12:00:00.000Z';
    render(<ReviewStep trialView={trialView} onCreateShow={vi.fn()} />);

    expect(screen.getByTestId('publish-blockers')).toHaveTextContent(
      'Entries have to open before they close.'
    );
  });

  it('has no dates line for a same-day window whose close time is earlier than its open time', () => {
    entryWindow.open = new Date(2026, 5, 20, 20, 0).toISOString();
    entryWindow.close = new Date(2026, 5, 20, 8, 0).toISOString();
    render(<ReviewStep trialView={trialView} onCreateShow={vi.fn()} />);

    expect(screen.queryByText(/Set when entries open/)).not.toBeInTheDocument();
    expect(screen.queryByText(/open before they close/)).not.toBeInTheDocument();
  });

  it('still lists the premium for a new show once the window is set, and no dates line', () => {
    entryWindow.open = '2026-06-01T12:00:00.000Z';
    entryWindow.close = '2026-06-25T12:00:00.000Z';
    render(<ReviewStep trialView={trialView} onCreateShow={vi.fn()} />);

    const list = screen.getByTestId('publish-blockers');
    expect(list).toHaveTextContent('Publish the premium list');
    expect(list).not.toHaveTextContent('Set when entries open');
  });
});
