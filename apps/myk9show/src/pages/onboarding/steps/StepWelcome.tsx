/**
 * Onboarding step — Welcome / You're all set!
 * Final step of a first run. Completes onboarding, then leads to the home page
 * for the person's main role (Find Shows for exhibitors).
 */

import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface StepWelcomeProps {
  onFinish: () => void;
  onNavigateAway: (destination: string) => void;
  onBack: () => void;
  isSubmitting: boolean;
  error: string;
  /** Primary button label; names where Finish lands. */
  finishLabel?: string;
}

export function StepWelcome({
  onFinish,
  onNavigateAway,
  onBack,
  isSubmitting,
  error,
  finishLabel = 'Browse Shows',
}: StepWelcomeProps) {
  return (
    <div className="space-y-6 text-center" data-testid="step-welcome">
      <div className="flex justify-center">
        <div className="rounded-full bg-primary/10 p-5">
          <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden="true" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-semibold">You're all set!</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Your profile is ready. Shows, entries and results are all in one place.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Address lives in{' '}
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            to="/account?section=profile"
            onClick={event => {
              event.preventDefault();
              onNavigateAway('/account?section=profile');
            }}
          >
            Account Profile
          </Link>
          , and notifications live in{' '}
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            to="/account?section=notifications"
            onClick={event => {
              event.preventDefault();
              onNavigateAway('/account?section=notifications');
            }}
          >
            Account Notifications
          </Link>
          .
        </p>
      </div>

      {error && (
        <div className="text-destructive text-sm p-2 bg-destructive/10 rounded-md" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2 items-center pt-2">
        <Button onClick={onFinish} disabled={isSubmitting} className="min-w-40">
          {isSubmitting ? 'Finishing...' : finishLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
      </div>
    </div>
  );
}
