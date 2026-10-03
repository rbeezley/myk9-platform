/**
 * Offers the onboarding step for a role gained after onboarding (MYK9-970).
 *
 * A calm, dismissible notice, never a redirect: "You're now a judge. Add your
 * judge numbers." The action opens just that step (/onboarding?step=judge);
 * dismissing records the role in onboarded_roles through the same self-write
 * that finishing the step uses, so it does not come back.
 *
 * Built from LIVE roles minus onboarded_roles on every render: a role revoked
 * mid-session simply drops out, a sign-out or user switch changes the inputs,
 * and there is no session state to go stale. One banner at a time — the first
 * pending role in step order; the next appears once that one is handled.
 *
 * INTENT: never on show-day routes (ringside, scoring, TV) or auth pages.
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { NEW_ROLE_COPY, pendingRoleSteps } from '@/pages/onboarding/onboardingSteps';
import { isOnboardingExemptPath } from './onboardingExemptPaths';

export function NewRoleStepBanner() {
  const { user, userWithRoles, rbacLoading } = useAuthContext();
  const { profile, completeOnboarding, isCompletingOnboarding } = useExhibitorProfile();
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissFailed, setDismissFailed] = useState(false);

  if (!user || user.is_anonymous || rbacLoading) return null;
  // Only after the first run; before it, the guard's redirect covers every role.
  if (!profile?.onboarding_completed_at) return null;
  if (isOnboardingExemptPath(location.pathname)) return null;

  const [step] = pendingRoleSteps(userWithRoles?.roles ?? [], profile.onboarded_roles);
  if (!step) return null;

  const copy = NEW_ROLE_COPY[step];

  const dismiss = async () => {
    setDismissFailed(false);
    try {
      await completeOnboarding([step]);
    } catch {
      setDismissFailed(true);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 md:left-auto md:right-4 md:max-w-sm">
      <Alert role="status" className="border-primary/30 bg-card pr-12 shadow-md">
        {/* Before the icon: the Alert's `svg ~ *` padding rule must not reach it. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 h-11 w-11"
          aria-label="Dismiss"
          disabled={isCompletingOnboarding}
          onClick={dismiss}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <AlertDescription>
          <p className="font-medium">{copy.message}</p>
          <Button
            type="button"
            variant="link"
            className="h-auto min-h-11 px-0"
            onClick={() => navigate(`/onboarding?step=${step}`)}
          >
            {copy.action}
          </Button>
          {dismissFailed && (
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t save that. Please try again.
            </p>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
