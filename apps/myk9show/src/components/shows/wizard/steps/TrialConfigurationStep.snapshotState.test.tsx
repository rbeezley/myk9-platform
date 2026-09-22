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
    nameOverride?: string;
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

vi.mock('@/components/ui/date-time-picker', () => ({
  DateTimePicker: ({
    id,
    onChange,
  }: {
    id?: string;
    onChange?: (date: Date | undefined) => void;
  }) => (
    <>
      <button
        type="button"
        aria-label={`Change ${id} to same day`}
        onClick={() => onChange?.(new Date(2026, 7, 1, 10))}
      >
        Same-day time
      </button>
      <button
        type="button"
        aria-label={`Change ${id} to next day`}
        onClick={() => onChange?.(new Date(2026, 7, 2, 10))}
      >
        Next-day date
      </button>
    </>
  ),
}));

describe('TrialConfigurationStep existing snapshot state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wizardState.trials = [];
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

  it('uses the latest existing-trial snapshot when creating a trial', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TrialConfigurationStep existingTrials={[]} />);

    rerender(
      <TrialConfigurationStep
        existingTrials={[{ name: 'Scent Work Novice', trialDate: '2026-08-01' }]}
      />
    );
    await user.click(screen.getAllByRole('button', { name: 'Add Another Trial' })[0]);

    expect(wizardState.addTrial).toHaveBeenCalledWith(
      expect.objectContaining({ nameOverride: undefined })
    );
  });

  it('shows a new generated name when the latest persisted snapshot changes', () => {
    wizardState.trials = [
      {
        id: 'draft-trial',
        dateTime: '2026-08-01T08:00:00',
        eventNumber: '',
        classes: [],
      },
    ];
    const { rerender } = render(<TrialConfigurationStep existingTrials={[]} />);
    expect(screen.getByLabelText('Trial Name *')).toHaveValue('Saturday Trial 1');

    rerender(
      <TrialConfigurationStep
        existingTrials={[{ id: 'saved-trial', name: 'Scent Work Novice', trialDate: '2026-08-01' }]}
      />
    );

    expect(screen.getByLabelText('Trial Name *')).toHaveValue('Saturday Trial 2');
  });

  it('restores the suggested name when a custom override is cleared', async () => {
    const user = userEvent.setup();
    wizardState.trials = [
      {
        id: 'draft-trial',
        nameOverride: 'Custom Saturday Trial',
        dateTime: '2026-08-01T08:00:00',
        eventNumber: '',
        classes: [],
      },
    ];

    render(<TrialConfigurationStep />);
    expect(screen.getByLabelText('Trial Name *')).toHaveValue('Custom Saturday Trial');
    await user.click(screen.getByRole('button', { name: 'Use suggested name' }));

    expect(wizardState.updateTrial).toHaveBeenCalledWith('draft-trial', {
      nameOverride: undefined,
    });
  });

  it('updates only the date when a generated trial moves to another day', async () => {
    const user = userEvent.setup();
    wizardState.trials = [
      {
        id: 'draft-trial',
        dateTime: '2026-08-01T08:00:00',
        eventNumber: '',
        classes: [],
      },
    ];

    render(<TrialConfigurationStep />);
    await user.click(
      screen.getByRole('button', { name: 'Change trial-draft-trial-dateTime to next day' })
    );

    expect(wizardState.updateTrial).toHaveBeenCalledWith('draft-trial', {
      dateTime: '2026-08-02T10:00:00',
    });
  });

  it('keeps an auto-generated name when only the time changes', async () => {
    const user = userEvent.setup();
    wizardState.trials = [
      {
        id: 'draft-trial',
        dateTime: '2026-08-01T08:00:00',
        eventNumber: '',
        classes: [],
      },
    ];

    render(<TrialConfigurationStep />);
    await user.click(
      screen.getByRole('button', { name: 'Change trial-draft-trial-dateTime to same day' })
    );

    expect(wizardState.updateTrial).toHaveBeenCalledWith('draft-trial', {
      dateTime: '2026-08-01T10:00:00',
    });
  });
});
