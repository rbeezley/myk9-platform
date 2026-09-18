import type { ShowManageScope } from '@/hooks/useShowManageScope';

/**
 * The ONE sentence the app gives a viewer who manages this show but is not its
 * trial secretary, on the handful of controls that route into
 * `/secretary/register/:showId` or `/secretary/volunteers` — both
 * `ProtectedRoute(SECRETARY | SITE_ADMIN)`.
 *
 * Until MYK9-630 phase 3 this treatment lived only in the header Actions menu,
 * and the identical affordances in the page bodies (`SecretaryAddEntriesDecision`
 * on Show Day and Entries, `WorkbenchLateEntryAction`, `VolunteersCard`) were
 * ungated — which for a club admin, whom phase 3 puts on those tabs, meant an
 * enabled button that dead-ended on a chrome-less "You don't have permission to
 * access this page." wall (REV-2341 lens P, P1). One string, one rule.
 */
export const TRIAL_SECRETARY_ONLY_REASON = 'Trial secretary access only';

/**
 * `undefined` when this viewer may operate the show (so the control is live),
 * otherwise the one-line reason to grey it with.
 *
 * Fails CLOSED on every non-`resolved` status: offering a live button while
 * ownership is still settling, and withdrawing it a frame later, is the same
 * mistake-anxiety bug as never gating it at all.
 */
export function trialSecretaryOnlyReason(scope: ShowManageScope): string | undefined {
  return scope.status === 'resolved' && scope.canOperate ? undefined : TRIAL_SECRETARY_ONLY_REASON;
}
