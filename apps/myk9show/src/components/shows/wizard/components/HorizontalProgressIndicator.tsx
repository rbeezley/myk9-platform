import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: number;
  label: string;
}

interface HorizontalProgressIndicatorProps {
  steps: Step[];
  currentStep: number;
  completedSteps: number[];
  onStepClick?: (step: number) => void;
  className?: string;
}

/**
 * Horizontal step indicator for the Show Creation and Registration wizards.
 *
 * A numbered rail: one row of circles joined by a connector, with a single
 * title under each circle. It is one row at every width from 320px up — the
 * previous two-column card grid gave each label a ~48px box at 1024px and
 * `break-words` then split titles between characters ("Pa"/"ym"/"en"/"t").
 *
 * The title therefore NEVER wraps: it is `truncate` (nowrap + clip + ellipsis)
 * inside a `min-w-0` flex child, so a title too wide for its share of the row
 * is cut with an ellipsis while the full text stays in the step's accessible
 * name. State is carried by the circle (check / ring / number) and by
 * `aria-current` plus the accessible-name suffix — there is no status word and
 * no description line to compete with the title for the row.
 */
export const HorizontalProgressIndicator: React.FC<HorizontalProgressIndicatorProps> = ({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  className,
}) => {
  const isStepCompleted = (stepId: number) => completedSteps.includes(stepId);
  const isStepCurrent = (stepId: number) => currentStep === stepId;
  const isStepClickable = (stepId: number) => {
    if (!onStepClick) return false;
    const firstIncompleteStep = steps.find(step => !isStepCompleted(step.id))?.id;
    return isStepCompleted(stepId) || stepId === firstIncompleteStep;
  };
  const completedCount = new Set(
    completedSteps.filter(step => steps.some(candidate => candidate.id === step))
  ).size;

  return (
    <nav
      className={cn('w-full pb-2 sm:pb-3', className)}
      role="navigation"
      aria-label="Wizard progress"
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-foreground">
          Step {Math.min(currentStep + 1, steps.length)} of {steps.length}
        </span>
        <span className="text-right text-muted-foreground">Complete each step in order</span>
      </div>

      <div
        className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Wizard steps completed"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={completedCount}
        aria-valuetext={`${completedCount} of ${steps.length} steps complete`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${steps.length > 0 ? (completedCount / steps.length) * 100 : 0}%` }}
        />
      </div>

      <div data-testid="wizard-step-list" className="mx-auto w-full max-w-[640px] px-1 pb-1">
        <ol className="flex items-start">
          {steps.map((step, index) => {
            const isCompleted = isStepCompleted(step.id);
            const isCurrent = isStepCurrent(step.id);
            const isClickable = isStepClickable(step.id);
            const isLast = index === steps.length - 1;

            return (
              <li key={step.id} className="relative flex min-w-0 flex-1 flex-col items-center">
                {/* Connector runs between the outer edges of adjacent circles at
                  circle mid-height, so it can never cross a title. The circle is
                  28px, hence the 0.875rem inset on each side. */}
                {!isLast && (
                  <div
                    data-testid={`wizard-step-connector-${step.id}`}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[calc(50%+0.875rem)] top-5 h-0.5 w-[calc(100%-1.75rem)] -translate-y-1/2"
                  >
                    <div className="absolute inset-0 rounded-full bg-border" />
                    <div
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500 ease-out',
                        isCompleted ? 'w-full' : 'w-0'
                      )}
                    />
                  </div>
                )}

                {/* The whole step — circle and title — is one touch target.
                  Future steps stay disabled so the visible path cannot be
                  mistaken for a way to skip required work. */}
                <button
                  type="button"
                  onClick={() => isClickable && onStepClick?.(step.id)}
                  disabled={!isClickable}
                  aria-current={isCurrent ? 'step' : undefined}
                  /* Current WINS over completed: a step the user has gone back
                     to is both, and the name must say where they ARE. The
                     circle still shows the check — history is visual, position
                     is announced. */
                  aria-label={`${step.label}${isCurrent ? ' (current)' : isCompleted ? ' (completed)' : ''}`}
                  className={cn(
                    'relative z-10 flex min-h-[44px] w-full min-w-0 flex-col items-center gap-1.5 rounded-lg px-1 py-1.5',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isClickable ? 'cursor-pointer' : 'cursor-default'
                  )}
                >
                  <span
                    data-testid={`wizard-step-circle-${step.id}`}
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-background transition-colors',
                      isCompleted && 'border-primary bg-primary text-primary-foreground',
                      isCurrent &&
                        !isCompleted &&
                        'border-primary text-primary ring-2 ring-primary/30',
                      !isCompleted && !isCurrent && 'border-border text-muted-foreground'
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" strokeWidth={3} />
                    ) : (
                      <span className="text-xs font-semibold">{index + 1}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'block w-full min-w-0 truncate text-center text-xs font-semibold leading-tight',
                      isCurrent && !isCompleted && 'text-primary',
                      isCompleted && 'text-foreground',
                      !isCompleted && !isCurrent && 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
};

export default HorizontalProgressIndicator;
