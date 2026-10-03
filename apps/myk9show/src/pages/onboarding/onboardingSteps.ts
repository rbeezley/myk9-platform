/**
 * One onboarding flow for everyone, built from steps (MYK9-970).
 *
 *   profile → dogs → one step per role held → welcome
 *
 * `onboarding_completed_at` records the first run. `onboarded_roles` records
 * the role steps finished or dismissed. A role gained after onboarding is a
 * held role missing from `onboarded_roles`: a dismissible banner offers its
 * step (NewRoleStepBanner); nothing redirects for it.
 *
 * Pure: the page and the route guard both call it, so "does this person need
 * onboarding?" has exactly one answer.
 */

import { getDashboardRoute, getHighestRole } from '@/hooks/roleUtils';
import { UserRole } from '@/types/auth-types';

/**
 * Roles with their own onboarding step, in the order they run. Site admin has
 * none on purpose: the platform owner needs no orientation, and a step that
 * collects nothing would only make the flow longer. Chairman and steward have
 * no step either — nothing role-specific is collected for them today.
 */
export const ROLE_STEP_ROLES = [UserRole.SECRETARY, UserRole.JUDGE, UserRole.CLUB_ADMIN] as const;

export type OnboardingRoleStep = (typeof ROLE_STEP_ROLES)[number];

export type OnboardingStep = 'profile' | 'dogs' | OnboardingRoleStep | 'welcome';

export const STEP_LABELS: Record<OnboardingStep, string> = {
  profile: 'Profile',
  dogs: 'Dogs',
  [UserRole.SECRETARY]: 'Secretary',
  [UserRole.JUDGE]: 'Judge',
  [UserRole.CLUB_ADMIN]: 'Club',
  welcome: 'Welcome',
};

export interface OnboardingState {
  /** An exhibitor_profiles row exists (signup creates one). */
  hasProfile: boolean;
  /** exhibitor_profiles.onboarding_completed_at is set. */
  baseCompleted: boolean;
  roles: readonly UserRole[];
  /**
   * exhibitor_profiles.onboarded_roles. `null` means UNKNOWN — the column was
   * not returned (a database not yet migrated) — and is never read as "no role
   * step done": an unknown answer must not push staff into a role step (the
   * MYK9-347 rule for the profile query, applied to this column).
   */
  onboardedRoles: readonly string[] | null;
}

/** Held roles whose step has not been finished, in run order. */
export function pendingRoleSteps(
  roles: readonly UserRole[],
  onboardedRoles: readonly string[] | null
): OnboardingRoleStep[] {
  if (onboardedRoles === null) return [];
  return ROLE_STEP_ROLES.filter(role => roles.includes(role) && !onboardedRoles.includes(role));
}

/**
 * The steps this person still has to see. Empty means there is nothing to do.
 *
 * First run (no completion stamp): [profile?] dogs, the role steps for the
 * roles held right now, welcome. This is the only flow the guard forces.
 *
 * After that, a role step runs only when asked for (`requestedRoleStep`, from
 * the new-role banner's link) and only while it is still pending for a role
 * the person holds — never as a redirect (MYK9-970 round 3).
 */
export function buildOnboardingSteps(
  state: OnboardingState,
  requestedRoleStep?: string | null
): OnboardingStep[] {
  const roleSteps = pendingRoleSteps(state.roles, state.onboardedRoles);
  if (state.baseCompleted) {
    return roleSteps.filter(step => step === requestedRoleStep);
  }
  return [...(state.hasProfile ? [] : (['profile'] as const)), 'dogs', ...roleSteps, 'welcome'];
}

export function isRoleStep(step: OnboardingStep): step is OnboardingRoleStep {
  return (ROLE_STEP_ROLES as readonly string[]).includes(step);
}

/** Banner copy for a role gained after onboarding: what changed, and the one action. */
export const NEW_ROLE_COPY: Record<OnboardingRoleStep, { message: string; action: string }> = {
  [UserRole.SECRETARY]: { message: "You're now a show secretary.", action: 'See your clubs' },
  [UserRole.JUDGE]: { message: "You're now a judge.", action: 'Add your judge numbers' },
  [UserRole.CLUB_ADMIN]: { message: "You're now a club admin.", action: 'Check your club' },
};

/**
 * Where the finished flow lands: the home page for the person's main role.
 *
 * INTENT: an exhibitor (or a chairman/steward with no dashboard of their own)
 * lands on Find Shows, not /exhibitor/entries — a brand-new exhibitor has no
 * entries yet, and "browse shows" is the next thing they came to do.
 */
export function getOnboardingDestination(roles: readonly UserRole[]): string {
  const highest = getHighestRole([...roles]);
  const staffHome = [
    UserRole.SITE_ADMIN,
    UserRole.SECRETARY,
    UserRole.JUDGE,
    UserRole.CLUB_ADMIN,
  ].includes(highest);
  return staffHome ? getDashboardRoute([...roles]) : '/shows';
}
