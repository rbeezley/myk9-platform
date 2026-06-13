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
 * Renders steps left-to-right across a thin top bar so the form below gets the
 * full content width — a one-axis layout that doesn't compete with the app
 * shell's left rail for horizontal space.
 *
 * Mobile: with more than 4 steps (the registration wizard's secretary/mail-in
 * flows run up to 6), only the CURRENT step keeps its label on phones so the
 * circles don't crowd; the rest reappear at sm:. Descriptions are always sm:+.
 */
export const HorizontalProgressIndicator: React.FC<HorizontalProgressIndicatorProps> = ({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  className,
}) => {
  // Many steps can't fit labeled columns on a 375px phone — collapse labels to
  // the active step only on mobile when the count is high.
  const manySteps = steps.length > 4;
  const isStepCompleted = (stepId: number) => completedSteps.includes(stepId);
  const isStepCurrent = (stepId: number) => currentStep === stepId;
  const isStepClickable = (stepId: number) => {
    if (!onStepClick) return false;
    const maxCompleted = completedSteps.length > 0 ? Math.max(...completedSteps) : -1;
    return isStepCompleted(stepId) || stepId <= maxCompleted + 1;
  };

  return (
    <nav className={cn('w-full', className)} role="navigation" aria-label="Wizard progress">
      <ol className="flex items-start">
        {steps.map((step, index) => {
          const isCompleted = isStepCompleted(step.id);
          const isCurrent = isStepCurrent(step.id);
          const isClickable = isStepClickable(step.id);
          const isLast = index === steps.length - 1;

          return (
            <li key={step.id} className="relative flex flex-1 flex-col items-center">
              {/* Connecting line to the next step — spans from this circle's
                  center (left-1/2) one full item-width to the next center. */}
              {!isLast && (
                <div className="absolute left-1/2 top-3.5 h-0.5 w-full -translate-y-1/2">
                  <div className="absolute inset-0 rounded-full bg-border/40" />
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500 ease-out',
                      isCompleted ? 'w-full' : 'w-0'
                    )}
                  />
                </div>
              )}

              {/* The whole step (circle + label + description) is one tall,
                  full-width button so the touch target clears the 44px
                  guardrail — the 28px circle alone did not, and the label sat
                  outside any hit area. The circle is now a visual <span>; a
                  <button> may not legally contain <div>/<p>. */}
              <button
                type="button"
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${step.label}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
                className={cn(
                  'group/step relative z-10 flex min-h-[44px] w-full flex-col items-center gap-2 rounded-lg px-1 pb-1',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isClickable ? 'cursor-pointer' : 'cursor-default'
                )}
              >
                {/* Step circle (visual only) */}
                <span
                  className={cn(
                    'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
                    isCompleted && 'bg-primary border-primary text-primary-foreground shadow-md',
                    isCurrent &&
                      !isCompleted &&
                      'bg-primary/10 border-primary text-primary shadow-sm ring-4 ring-primary/20',
                    !isCompleted && !isCurrent && 'bg-muted/50 border-border text-muted-foreground',
                    isClickable && 'group-hover/step:scale-110 group-hover/step:shadow-lg'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    <span className="text-xs font-semibold">{index + 1}</span>
                  )}

                  {/* Glow for current step */}
                  {isCurrent && !isCompleted && (
                    <span
                      className="absolute inset-0 rounded-full bg-primary/20 animate-pulse"
                      style={{ animationDuration: '2s' }}
                    />
                  )}
                </span>

                {/* Label + description (description hidden on the narrowest screens) */}
                <span className="px-1 text-center">
                  <span
                    className={cn(
                      'block text-xs font-medium transition-colors duration-200 sm:text-sm',
                      // Many steps on a phone: keep only the active label, reveal
                      // the rest at sm: so circles stay legible at 375px.
                      manySteps && !isCurrent && 'hidden sm:block',
                      isCurrent && 'text-primary',
                      isCompleted && 'text-foreground',
                      !isCompleted && !isCurrent && 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                  {step.description && (
                    <span
                      className={cn(
                        'mt-0.5 hidden text-xs transition-colors duration-200 sm:block',
                        isCurrent ? 'text-primary/70' : 'text-muted-foreground'
                      )}
                    >
                      {step.description}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default HorizontalProgressIndicator;
