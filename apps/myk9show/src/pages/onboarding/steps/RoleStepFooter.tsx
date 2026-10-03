import { Button } from '@/components/ui/button';

interface RoleStepFooterProps {
  onBack: () => void;
  onNext: () => void;
  canGoBack: boolean;
  nextLabel: string;
  isSubmitting?: boolean;
  error?: string;
}

/** Back + primary action shared by the role steps (MYK9-970). */
export function RoleStepFooter({
  onBack,
  onNext,
  canGoBack,
  nextLabel,
  isSubmitting = false,
  error = '',
}: RoleStepFooterProps) {
  return (
    <>
      {error && (
        <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between pt-2">
        {canGoBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting}>
            Back
          </Button>
        ) : (
          <span aria-hidden="true" />
        )}
        <Button type="button" onClick={onNext} disabled={isSubmitting} className="min-w-32">
          {isSubmitting ? 'Saving...' : nextLabel}
        </Button>
      </div>
    </>
  );
}

interface StepLinkProps {
  to: string;
  onNavigateAway: (destination: string) => void;
  children: React.ReactNode;
}

/**
 * An in-flow link that leaves onboarding. It finishes onboarding first (via
 * `onNavigateAway`) so the onboarding guard on the destination does not bounce
 * the user straight back — the MYK9-858 rule, shared with the Welcome step.
 */
export function StepLink({ to, onNavigateAway, children }: StepLinkProps) {
  return (
    <a
      href={to}
      className="font-medium text-primary underline-offset-4 hover:underline"
      onClick={event => {
        event.preventDefault();
        onNavigateAway(to);
      }}
    >
      {children}
    </a>
  );
}
