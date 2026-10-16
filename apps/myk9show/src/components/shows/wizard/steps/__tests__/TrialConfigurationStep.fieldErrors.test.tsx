import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import TrialConfigurationStep from '../TrialConfigurationStep';
import { createWizardTrialView } from '@/utils/wizardTrialNames';

type TestTrial = {
  id: string;
  nameOverride?: string;
  trialDate: string;
  startTimeDraft?: string;
  trialType?: string;
  eventNumber: string;
  classes: unknown[];
};

const wizardState = vi.hoisted(() => ({
  show: {
    name: 'Spring Trial',
    organization: 'AKC',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
  },
  trials: [] as unknown[],
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

const trial = (over: Partial<TestTrial> & { id: string }): TestTrial => ({
  trialDate: '2026-08-01',
  startTimeDraft: '08:00 AM',
  trialType: 'scent_work',
  eventNumber: 'EVT-1',
  classes: [],
  ...over,
});

function renderStep(trials: TestTrial[], submitted = true) {
  wizardState.trials = trials;
  const trialView = createWizardTrialView(
    trials.map(t => ({ id: t.id, trialDate: t.trialDate, nameOverride: t.nameOverride })),
    []
  );
  return render(<TrialConfigurationStep trialView={trialView} submitted={submitted} />);
}

describe('TrialConfigurationStep: errors sit beside their field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a missing trial type and AKC event number under their own fields, with no summary box', () => {
    renderStep([trial({ id: 't1', trialType: undefined, eventNumber: '' })]);

    const type = screen.getByRole('combobox', { name: /trial type/i });
    const typeCallout = screen.getByText('Please select a trial type');
    expect(type.parentElement).toContainElement(typeCallout);
    expect(type).toHaveAttribute('aria-invalid', 'true');
    expect(type).toHaveAccessibleDescription('Please select a trial type');

    const eventNumber = screen.getByRole('textbox', { name: /event number/i });
    const eventCallout = screen.getByText('Please enter an event number (required for AKC events)');
    expect(eventNumber.parentElement).toContainElement(eventCallout);
    expect(eventNumber).toHaveAttribute('aria-invalid', 'true');

    expect(screen.queryByText(/please fix the following errors/i)).not.toBeInTheDocument();
  });

  it('flags nothing on a complete trial (positive control)', () => {
    renderStep([trial({ id: 't1' })]);

    expect(screen.getByRole('combobox', { name: /trial type/i })).not.toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByRole('textbox', { name: /event number/i })).not.toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("puts a duplicate trial name on the later trial's name field", () => {
    renderStep([
      trial({ id: 't1', nameOverride: 'Saturday' }),
      trial({ id: 't2', nameOverride: 'Saturday', eventNumber: 'EVT-2' }),
    ]);

    const names = screen.getAllByRole('textbox', { name: /trial name/i });
    expect(names[0]).not.toHaveAttribute('aria-invalid', 'true');
    expect(names[1]).toHaveAttribute('aria-invalid', 'true');
    expect(names[1]!.parentElement).toContainElement(
      screen.getByText('Trial names must be unique')
    );
  });

  it('clears the error once the trial type is set', () => {
    const { rerender } = renderStep([trial({ id: 't1', trialType: undefined })]);
    expect(screen.getByText('Please select a trial type')).toBeInTheDocument();

    wizardState.trials = [trial({ id: 't1' })];
    rerender(
      <TrialConfigurationStep
        trialView={createWizardTrialView([{ id: 't1', trialDate: '2026-08-01' }], [])}
        submitted
      />
    );

    expect(screen.queryByText('Please select a trial type')).not.toBeInTheDocument();
  });
});
