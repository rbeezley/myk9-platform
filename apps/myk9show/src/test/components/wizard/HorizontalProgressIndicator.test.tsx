import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HorizontalProgressIndicator from '@/components/shows/wizard/components/HorizontalProgressIndicator';

const STEPS = [
  { id: 0, label: 'Show Details', description: 'Basic information' },
  { id: 1, label: 'Trials', description: 'Configure trials' },
  { id: 2, label: 'Classes', description: 'Select from templates' },
  { id: 3, label: 'Review', description: 'Final confirmation' },
];

function renderIndicator(
  props?: Partial<React.ComponentProps<typeof HorizontalProgressIndicator>>
) {
  const onStepClick = vi.fn();
  render(
    <HorizontalProgressIndicator
      steps={STEPS}
      currentStep={props?.currentStep ?? 1}
      completedSteps={props?.completedSteps ?? [0]}
      onStepClick={props?.onStepClick ?? onStepClick}
    />
  );
  return { onStepClick: props?.onStepClick ?? onStepClick };
}

describe('HorizontalProgressIndicator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders every step label', () => {
    renderIndicator();
    for (const step of STEPS) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
  });

  it('marks the current step with aria-current="step"', () => {
    renderIndicator({ currentStep: 1, completedSteps: [0] });
    const current = screen.getByRole('button', { name: 'Trials (current)' });
    expect(current).toHaveAttribute('aria-current', 'step');
  });

  it('labels a completed step as completed', () => {
    renderIndicator({ currentStep: 1, completedSteps: [0] });
    expect(screen.getByRole('button', { name: 'Show Details (completed)' })).toBeInTheDocument();
  });

  it('invokes onStepClick when an unlocked step is activated', async () => {
    const user = userEvent.setup();
    const { onStepClick } = renderIndicator({ currentStep: 1, completedSteps: [0] });
    await user.click(screen.getByRole('button', { name: 'Show Details (completed)' }));
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  it('disables steps that are not yet reachable', () => {
    renderIndicator({ currentStep: 1, completedSteps: [0] });
    // Only step 0 (completed) and step 1 (maxCompleted+1) are reachable;
    // steps 2 and 3 must be disabled so users can't skip ahead.
    expect(screen.getByRole('button', { name: 'Classes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
  });
});
