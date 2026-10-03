/**
 * Offers unfinished onboarding to staff, as a notice instead of a redirect
 * (MYK9-970): the first run ("Finish setting up your account") and then any
 * role gained after it.
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
import { useExhibitorProfile, type ExhibitorProfile } from '@/hooks/useExhibitorProfile';
import type { UserRole } from '@/types/auth-types';
import {
  holdsStaffRole,
  NEW_ROLE_COPY,
  pendingRoleSteps,
} from '@/pages/onboarding/onboardingSteps';
import { isOnboardingExemptPath } from './onboardingExemptPaths';

interface OnboardingNotice {
  message: string;
  action: string;
  href: string;
  /** Role steps a dismissal records; `null` = not dismissible. */
  dismissRoles: string[] | null;
}

/**
 * The one notice to show, or none. Staff with an unfinished first run get the
 * set-up notice (they are never redirected); after the first run, the first
 * pending role step. Exhibitor-only first runs are the guard's redirect.
 */
function selectNotice(
  roles: readonly UserRole[],
  profile: ExhibitorProfile | null | undefined
): OnboardingNotice | null {
  if (!profile?.onboarding_completed_at) {
    if (!holdsStaffRole(roles)) return null;
    return {
      message: 'Finish setting up your account.',
      action: 'Finish setup',
      href: '/onboarding',
      // Dismissing stamps the first run done (its role steps stay pending and
      // get their own notice). Without a profile row there is nothing to stamp:
      // the profile step creates it, so that notice stays until set-up is done.
      dismissRoles: profile ? [] : null,
    };
  }
  const [step] = pendingRoleSteps(roles, profile.onboarded_roles);
  if (!step) return null;
  return { ...NEW_ROLE_COPY[step], href: `/onboarding?step=${step}`, dismissRoles: [step] };
}

export function NewRoleStepBanner() {
  const { user, userWithRoles, rbacLoading } = useAuthContext();
  const { profile, profileSettled, completeOnboarding, isCompletingOnboarding } =
    useExhibitorProfile();
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissFailed, setDismissFailed] = useState(false);

  if (!user || user.is_anonymous || rbacLoading) return null;
  // An unsettled profile query is "unknown", never "no profile" (MYK9-347).
  if (!profileSettled) return null;
  if (isOnboardingExemptPath(location.pathname)) return null;

  const notice = selectNotice(userWithRoles?.roles ?? [], profile);
  if (!notice) return null;

  const dismissRoles = notice.dismissRoles;
  const dismiss = async () => {
    if (!dismissRoles) return;
    setDismissFailed(false);
    try {
      await completeOnboarding(dismissRoles);
    } catch {
      setDismissFailed(true);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 md:left-auto md:right-4 md:max-w-sm">
      <Alert role="status" className="border-primary/30 bg-card pr-12 shadow-md">
        {/* Before the icon: the Alert's `svg ~ *` padding rule must not reach it. */}
        {dismissRoles && (
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
        )}
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <AlertDescription>
          <p className="font-medium">{notice.message}</p>
          <Button
            type="button"
            variant="link"
            className="h-auto min-h-11 px-0"
            onClick={() => navigate(notice.href)}
          >
            {notice.action}
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
