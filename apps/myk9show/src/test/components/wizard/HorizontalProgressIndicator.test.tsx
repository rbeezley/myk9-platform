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

  it('makes the whole step (including the label) the hit target', async () => {
    const user = userEvent.setup();
    const { onStepClick } = renderIndicator({ currentStep: 1, completedSteps: [0] });
    // Click the visible label text, not the circle — the label must live inside
    // the button so the touch area isn't just the 28px circle.
    const label = screen.getByText('Show Details');
    expect(label.closest('button')).not.toBeNull();
    await user.click(label);
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  it('gives each step a >=44px-tall, full-width hit area (touch-target guardrail)', () => {
    renderIndicator({ currentStep: 1, completedSteps: [0] });
    const button = screen.getByRole('button', { name: 'Trials (current)' });
    expect(button.className).toContain('min-h-[44px]');
    expect(button.className).toContain('w-full');
  });
});

describe('HorizontalProgressIndicator — many steps (mobile compaction)', () => {
  const SIX_STEPS = [
    { id: 0, label: 'Exhibitor' },
    { id: 1, label: 'Dogs' },
    { id: 2, label: 'Classes' },
    { id: 3, label: 'Handler' },
    { id: 4, label: 'Payment' },
    { id: 5, label: 'Confirm' },
  ];

  it('keeps the current label visible but hides the rest on mobile when >4 steps', () => {
    render(
      <HorizontalProgressIndicator steps={SIX_STEPS} currentStep={2} completedSteps={[0, 1]} />
    );
    // Current step's label is always shown.
    expect(screen.getByText('Classes').className).not.toContain('hidden');
    // A non-current label is hidden on mobile, revealed at sm:.
    const other = screen.getByText('Payment');
    expect(other.className).toContain('hidden');
    expect(other.className).toContain('sm:block');
  });

  it('keeps every label visible when there are 4 or fewer steps', () => {
    render(<HorizontalProgressIndicator steps={STEPS} currentStep={1} completedSteps={[0]} />);
    // No mobile-hide class on a non-current label at <=4 steps.
    expect(screen.getByText('Show Details').className).not.toContain('hidden');
  });
});
