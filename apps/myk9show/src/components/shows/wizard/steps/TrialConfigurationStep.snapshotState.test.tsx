import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrialConfigurationStep from './TrialConfigurationStep';

const wizardState = vi.hoisted(() => ({
  show: {
    name: 'Spring Trial',
    organization: 'AKC',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
  },
  trials: [] as Array<{
    id: string;
    name: string;
    dateTime: string;
    trialType?: string;
    eventNumber: string;
    classes: unknown[];
  }>,
  addTrial: vi.fn(),
  updateTrial: vi.fn(),
  removeTrial: vi.fn(),
}));

vi.mock('@/store/wizardStore', () => ({
  useWizardStore: (selector?: (state: typeof wizardState) => unknown) =>
    selector ? selector(wizardState) : wizardState,
}));

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({ templates: [], isLoading: false, isInitialized: true }),
}));

describe('TrialConfigurationStep existing snapshot state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the read error and an explicit retry instead of false checking copy', () => {
    render(
      <TrialConfigurationStep
        existingTrialsReady={false}
        existingTrialsReadStatus="error"
        existingTrialsReadError="Replicated trial read failed"
        onRetryExistingTrials={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Replicated trial read failed');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.queryByText(/checking the current trials/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add First Trial' })[0]).toBeDisabled();
  });

  it('wires Retry to the existing snapshot loader', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <TrialConfigurationStep
        existingTrialsReady={false}
        existingTrialsReadStatus="error"
        existingTrialsReadError="Read failed"
        onRetryExistingTrials={retry}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows loading copy and keeps Add Trial disabled while retrying', () => {
    render(
      <TrialConfigurationStep
        existingTrialsReady={false}
        existingTrialsReadStatus="loading"
        onRetryExistingTrials={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading the current trials');
    expect(screen.getAllByRole('button', { name: 'Add First Trial' })[0]).toBeDisabled();
  });

  it('re-enables Add Trial after a confirmed snapshot recovers', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TrialConfigurationStep
        existingTrialsReady={false}
        existingTrialsReadStatus="error"
        existingTrialsReadError="Read failed"
        onRetryExistingTrials={vi.fn()}
      />
    );

    rerender(
      <TrialConfigurationStep
        existingTrialsReady
        existingTrialsReadStatus="ready"
        onRetryExistingTrials={vi.fn()}
      />
    );
    const addButtons = screen.getAllByRole('button', { name: 'Add First Trial' });
    expect(addButtons[0]).toBeEnabled();

    await user.click(addButtons[0]);

    expect(wizardState.addTrial).toHaveBeenCalledTimes(1);
  });
});
