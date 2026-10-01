import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { WizardStepContent } from '../WizardStepContent';
import { assertAddClassesCreatesNoTrials } from '../classConfigurationValidation';
import {
  getAllowedWizardSteps,
  getPreviousAllowedStep,
  isWizardStepAllowed,
} from '../show-creation-wizard-types';

vi.mock('@/components/shows/wizard/steps/ShowDetailsStep', () => ({
  default: () => <div data-testid="step-details" />,
}));
vi.mock('@/components/shows/wizard/steps/TrialConfigurationStep', () => ({
  default: () => <div data-testid="step-trials">Add Trial</div>,
}));
vi.mock('@/components/shows/wizard/steps/ClassSelectionStep', () => ({
  default: () => <div data-testid="step-classes" />,
}));
vi.mock('@/components/shows/wizard/steps/ReviewStep', () => ({
  default: () => <div data-testid="step-review" />,
}));

const baseProps = {
  trialView: { effectiveNamesByTrialId: new Map(), persistedTrialCount: 0, hasAnyTrials: true },
  existingTrialsReady: true,
  existingClasses: [],
  hasAttemptedNext: false,
  isLoading: false,
  onCreateShow: vi.fn(),
  onBack: vi.fn(),
};

describe('add-classes step lock', () => {
  it('allows Classes and Review only; other modes allow everything', () => {
    expect(getAllowedWizardSteps({ showId: 's', mode: 'add-classes' })).toEqual([2, 3]);
    expect(getAllowedWizardSteps({ showId: 's', mode: 'add-trials' })).toBeNull();
    expect(getAllowedWizardSteps(undefined)).toBeNull();
    expect(isWizardStepAllowed([2, 3], 1)).toBe(false);
    expect(isWizardStepAllowed(null, 1)).toBe(true);
  });

  it('Back has no destination before Classes in add-classes, and steps back normally elsewhere', () => {
    expect(getPreviousAllowedStep([2, 3], 2)).toBeNull();
    expect(getPreviousAllowedStep([2, 3], 3)).toBe(2);
    expect(getPreviousAllowedStep(null, 2)).toBe(1);
  });

  it('never renders the Trials step (no Add trial control) even if asked for step 1', () => {
    render(
      <WizardStepContent
        {...baseProps}
        currentStep={1}
        editMode={{ showId: 's', mode: 'add-classes' }}
      />
    );
    expect(screen.queryByTestId('step-trials')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Trial')).not.toBeInTheDocument();
    expect(screen.getByTestId('step-classes')).toBeInTheDocument();
  });

  it('still renders Trials in add-trials and create modes (control)', () => {
    const { unmount } = render(
      <WizardStepContent
        {...baseProps}
        currentStep={1}
        editMode={{ showId: 's', mode: 'add-trials' }}
      />
    );
    expect(screen.getByTestId('step-trials')).toBeInTheDocument();
    unmount();
    render(<WizardStepContent {...baseProps} currentStep={1} editMode={undefined} />);
    expect(screen.getByTestId('step-trials')).toBeInTheDocument();
  });

  it('save refuses a wizard trial that is not a stored trial of the show', () => {
    const editMode = { mode: 'add-classes' };
    expect(() => assertAddClassesCreatesNoTrials(editMode, [{ id: 'a' }], ['a'])).not.toThrow();
    expect(() =>
      assertAddClassesCreatesNoTrials(editMode, [{ id: 'a' }, { id: 'new' }], ['a'])
    ).toThrow(/cannot create trials/);
    expect(() =>
      assertAddClassesCreatesNoTrials({ mode: 'add-trials' }, [{ id: 'new' }], [])
    ).not.toThrow();
  });
});
