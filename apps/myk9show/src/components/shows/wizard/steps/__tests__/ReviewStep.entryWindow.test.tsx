/**
 * MYK9-716: a draft may have no entry window, but publishing requires one.
 * Review is where the wizard asks for it: a missing window is a readiness
 * item that links back to the entry dates, and it never blocks saving the
 * draft.
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
        dateTime: '2026-07-01T09:00:00Z',
        classes: [{ id: 'class-1', judgeId: undefined }],
      },
    ],
    judgeDetails: {},
    markStepCompleted: vi.fn(),
    setCurrentStep,
  }),
}));

describe('ReviewStep entry window readiness (MYK9-716)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entryWindow.open = '';
    entryWindow.close = '';
  });

  it('names a missing window as needed to publish, links back to it, and still saves the draft', async () => {
    const onCreateShow = vi.fn();
    const user = userEvent.setup();
    render(<ReviewStep trialView={trialView} onCreateShow={onCreateShow} />);

    const item = screen.getByTestId('review-entry-window-warning');
    expect(item).toHaveTextContent(/no entry window yet/i);
    expect(item).toHaveTextContent(/can.t be published until/i);
    // A readiness item, not a blocking error.
    expect(screen.queryByText(/please address the following issues/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /set the entry window/i }));
    expect(setCurrentStep).toHaveBeenCalledWith(0);

    await user.click(screen.getByRole('button', { name: /^add show$/i }));
    expect(onCreateShow).toHaveBeenCalledTimes(1);
  });

  it('names a window that closes before it opens', () => {
    entryWindow.open = '2026-06-25T12:00:00.000Z';
    entryWindow.close = '2026-06-01T12:00:00.000Z';
    render(<ReviewStep trialView={trialView} onCreateShow={vi.fn()} />);

    expect(screen.getByTestId('review-entry-window-warning')).toHaveTextContent(
      /entry window needs fixing/i
    );
  });

  it('shows nothing once the window is set', () => {
    entryWindow.open = '2026-06-01T12:00:00.000Z';
    entryWindow.close = '2026-06-25T12:00:00.000Z';
    render(<ReviewStep trialView={trialView} onCreateShow={vi.fn()} />);

    expect(screen.queryByTestId('review-entry-window-warning')).not.toBeInTheDocument();
  });
});
