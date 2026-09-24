/**
 * MYK9-686: "Do not allow the user to proceed with a misleading or missing
 * location silently." A show saved with location text but no venue pin never
 * appears on the Find Shows map, so Review names that — as a warning, not a
 * blocking error, because a pin is optional and the show is still valid.
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

const { pin, setCurrentStep } = vi.hoisted(() => ({
  pin: { latitude: null as number | null, longitude: null as number | null },
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
      entryOpenDate: '2026-06-01',
      entryCloseDate: '2026-06-25',
      preEntryFee: 30,
      dayOfShowFee: 35,
      location: 'Fairgrounds\n100 Main St, Springfield, IL',
      latitude: pin.latitude,
      longitude: pin.longitude,
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

const WARNING = /no map pin/i;

describe('ReviewStep missing venue pin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pin.latitude = null;
    pin.longitude = null;
  });

  it('warns, without blocking Create, when there is location text but no pin', async () => {
    const onCreateShow = vi.fn();
    const user = userEvent.setup();
    render(<ReviewStep trialView={trialView} onCreateShow={onCreateShow} />);

    const warning = screen.getByTestId('review-missing-pin-warning');
    expect(warning).toHaveTextContent(WARNING);
    expect(warning).toHaveTextContent(
      /this show won.t appear on the Find Shows map\. Go back to Basics and locate the address or click the map\./i
    );
    // A warning, not a blocking error.
    expect(screen.queryByText(/please address the following issues/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /place the map pin/i }));
    expect(setCurrentStep).toHaveBeenCalledWith(0);

    await user.click(screen.getByRole('button', { name: /^add show$/i }));
    expect(onCreateShow).toHaveBeenCalledTimes(1);
  });

  it('shows no warning once the venue has a pin', () => {
    pin.latitude = 39.78;
    pin.longitude = -89.65;
    render(<ReviewStep trialView={trialView} onCreateShow={vi.fn()} />);

    expect(screen.queryByTestId('review-missing-pin-warning')).not.toBeInTheDocument();
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });
});
