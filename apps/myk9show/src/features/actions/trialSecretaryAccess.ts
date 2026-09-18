import type { ShowManageScope } from '@/hooks/useShowManageScope';

/**
 * The ONE sentence the app gives a viewer who manages this show but is not its
 * trial secretary, on the controls that route into secretary-only destinations
 * — `/secretary/register/:showId`, `/secretary/volunteers`, `/scoring/…`.
 *
 * Until MYK9-630 phase 3 this treatment lived only in the header Actions menu,
 * and the identical affordances in the page bodies were ungated: for a club
 * admin, whom phase 3 puts on those tabs, an enabled button that dead-ended on
 * a permission wall (REV-2341 P1). One string, one rule — and since R-1, a
 * destination-side `RoleAccessDeniedState` behind it, so a control this helper
 * is not wired into degrades instead of dead-ending.
 */
export const TRIAL_SECRETARY_ONLY_REASON = 'Trial secretary access only';

/**
 * What a control says while we do not yet know. Distinct from the refusal on
 * purpose: on a cold load `useShowManageScope` must run a show read, and during
 * that window the fail-closed answer captioned the trial secretary's OWN
 * controls "Trial secretary access only" — telling the one person it is not
 * about that it is about her (REV-2341 R-6).
 */
export const TRIAL_SECRETARY_CHECKING_REASON = 'Checking your access to this show…';

export interface TrialSecretaryAccessOptions {
  /**
   * False when the surface has no show in its URL to scope against.
   *
   * `/secretary/entries` is the real case: it resolves its show from
   * localStorage, so `useShowManageScope(undefined)` never leaves `resolving`
   * and no retry can change that. Failing closed there left a REAL trial
   * secretary with "Add entry for someone else" permanently disabled and captioned
   * "Trial secretary access only" — a regression this PR introduced and R-2
   * caught. With no show to scope to, the operational ROLE is the whole
   * answer the app can honestly give.
   */
  showIdKnown?: boolean;
}

/**
 * `undefined` when this viewer may operate the show (the control is live),
 * otherwise the one-line reason to grey it with.
 *
 * Three answers, not two:
 * - `resolved`   — the scope decided. `canOperate` is the whole answer.
 * - `resolving`  — we are still asking. Say so; never state the refusal.
 * - `unavailable`, or no show id at all — the question cannot be answered for
 *   this show (offline with a cold store, a failed read, or a surface with no
 *   show in its URL). Fall back to the operational role the viewer holds:
 *   saying "Trial secretary access only" to a trial secretary, permanently,
 *   because we could not read her show, is worse than letting her press a
 *   button whose route and server will check her again anyway.
 */
export function trialSecretaryOnlyReason(
  scope: ShowManageScope,
  options: TrialSecretaryAccessOptions = {}
): string | undefined {
  if (scope.status === 'resolved') {
    return scope.canOperate ? undefined : TRIAL_SECRETARY_ONLY_REASON;
  }
  if (scope.status === 'resolving' && options.showIdKnown !== false) {
    return TRIAL_SECRETARY_CHECKING_REASON;
  }
  return scope.hasOperationalStaffRole ? undefined : TRIAL_SECRETARY_ONLY_REASON;
}
