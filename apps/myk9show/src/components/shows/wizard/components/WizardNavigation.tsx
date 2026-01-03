import React from 'react';
import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  canGoBack: boolean;
  canGoNext: boolean;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft?: () => void;
  isLoading?: boolean;
  nextLabel?: string;
  backLabel?: string;
  className?: string;
}

export const WizardNavigation: React.FC<WizardNavigationProps> = ({
  currentStep,
  totalSteps,
  canGoBack,
  canGoNext,
  onBack,
  onNext,
  onSaveDraft,
  isLoading = false,
  nextLabel,
  backLabel,
  className,
}) => {
  const isLastStep = currentStep === totalSteps - 1;
  const defaultNextLabel = isLastStep ? 'Create Show' : 'Next';
  const defaultBackLabel = 'Back';

  return (
    <div className={cn(
      "flex justify-between items-center pt-8 border-t border-border mt-8",
      className
    )}>
      {/* Left side - Back/Cancel button */}
      <Button
        variant="outline"
        onClick={onBack}
        disabled={!canGoBack || isLoading}
        className="gap-2 px-6 py-3 hover:-translate-y-0.5 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {currentStep === 0 ? 'Cancel' : (backLabel || defaultBackLabel)}
      </Button>

      {/* Center - Save Draft and Step indicator */}
      <div className="flex items-center gap-6">
        {onSaveDraft && (
          <Button
            variant="ghost"
            onClick={onSaveDraft}
            disabled={isLoading}
            className="text-muted-foreground hover:bg-muted/50 transition-all duration-200"
          >
            <Save className="mr-2 h-4 w-4" />
            Save Draft
          </Button>
        )}
        <div className="text-sm text-muted-foreground font-medium">
          Step {currentStep + 1} of {totalSteps}
        </div>
      </div>

      {/* Right side - Next/Create button */}
      <Button
        onClick={onNext}
        disabled={!canGoNext || isLoading}
        className="gap-2 px-6 py-3 bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg hover:-translate-y-0.5 shadow-md transition-all duration-200"
      >
        {isLoading ? (
          <>
            <span>Processing...</span>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </>
        ) : (
          <>
            {nextLabel || defaultNextLabel}
            {!isLastStep && <ArrowRight className="h-4 w-4" />}
          </>
        )}
      </Button>
    </div>
  );
};

export default WizardNavigation;