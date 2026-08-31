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
  onSaveDraft?: (() => void) | undefined;
  isLoading?: boolean | undefined;
  nextLabel?: string | undefined;
  /**
   * Id of the element explaining why Next is blocked. When set, Next becomes
   * aria-disabled rather than disabled so it stays focusable and a screen
   * reader can read the reason on demand — a `disabled` button is unfocusable,
   * so the explanation was unreachable except by chance at the moment it
   * mounted.
   */
  blockedReasonId?: string | undefined;
  backLabel?: string | undefined;
  className?: string | undefined;
  /**
   * Count of still-unresolved validation issues on the current step — missing
   * fields, but also date-ordering errors and "at least one trial/class" rules.
   * When > 0 an inline "N items remaining" hint renders beneath the Next button
   * so the secretary sees *why* they can't advance without having to click and
   * guess. "Items" — not "fields" — because the count is not always
   * field-shaped (a filled-out step can still have a date-order error). Leaving
   * Next enabled (see `canGoNext` at the call site) means the click still fires
   * and surfaces the full validation banner. Defaults to 0 (no hint) so other
   * wizards that reuse this component are unaffected.
   */
  remainingIssueCount?: number | undefined;
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
  blockedReasonId,
  className,
  remainingIssueCount = 0,
}) => {
  const isLastStep = currentStep === totalSteps - 1;
  const defaultNextLabel = isLastStep ? 'Create Show' : 'Next';
  const defaultBackLabel = 'Back';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 pt-8 border-t border-border mt-8',
        className
      )}
    >
      {/* Left side - Back/Cancel button */}
      <Button
        variant="outline"
        size="touch"
        onClick={onBack}
        disabled={!canGoBack || isLoading}
        className="gap-2 px-4 py-3 sm:px-6 hover:-translate-y-0.5 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {currentStep === 0 ? 'Cancel' : backLabel || defaultBackLabel}
      </Button>

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

      {/* Right side - Next/Create button with an inline readiness hint beneath
          it. Next stays clickable when the step is incomplete (the click
          surfaces the validation banner instead of failing silently); the hint
          tells the secretary how many items still need attention before they
          click. No decorative glow (DESIGN.md: motion is purposeful, not
          decorative). */}
      <div className="flex flex-col items-end gap-1.5">
        <Button
          size="touch"
          onClick={blockedReasonId && !canGoNext ? undefined : onNext}
          disabled={blockedReasonId ? isLoading : !canGoNext || isLoading}
          aria-disabled={!canGoNext || isLoading}
          {...(blockedReasonId && !canGoNext ? { 'aria-describedby': blockedReasonId } : {})}
          /* aria-disabled keeps the button focusable so its reason stays
             reachable, but it applies none of the `disabled:` styles — without
             these the button looked fully enabled, still hover-lifted, and
             silently did nothing on click. */
          className={cn(
            'relative gap-2 px-4 py-3 sm:px-6',
            // NOT opacity-50. This button is deliberately focusable so its
            // reason stays reachable, which means it must still meet AA — an
            // opacity dim measured 2.22:1 light / 2.42:1 dark. It also lost to
            // the variant's own `hover:opacity-90`, which sits in a different
            // twMerge group and wins on specificity, so the "disabled" look
            // evaporated the moment the pointer arrived.
            !canGoNext &&
              !isLoading &&
              'cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground hover:opacity-100 hover:translate-y-0'
          )}
        >
          {isLoading ? (
            <>
              <span>Processing...</span>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            </>
          ) : (
            <>
              {nextLabel || defaultNextLabel}
              {!isLastStep && <ArrowRight className="h-4 w-4" />}
            </>
          )}
        </Button>
        {!isLoading && remainingIssueCount > 0 && (
          <p role="status" className="text-xs text-muted-foreground">
            {remainingIssueCount} item{remainingIssueCount === 1 ? '' : 's'} remaining
          </p>
        )}
      </div>
    </div>
  );
};

export default WizardNavigation;
