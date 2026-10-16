import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { FieldErrorsProvider } from '@/components/forms';
import { createWizardTrialView } from '@/utils/wizardTrialNames';
import {
  fieldErrorsFromIssues,
  getClassValidationIssues,
} from '@/pages/secretary/ShowCreationWizard/showCreationWizardValidation';

const mockUseWizardStore = vi.hoisted(() => vi.fn());

vi.mock('@/store/wizardStore', () => ({ useWizardStore: mockUseWizardStore }));
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({ templates: [], isLoading: false, isInitialized: true }),
}));

import { ClassSelectionStep } from '../ClassSelectionStep';

const klass = {
  templateId: 'tmpl-akc',
  customizations: {
    className: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    displayOrder: 1,
    fieldOverrides: {},
  },
};

const mk = (id: string, name: string, classes: unknown[]) => ({
  id,
  nameOverride: name,
  trialDate: '2026-08-01',
  eventNumber: 'EVT-1',
  trialType: 'scent_work',
  classes,
});

function renderStep(trials: ReturnType<typeof mk>[]) {
  const state = {
    trials,
    updateTrial: vi.fn(),
    show: { organization: 'AKC', judgeIds: [] },
    judgeDetails: {},
    judgeAssignments: {},
    assignJudgeToClass: vi.fn(),
  };
  mockUseWizardStore.mockImplementation((selector: (s: unknown) => unknown) => selector(state));
  const trialView = createWizardTrialView(
    trials.map(t => ({ id: t.id, trialDate: t.trialDate, nameOverride: t.nameOverride })),
    []
  );
  const issues = getClassValidationIssues(trials as never, trialView, 'AKC');
  return render(
    <FieldErrorsProvider errors={fieldErrorsFromIssues(issues)}>
      <ClassSelectionStep trialView={trialView} />
    </FieldErrorsProvider>
  );
}

describe('ClassSelectionStep: a trial with no classes is flagged on its own tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the empty trial under the tabs and marks only its tab invalid', () => {
    renderStep([mk('a', 'Saturday', [klass]), mk('b', 'Sunday', [])]);

    expect(screen.getByRole('tab', { name: /sunday/i })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('tab', { name: /saturday/i })).not.toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByText('Sunday needs at least one class')).toBeInTheDocument();
    expect(screen.queryByText(/please fix the following errors/i)).not.toBeInTheDocument();
  });

  it('flags the first trial when nothing is picked anywhere', () => {
    renderStep([mk('a', 'Saturday', []), mk('b', 'Sunday', [])]);

    expect(screen.getByRole('tab', { name: /saturday/i })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Please add at least one class to the trials')).toBeInTheDocument();
  });

  it('flags nothing once every trial has a class (positive control)', () => {
    renderStep([mk('a', 'Saturday', [klass]), mk('b', 'Sunday', [klass])]);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) expect(tab).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/at least one class/i)).not.toBeInTheDocument();
  });
});
