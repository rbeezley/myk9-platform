/**
 * One line on My Shows offering to finish first-run set-up (MYK9-2028).
 *
 * The onboarding redirect no longer blocks My Shows, the cart or messages
 * ("never block her own pages", MYK9-1998), so an exhibitor who has not
 * finished set-up lands here and is offered it instead. When the mailing
 * address is missing the line says why (AKC prints it in the catalog,
 * MYK9-1010).
 *
 * Staff never see it (they get NewRoleStepBanner), and an unsettled profile
 * query is "unknown", never "unfinished" (MYK9-347).
 */

import { Link } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { holdsStaffRole } from '@/pages/onboarding/onboardingSteps';
import { personNeedsAddress } from '@/pages/onboarding/steps/StepProfile';

export function FinishSetupLine() {
  const { user, userWithRoles, rbacLoading } = useAuthContext();
  const { profile, profileSettled } = useExhibitorProfile();

  if (!user || user.is_anonymous || rbacLoading) return null;
  if (holdsStaffRole(userWithRoles?.roles ?? [])) return null;
  if (!profileSettled) return null;
  if (profile?.onboarding_completed_at) return null;

  const needsAddress = personNeedsAddress(profile?.person);

  return (
    <div
      data-testid="finish-setup-line"
      className="myk9-entries-strip items-center justify-between border-primary/20 bg-primary/10 text-foreground"
    >
      <span>
        {needsAddress
          ? 'Add your mailing address: AKC prints it in the catalog.'
          : 'Finish setting up your account.'}
      </span>
      <Link
        to="/onboarding"
        className="min-h-[44px] inline-flex items-center font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Finish setup
      </Link>
    </div>
  );
}
