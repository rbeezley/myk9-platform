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
  WizardStepContent: ({
    currentStep,
    focusTrialId,
  }: {
    currentStep: number;
    focusTrialId?: string | null;
  }) => (
    <div data-testid="step-content">{`step-${currentStep} focus-${focusTrialId ?? 'none'}`}</div>
  ),
}));

const trialsRead = vi.hoisted(() => ({
  value: { ready: true, readStatus: 'ready', readError: null, retry: undefined } as {
    ready: boolean;
    readStatus: string;
    readError: string | null;
    retry: undefined;
  },
}));
vi.mock('@/pages/secretary/ShowCreationWizard/useAddTrialsExistingTrials', () => ({
  useAddTrialsExistingTrials: () => trialsRead.value,
}));

const storedClasses = vi.hoisted(() => ({
  value: [] as { trialId: string; element: string; level: string; section: string }[],
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: storedClasses.value }),
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
    trialsRead.value = { ready: true, readStatus: 'ready', readError: null, retry: undefined };
    storedClasses.value = [];
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

  async function backFromClasses(trialIdsInShow: string[]) {
    const { user } = render(<ShowCreationWizardPage />);
    await waitFor(() => expect(useWizardStore.getState().allowedSteps).toEqual([2, 3]));
    openAt(2);
    useWizardStore.setState({
      trials: trialIdsInShow.map(id => ({
        id,
        trialDate: '',
        eventNumber: '',
        classes: [],
      })) as never,
    });
    await waitFor(() => expect(screen.getByTestId('step-content')).toHaveTextContent('step-2'));

    // The header's Back and the step navigation's Back; the latter is the step Back.
    const backButtons = screen.getAllByRole('button', { name: /^back$/i });
    await user.click(backButtons[backButtons.length - 1]!);
    expect(useWizardStore.getState().currentStep).toBe(2);
  }

  it("add-classes: Back from Classes leaves to the launching trial when it is the show's", async () => {
    search = 'showId=show-1&mode=add-classes&trialId=trial-1';
    await backFromClasses(['trial-1', 'trial-2']);
    expect(screen.getByTestId('step-content')).toHaveTextContent('focus-trial-1');
    expect(navigate).toHaveBeenCalledWith('/shows/show-1/trials/trial-1');
  });

  it('add-classes: a deleted or foreign trialId falls back everywhere (picker and Back)', async () => {
    search = 'showId=show-1&mode=add-classes&trialId=gone';
    await backFromClasses(['trial-1', 'trial-2']);
    expect(screen.getByTestId('step-content')).toHaveTextContent('focus-none');
    expect(navigate).toHaveBeenCalledWith('/shows/show-1');
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

  it('add-classes: shows the loading state, not "No Trials Configured", until trials are loaded', async () => {
    search = 'showId=show-1&mode=add-classes&trialId=trial-1';
    trialsRead.value = { ready: false, readStatus: 'loading', readError: null, retry: undefined };
    render(<ShowCreationWizardPage />);
    expect(await screen.findByText(/loading this show’s trials/i)).toBeInTheDocument();
    expect(screen.queryByTestId('step-content')).not.toBeInTheDocument();
  });

  it('add-classes: moving to another show by query string re-gates and drops show A state', async () => {
    const showB = { id: 'show-2', name: 'Other', organization: 'AKC' } as Show;
    useShowStore.setState({ shows: [targetShow, showB] });
    search = 'showId=show-1&mode=add-classes';
    const { rerender } = render(<ShowCreationWizardPage />);
    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    // Show B's trials are not loaded yet. Show A's draft must not be on screen.
    search = 'showId=show-2&mode=add-classes';
    trialsRead.value = { ready: false, readStatus: 'loading', readError: null, retry: undefined };
    rerender(<ShowCreationWizardPage />);
    expect(await screen.findByText(/loading this show’s trials/i)).toBeInTheDocument();
    expect(screen.queryByTestId('step-content')).not.toBeInTheDocument();

    trialsRead.value = { ready: true, readStatus: 'ready', readError: null, retry: undefined };
    rerender(<ShowCreationWizardPage />);
    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());
  });

  describe('leaving add-classes: one definition of unsaved work', () => {
    const cls = (element: string) => ({
      templateId: 't',
      customizations: { className: element, element, level: 'Novice', section: 'A' },
    });
    async function openWithClasses(classes: ReturnType<typeof cls>[]) {
      search = 'showId=show-1&mode=add-classes&trialId=trial-1';
      storedClasses.value = [
        { trialId: 'trial-1', element: 'Container', level: 'Novice', section: 'A' },
      ];
      const view = render(<ShowCreationWizardPage />);
      await waitFor(() => expect(useWizardStore.getState().allowedSteps).toEqual([2, 3]));
      openAt(2);
      // The class step auto-assigning a lone judge marks the store dirty; nothing is selected.
      useWizardStore.setState({
        isDirty: true,
        trials: [{ id: 'trial-1', trialDate: '', eventNumber: '', classes }] as never,
      });
      await waitFor(() => expect(screen.getByTestId('step-content')).toHaveTextContent('step-2'));
      return view;
    }

    it('Back and Close leave without a dialog when only stored classes are present', async () => {
      const { user } = await openWithClasses([cls('Container')]);
      const backButtons = screen.getAllByRole('button', { name: /^back$/i });
      await user.click(backButtons[0]!); // header Back (Close)
      expect(navigate).toHaveBeenCalledWith('/shows/show-1/trials/trial-1');
      expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
      navigate.mockClear();
      await user.click(backButtons[backButtons.length - 1]!); // step Back
      expect(navigate).toHaveBeenCalledWith('/shows/show-1/trials/trial-1');
      expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
    });

    it('asks first when a new class is selected', async () => {
      const { user } = await openWithClasses([cls('Container'), cls('Interior')]);
      const backButtons = screen.getAllByRole('button', { name: /^back$/i });
      await user.click(backButtons[backButtons.length - 1]!);
      expect(await screen.findByText('Unsaved Changes')).toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
