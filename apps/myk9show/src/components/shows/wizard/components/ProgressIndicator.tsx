import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: number;
  label: string;
  description?: string;
}

interface ProgressIndicatorProps {
  steps: Step[];
  currentStep: number;
  completedSteps: number[];
  onStepClick?: (step: number) => void;
  className?: string;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
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
    // Can click on completed steps or the next step after the last completed
    const maxCompleted = completedSteps.length > 0 ? Math.max(...completedSteps) : -1;
    return isStepCompleted(stepId) || stepId <= maxCompleted + 1;
  };

  return (
    <div className={cn("w-full px-3 py-6", className)}>
      <div className="relative">
        {/* Background connector line */}
        <div className="absolute left-0 right-0 top-8 h-0.5 bg-gradient-to-r from-border/30 to-border/60 rounded-full" />
        
        {/* Completed progress line */}
        <div 
          className="absolute left-0 top-8 h-0.5 bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${(Math.max(0, ...completedSteps, currentStep) / (steps.length - 1)) * 100}%`,
            boxShadow: '0 2px 12px rgba(37, 99, 235, 0.3)'
          }}
        />

        {/* Steps */}
        <div className="relative flex justify-between">
          {steps.map((step, index) => {
            const isCompleted = isStepCompleted(step.id);
            const isCurrent = isStepCurrent(step.id);
            const isClickable = isStepClickable(step.id);

            return (
              <div 
                key={step.id} 
                className="flex flex-col items-center flex-1 max-w-[80px] min-w-[70px]"
              >
                {/* Step Circle */}
                <button
                  onClick={() => isClickable && onStepClick?.(step.id)}
                  disabled={!isClickable}
                  className={cn(
                    "group relative z-10 flex h-14 w-14 items-center justify-center rounded-full transition-all duration-300 backdrop-blur-xl border-2",
                    isCompleted && "bg-gradient-to-br from-primary to-secondary text-primary-foreground border-transparent shadow-xl",
                    isCurrent && !isCompleted && "bg-gradient-to-br from-primary/10 to-primary/5 text-primary border-primary scale-105 shadow-lg",
                    !isCompleted && !isCurrent && "bg-gradient-to-br from-muted/50 to-muted/30 text-muted-foreground border-border",
                    isClickable && "cursor-pointer hover:scale-110 hover:-translate-y-1",
                    !isClickable && "cursor-default"
                  )}
                  style={{
                    borderRadius: '50%',
                    boxShadow: isCompleted 
                      ? '0 8px 25px rgba(37, 99, 235, 0.4), 0 4px 12px rgba(37, 99, 235, 0.2)'
                      : isCurrent 
                      ? '0 6px 20px rgba(37, 99, 235, 0.25), 0 2px 8px rgba(37, 99, 235, 0.15)'
                      : '0 2px 8px rgba(0, 0, 0, 0.08)',
                    fontWeight: 590,
                    fontSize: '15px',
                    transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                  }}
                >
                  {isCompleted ? (
                    <Check className="h-6 w-6 drop-shadow-sm transition-all duration-300 group-hover:scale-110" />
                  ) : (
                    <span className="font-semibold transition-all duration-300 group-hover:scale-110">{index + 1}</span>
                  )}
                </button>
                {/* Subtle glow effect for completed and current steps */}
                {(isCompleted || isCurrent) && (
                  <div 
                    className={cn(
                      "absolute top-0 left-1/2 transform -translate-x-1/2 w-14 h-14 rounded-full transition-all duration-500 pointer-events-none",
                      isCompleted && "bg-gradient-to-br from-primary/20 to-secondary/20 blur-lg",
                      isCurrent && !isCompleted && "bg-gradient-to-br from-primary/15 to-primary/10 blur-lg"
                    )}
                    style={{
                      animation: (isCompleted || isCurrent) ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'
                    }}
                  />
                )}

                {/* Step Label */}
                <div className="mt-3 text-center px-1">
                  <div
                    className={cn(
                      "text-xs font-medium transition-all duration-300 leading-tight",
                      isCurrent && "text-primary scale-105 font-semibold",
                      isCompleted && "text-foreground font-medium",
                      !isCompleted && !isCurrent && "text-muted-foreground"
                    )}
                    style={{
                      fontWeight: isCurrent ? 590 : isCompleted ? 500 : 400,
                      transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                    }}
                  >
                    {step.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ProgressIndicator;