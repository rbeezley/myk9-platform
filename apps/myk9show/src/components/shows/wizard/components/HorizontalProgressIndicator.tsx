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
 * Horizontal step indicator for the Show Creation wizard.
 *
 * Sibling to VerticalProgressIndicator (still used by the Registration wizard).
 * Renders steps left-to-right across a thin top bar so the form below gets the
 * full content width — a one-axis layout that doesn't compete with the app
 * shell's left rail for horizontal space.
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

              {/* Step circle */}
              <button
                type="button"
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${step.label}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
                className={cn(
                  'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
                  isCompleted && 'bg-primary border-primary text-primary-foreground shadow-md',
                  isCurrent &&
                    !isCompleted &&
                    'bg-primary/10 border-primary text-primary shadow-sm ring-4 ring-primary/20',
                  !isCompleted && !isCurrent && 'bg-muted/50 border-border text-muted-foreground',
                  isClickable && 'cursor-pointer hover:scale-110 hover:shadow-lg',
                  !isClickable && 'cursor-default'
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
              </button>

              {/* Label + description (description hidden on the narrowest screens) */}
              <div className="mt-2 px-1 text-center">
                <div
                  className={cn(
                    'text-xs font-medium transition-colors duration-200 sm:text-sm',
                    isCurrent && 'text-primary',
                    isCompleted && 'text-foreground',
                    !isCompleted && !isCurrent && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </div>
                {step.description && (
                  <p
                    className={cn(
                      'mt-0.5 hidden text-xs transition-colors duration-200 sm:block',
                      isCurrent ? 'text-primary/70' : 'text-muted-foreground'
                    )}
                  >
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default HorizontalProgressIndicator;
