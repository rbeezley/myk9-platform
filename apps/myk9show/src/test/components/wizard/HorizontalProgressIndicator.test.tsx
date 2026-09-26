import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import HorizontalProgressIndicator from '@/components/shows/wizard/components/HorizontalProgressIndicator';

const STEPS = [
  { id: 0, label: 'Show Details' },
  { id: 1, label: 'Trials' },
  { id: 2, label: 'Classes' },
  { id: 3, label: 'Review' },
];

function renderIndicator(
  props?: Partial<React.ComponentProps<typeof HorizontalProgressIndicator>>
) {
  const onStepClick = vi.fn();
  render(
    <HorizontalProgressIndicator
      steps={props?.steps ?? STEPS}
      currentStep={props?.currentStep ?? 1}
      completedSteps={props?.completedSteps ?? [0]}
      onStepClick={props?.onStepClick ?? onStepClick}
    />
  );
  return { onStepClick: props?.onStepClick ?? onStepClick };
}

describe('HorizontalProgressIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  // A step the exhibitor has gone BACK to is both current and completed. The
  // name must say where they are, not where they have been: "(completed)" on
  // the step you are standing in reads as a different step (Codex #2210 round 6
  // P3). The circle keeps its check — that is the visual history — but the
  // accessible name follows `aria-current`.
  it('calls a revisited completed step current, not completed', () => {
    renderIndicator({ currentStep: 0, completedSteps: [0, 1] });

    const revisited = screen.getByRole('button', { name: 'Show Details (current)' });
    expect(revisited).toHaveAttribute('aria-current', 'step');
    expect(
      screen.queryByRole('button', { name: 'Show Details (completed)' })
    ).not.toBeInTheDocument();
  });

  it('still shows the completed check on a revisited step', () => {
    renderIndicator({ currentStep: 0, completedSteps: [0, 1] });
    expect(screen.getByTestId('wizard-step-circle-0').querySelector('svg')).not.toBeNull();
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

  it('does not make a later step reachable when completed state has a gap', () => {
    renderIndicator({ currentStep: 1, completedSteps: [0, 2] });

    expect(screen.getByRole('button', { name: 'Classes (completed)' })).toBeEnabled();
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

  it('shows the current position and completed progress explicitly', () => {
    renderIndicator({ currentStep: 1, completedSteps: [0] });

    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '1 of 4 steps complete'
    );
    expect(screen.getByText('Complete each step in order')).toBeInTheDocument();
  });

  it('keeps connectors between the outer edges of adjacent circles', () => {
    renderIndicator();
    const connector = screen.getByTestId('wizard-step-connector-0');
    expect(connector.className).toContain('left-[calc(50%+0.875rem)]');
    expect(connector.className).toContain('w-[calc(100%-1.75rem)]');
  });
});

describe('HorizontalProgressIndicator — one row of single-line titles', () => {
  const SIX_STEPS = [
    { id: 0, label: 'Exhibitor' },
    { id: 1, label: 'Dogs' },
    { id: 2, label: 'Classes' },
    { id: 3, label: 'Handler' },
    { id: 4, label: 'Payment' },
    { id: 5, label: 'Confirm' },
  ];

  it('keeps every step label visible without horizontal scrolling', () => {
    render(
      <HorizontalProgressIndicator steps={SIX_STEPS} currentStep={2} completedSteps={[0, 1]} />
    );
    for (const step of SIX_STEPS) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }

    const stepList = screen.getByTestId('wizard-step-list');
    expect(stepList).not.toHaveClass('overflow-x-auto');
    // One row at EVERY width: the two-column grid is what squeezed a title into
    // a ~48px box at 1024px, where `break-words` then split it mid-word.
    const list = stepList.querySelector('ol');
    expect(list).toHaveClass('flex');
    expect(list?.className).not.toContain('grid-cols-2');
    expect(screen.getByText('Exhibitor').closest('li')).toHaveClass('min-w-0');
    expect(screen.getByText('Exhibitor').closest('li')).toHaveClass('flex-1');
  });

  it('truncates a title too wide for its share of the row instead of wrapping it', () => {
    render(
      <HorizontalProgressIndicator
        steps={[
          { id: 0, label: 'Select classes for every dog in the cart' },
          { id: 1, label: 'Payment' },
        ]}
        currentStep={0}
        completedSteps={[]}
      />
    );

    const title = screen.getByText('Select classes for every dog in the cart');
    // jsdom does not lay text out, so assert the mechanism that makes wrapping
    // impossible: nowrap + hidden overflow + ellipsis, inside a min-w-0 box.
    // The rendered geometry is pinned in wizardVisualQA.spec.ts.
    expect(title.className).toContain('truncate');
    expect(title.className).toContain('min-w-0');
    expect(title.closest('li')).toHaveClass('min-w-0');
  });

  it('keeps the full title in the accessible name when it is visually truncated', () => {
    const longTitle = 'Select classes for every dog in the cart';
    render(
      <HorizontalProgressIndicator
        steps={[
          { id: 0, label: longTitle },
          { id: 1, label: 'Payment' },
        ]}
        currentStep={0}
        completedSteps={[]}
      />
    );

    expect(screen.getByRole('button', { name: `${longTitle} (current)` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Payment' })).toBeInTheDocument();
  });

  it('renders no status word and no description beside the title', () => {
    render(
      <HorizontalProgressIndicator steps={SIX_STEPS} currentStep={2} completedSteps={[0, 1]} />
    );

    for (const word of ['Done', 'Current', 'Upcoming']) {
      expect(screen.queryByText(word)).not.toBeInTheDocument();
    }
    // Exactly one text label per step: the title, and nothing else. The step
    // number lives inside the circle, so it is removed from the clone first.
    const stepList = screen.getByTestId('wizard-step-list');
    const buttons = Array.from(stepList.querySelectorAll('button'));
    expect(buttons).toHaveLength(SIX_STEPS.length);
    buttons.forEach((button, index) => {
      const clone = button.cloneNode(true) as HTMLElement;
      clone.querySelector('[data-testid^="wizard-step-circle-"]')?.remove();
      expect(clone.textContent?.trim()).toBe(SIX_STEPS[index]!.label);
    });
  });
});
