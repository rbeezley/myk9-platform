import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: number;
  label: string;
  description?: string;
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
 * Renders steps in a high-contrast navigator that wraps through tablet widths
 * so every required step name stays readable without asking exhibitors to
 * discover a horizontal scroll area.
 *
 * On phones and tablets the step cards use a two-column grid. On desktop they
 * return to a single row. Descriptions stay secondary on phones, while the
 * current, completed, and upcoming states remain explicit at every width.
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

      <div data-testid="wizard-step-list" className="px-1 pb-2">
        <ol className="grid grid-cols-2 items-stretch gap-2 sm:gap-3 lg:flex">
          {steps.map((step, index) => {
            const isCompleted = isStepCompleted(step.id);
            const isCurrent = isStepCurrent(step.id);
            const isClickable = isStepClickable(step.id);
            const isLast = index === steps.length - 1;
            const statusLabel = isCompleted ? 'Done' : isCurrent ? 'Current' : 'Upcoming';

            return (
              <li key={step.id} className="relative flex min-w-0 flex-1 flex-col items-center">
                {/* Connecting line bridges the outer edges of adjacent circles.
                  Starting at the edge keeps it out of translucent inactive
                  circles, where a center-to-center line would show through. */}
                {!isLast && (
                  <div
                    data-testid={`wizard-step-connector-${step.id}`}
                    className="absolute left-[calc(50%+0.875rem)] top-8 hidden h-0.5 w-[calc(100%-1.75rem)] -translate-y-1/2 lg:block"
                  >
                    <div className="absolute inset-0 rounded-full bg-border/40" />
                    <div
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500 ease-out',
                        isCompleted ? 'w-full' : 'w-0'
                      )}
                    />
                  </div>
                )}

                {/* The whole step card is one touch target. Future steps remain
                  disabled so the visible path cannot be mistaken for a way to
                  skip required work. */}
                <button
                  type="button"
                  onClick={() => isClickable && onStepClick?.(step.id)}
                  disabled={!isClickable}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`${step.label}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
                  className={cn(
                    'group/step relative z-10 flex min-h-[64px] w-full flex-col justify-center rounded-xl border px-3 py-2 text-left',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isClickable ? 'cursor-pointer' : 'cursor-default',
                    isCompleted && 'border-primary/50 bg-primary/5',
                    isCurrent &&
                      !isCompleted &&
                      'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20',
                    !isCompleted && !isCurrent && 'border-border bg-muted/20'
                  )}
                >
                  <span className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span
                      className={cn('flex min-w-0 items-center gap-2', isCurrent && 'text-primary')}
                    >
                      {/* Step circle (visual only) */}
                      <span
                        data-testid={`wizard-step-circle-${step.id}`}
                        className={cn(
                          'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          isCompleted && 'border-primary bg-primary text-primary-foreground',
                          isCurrent && !isCompleted && 'border-primary bg-background text-primary',
                          !isCompleted &&
                            !isCurrent &&
                            'border-border bg-background text-muted-foreground'
                        )}
                      >
                        {isCompleted ? (
                          <Check className="h-4 w-4" strokeWidth={3} />
                        ) : (
                          <span className="text-xs font-semibold">{index + 1}</span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={cn(
                            'block whitespace-normal break-words text-sm font-semibold',
                            isCompleted && 'text-foreground',
                            !isCompleted && !isCurrent && 'text-muted-foreground'
                          )}
                        >
                          {step.label}
                        </span>
                        {step.description && (
                          <span className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">
                            {step.description}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {statusLabel}
                    </span>
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
