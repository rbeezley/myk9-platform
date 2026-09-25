import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import TrialConfigurationStep from './TrialConfigurationStep';
import { WizardValidationBanner } from '@/pages/secretary/ShowCreationWizard/WizardValidationBanner';
import { getTrialValidationMessages } from '@/pages/secretary/ShowCreationWizard/showCreationWizardValidation';
import { createWizardTrialView, type TrialNameSource } from '@/utils/wizardTrialNames';

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

function makeTrialView(existingTrials: TrialNameSource[] = []) {
  return createWizardTrialView(
    wizardState.trials.map(trial => ({
      id: trial.id,
      trialDate: trial.dateTime,
      nameOverride: trial.nameOverride,
    })),
    existingTrials
  );
}

function renderTrialConfiguration(
  existingTrials: TrialNameSource[] = [],
  props: Omit<ComponentProps<typeof TrialConfigurationStep>, 'trialView'> = {}
) {
  return render(<TrialConfigurationStep {...props} trialView={makeTrialView(existingTrials)} />);
}

describe('TrialConfigurationStep existing snapshot state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wizardState.trials = [];
  });

  it('shows the read error and an explicit retry instead of false checking copy', () => {
    renderTrialConfiguration([], {
      existingTrialsReady: false,
      existingTrialsReadStatus: 'error',
      existingTrialsReadError: 'Replicated trial read failed',
      onRetryExistingTrials: vi.fn(),
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Replicated trial read failed');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.queryByText(/checking the current trials/i)).not.toBeInTheDocument();
    // Unknown current trials claim neither "first" nor "another" (MYK9-758).
    expect(screen.getAllByRole('button', { name: 'Add Trial' })[0]).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add First Trial' })).not.toBeInTheDocument();
  });

  it('hides a partial local count while the current trials cannot be verified', () => {
    renderTrialConfiguration(
      [{ id: 'saved-trial', name: 'Scent Work Novice', trialDate: '2026-08-01' }],
      {
        existingTrialsReady: false,
        existingTrialsReadStatus: 'error',
        existingTrialsReadError: 'Read failed',
        onRetryExistingTrials: vi.fn(),
      }
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/existing trial/)).not.toBeInTheDocument();
  });

  it('says a single existing trial "exists"', () => {
    renderTrialConfiguration(
      [{ id: 'saved-trial', name: 'Scent Work Novice', trialDate: '2026-08-01' }],
      {
        existingTrialsReady: true,
        existingTrialsReadStatus: 'ready',
      }
    );

    expect(screen.getByText(/already exists\./)).toBeInTheDocument();
  });

  it('wires Retry to the existing snapshot loader', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    renderTrialConfiguration([], {
      existingTrialsReady: false,
      existingTrialsReadStatus: 'error',
      existingTrialsReadError: 'Read failed',
      onRetryExistingTrials: retry,
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows loading copy and keeps Add Trial disabled while retrying', () => {
    renderTrialConfiguration([], {
      existingTrialsReady: false,
      existingTrialsReadStatus: 'loading',
      onRetryExistingTrials: vi.fn(),
    });

    expect(screen.getByRole('status')).toHaveTextContent('Loading the current trials');
    expect(screen.getAllByRole('button', { name: 'Add Trial' })[0]).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add First Trial' })).not.toBeInTheDocument();
    expect(screen.queryByText('Schedule Your Trials')).not.toBeInTheDocument();
    // One message while loading: the status line, no empty-state card.
    expect(screen.getAllByRole('button', { name: 'Add Trial' })).toHaveLength(1);
  });

  it('re-enables Add Trial after a confirmed snapshot recovers', async () => {
    const user = userEvent.setup();
    const { rerender } = renderTrialConfiguration([], {
      existingTrialsReady: false,
      existingTrialsReadStatus: 'error',
      existingTrialsReadError: 'Read failed',
      onRetryExistingTrials: vi.fn(),
    });

    rerender(
      <TrialConfigurationStep
        trialView={makeTrialView()}
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
    const { rerender } = renderTrialConfiguration();

    rerender(
      <TrialConfigurationStep
        trialView={makeTrialView([{ name: 'Scent Work Novice', trialDate: '2026-08-01' }])}
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
    const { rerender } = renderTrialConfiguration();
    expect(screen.getByLabelText('Trial Name *')).toHaveValue('Saturday Trial 1');
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();

    const trialView = makeTrialView([
      { id: 'saved-trial', name: 'Scent Work Novice', trialDate: '2026-08-01' },
    ]);
    rerender(
      <>
        <TrialConfigurationStep trialView={trialView} />
        <WizardValidationBanner
          messages={getTrialValidationMessages(
            [
              {
                id: 'draft-trial',
                dateTime: '2026-08-01T08:00:00',
                eventNumber: '',
                classes: [],
              },
            ],
            trialView,
            'AKC'
          )}
          expanded
          onToggle={vi.fn()}
        />
      </>
    );

    expect(screen.getByLabelText('Trial Name *')).toHaveValue('Saturday Trial 2');
    expect(screen.getByText('Saturday Trial 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Saturday Trial 2' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Saturday Trial 2 type is required');
  });

  it('uses show-level copy for trials already scheduled on another day', () => {
    const { getAllByRole } = renderTrialConfiguration([
      { id: 'saved-sunday', name: 'Sunday Trial 1', trialDate: '2026-08-02' },
    ]);

    expect(getAllByRole('button', { name: 'Add Another Trial' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add First Trial' })).not.toBeInTheDocument();
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

    renderTrialConfiguration();
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

    renderTrialConfiguration();
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

    renderTrialConfiguration();
    await user.click(
      screen.getByRole('button', { name: 'Change trial-draft-trial-dateTime to same day' })
    );

    expect(wizardState.updateTrial).toHaveBeenCalledWith('draft-trial', {
      dateTime: '2026-08-01T10:00:00',
    });
  });
});
