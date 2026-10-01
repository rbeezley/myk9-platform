/**
 * MYK9-899: add-classes works on a FIXED set of trials, so Show Details and Trials must be
 * unreachable in that mode (adding trials is the separate add-trials mode). Create and
 * add-trials keep every step.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useShowStore } from '@/store/showStore';
import { useWizardStore } from '@/store/wizardStore';
import type { Show } from '@/types/show-types';
import ShowCreationWizardPage from '../ShowCreationWizardPage';

const targetShow = { id: 'show-1', name: 'Spring Trial', organization: 'AKC' } as Show;
let search = 'showId=show-1&mode=add-classes&trialId=trial-1';

vi.mock('@/pages/secretary/ShowCreationWizard/useShowCreationWizardActions', () => ({
  useShowCreationWizardActions: () => ({
    handleSaveDraft: vi.fn(),
    handleCreateShow: vi.fn(),
    handleCreateAndPublish: vi.fn(),
  }),
}));

vi.mock('@/pages/secretary/ShowCreationWizard/WizardStepContent', () => ({
  WizardStepContent: ({ currentStep }: { currentStep: number }) => (
    <div data-testid="step-content">{`step-${currentStep}`}</div>
  ),
}));

vi.mock('qrcode.react', () => ({ QRCodeSVG: () => <svg /> }));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => navigate,
  useSearchParams: () => [new URLSearchParams(search)],
}));

function openAt(step: number) {
  useWizardStore.setState({ currentStep: step, completedSteps: [0, 1, 2].slice(0, step) });
}

describe('wizard step set per edit mode (MYK9-899)', () => {
  beforeEach(() => {
    navigate.mockClear();
    useShowStore.setState({
      shows: [targetShow],
      isLoading: false,
      error: null,
      loadShows: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('add-classes: the store refuses to leave Classes/Review for Show Details or Trials', async () => {
    search = 'showId=show-1&mode=add-classes&trialId=trial-1';
    render(<ShowCreationWizardPage />);
    await waitFor(() => expect(useWizardStore.getState().allowedSteps).toEqual([2, 3]));
    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());
    const stepNow = useWizardStore.getState().currentStep;
    expect([2, 3]).toContain(stepNow);

    useWizardStore.getState().setCurrentStep(1);
    useWizardStore.getState().goToStep(0);
    expect(useWizardStore.getState().currentStep).toBe(stepNow);
  });

  it('add-classes: Back from Classes leaves the wizard instead of reaching Trials', async () => {
    search = 'showId=show-1&mode=add-classes&trialId=trial-1';
    const { user } = render(<ShowCreationWizardPage />);
    await waitFor(() => expect(useWizardStore.getState().allowedSteps).toEqual([2, 3]));
    openAt(2);
    await waitFor(() => expect(screen.getByTestId('step-content')).toHaveTextContent('step-2'));

    // The header's Back and the step navigation's Back; the latter is the step Back.
    const backButtons = screen.getAllByRole('button', { name: /^back$/i });
    await user.click(backButtons[backButtons.length - 1]!);

    expect(useWizardStore.getState().currentStep).toBe(2);
    expect(navigate).toHaveBeenCalledWith('/shows/show-1/trials/trial-1');
  });

  it('add-classes: the step rail has no clickable Show Details or Trials step', async () => {
    search = 'showId=show-1&mode=add-classes&trialId=trial-1';
    render(<ShowCreationWizardPage />);
    await waitFor(() => expect(useWizardStore.getState().allowedSteps).toEqual([2, 3]));
    const rail = screen.getByTestId('wizard-step-list');
    expect(rail.querySelectorAll('button:not([disabled])')).toHaveLength(0);
  });

  it('add-trials keeps every step (control)', async () => {
    search = 'showId=show-1&mode=add-trials';
    render(<ShowCreationWizardPage />);
    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());
    expect(useWizardStore.getState().allowedSteps).toBeNull();
    useWizardStore.setState({ currentStep: 2, completedSteps: [0, 1] });
    useWizardStore.getState().setCurrentStep(1);
    expect(useWizardStore.getState().currentStep).toBe(1);
  });
});
