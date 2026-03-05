import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: number;
  label: string;
  description?: string;
}

interface VerticalProgressIndicatorProps {
  steps: Step[];
  currentStep: number;
  completedSteps: number[];
  onStepClick?: (step: number) => void;
  className?: string;
}

export const VerticalProgressIndicator: React.FC<VerticalProgressIndicatorProps> = ({
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

  // Calculate progress percentage for the connecting line
  const progressPercentage = React.useMemo(() => {
    if (steps.length <= 1) return 0;
    const maxProgress = Math.max(0, ...completedSteps, currentStep);
    return (maxProgress / (steps.length - 1)) * 100;
  }, [steps.length, completedSteps, currentStep]);

  return (
    <nav className={cn('w-full', className)} role="navigation" aria-label="Wizard progress">
      <ol className="relative space-y-0">
        {steps.map((step, index) => {
          const isCompleted = isStepCompleted(step.id);
          const isCurrent = isStepCurrent(step.id);
          const isClickable = isStepClickable(step.id);
          const isLast = index === steps.length - 1;

          return (
            <li key={step.id} className="relative">
              {/* Connecting line (not on last item) */}
              {!isLast && (
                <div className="absolute left-3.5 top-7 bottom-0 w-0.5 -translate-x-1/2">
                  {/* Background line */}
                  <div className="absolute inset-0 bg-border/40 rounded-full" />
                  {/* Filled progress line */}
                  <div
                    className={cn(
                      'absolute top-0 left-0 w-full rounded-full transition-all duration-500 ease-out',
                      isCompleted || (isCurrent && completedSteps.includes(step.id))
                        ? 'bg-primary'
                        : 'bg-transparent'
                    )}
                    style={{
                      height: isCompleted ? '100%' : '0%',
                    }}
                  />
                </div>
              )}

              {/* Step row */}
              <div className="relative flex items-start gap-3 pb-6">
                {/* Step circle */}
                <button
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

                  {/* Glow effect for current step */}
                  {isCurrent && !isCompleted && (
                    <span
                      className="absolute inset-0 rounded-full bg-primary/20 animate-pulse"
                      style={{ animationDuration: '2s' }}
                    />
                  )}
                </button>

                {/* Step content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div
                    className={cn(
                      'text-sm font-medium transition-colors duration-200',
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
                        'text-xs mt-0.5 transition-colors duration-200',
                        isCurrent ? 'text-primary/70' : 'text-muted-foreground'
                      )}
                    >
                      {step.description}
                      {isCompleted && (
                        <span className="ml-1 text-primary">
                          <Check className="inline h-3 w-3" />
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Overall progress bar (optional visual enhancement) */}
      <div className="mt-2 pt-4 border-t border-border/50">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>Progress</span>
          <span>{Math.round(progressPercentage)}%</span>
        </div>
        <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>
    </nav>
  );
};

export default VerticalProgressIndicator;
