/**
 * Authorization for paid premium generation (SA-2026-07-29-11 / MYK9-125).
 *
 * Extracted from index.ts so it is unit-testable, matching send-results/authz.ts
 * and send-email/authz.ts.
 *
 * WHY THIS EXISTS. index.ts previously treated a successful `shows` SELECT as
 * proof of management authority:
 *
 *   "RLS gates this query — if the user isn't a site admin, club admin, or
 *    secretary for the show's club, no row is returned."
 *
 * That was false. `shows_select` reads:
 *
 *   (deleted_at IS NULL) AND (status = ANY (ARRAY['published','upcoming',
 *     'in_progress','completed']) OR is_club_admin(...) OR is_show_secretary(...)
 *     OR is_site_admin())
 *
 * The manager predicates are the OR-branches that additionally admit DRAFT
 * shows. Every caller already sees every non-draft show, so a successful fetch
 * proved only that the show is public. Verified against the applied database: a
 * role-less account and a bare anonymous session each read the published AKC
 * show. Anyone could enumerate public show ids and bill the Anthropic path.
 *
 * The permitted set is site admin, club admin and secretary, expressed through
 * two existing SECURITY DEFINER predicates rather than a role-name list that can
 * drift from migrations:
 *
 *   can_manage_show(show_id)   club admin / trial secretary / platform admin
 *   is_show_secretary(show_id) site admin / show- or club-scoped secretary
 *
 * Both already grant EXECUTE to `authenticated`, so this needs no migration —
 * which also means it can deploy on its own, without the expand/contract dance a
 * new database object would have required.
 */

export interface PremiumAuthzUser {
  id: string;
  is_anonymous?: boolean | undefined;
}

export interface PremiumAuthzClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export type PremiumAuthzOutcome =
  | { authorized: true }
  | { authorized: false; reason: 'anonymous' | 'not-a-manager' | 'check-failed' };

/** The predicates that define "may spend money generating a premium for this show". */
export const PREMIUM_MANAGER_PREDICATES = ['can_manage_show', 'is_show_secretary'] as const;

/**
 * Resolve whether the caller may generate a premium for `showId`.
 *
 * Callers must run this BEFORE the show fetch, the rate limiter and the model
 * call, so a denied request costs one round trip and is never recorded as an
 * attempt against the limiter.
 */
export async function resolvePremiumGenerationAuthorization({
  user,
  showId,
  client,
}: {
  user: PremiumAuthzUser;
  showId: string;
  client: PremiumAuthzClient;
}): Promise<PremiumAuthzOutcome> {
  // An anonymous identity is free to mint, so it can never be a manager. Checked
  // explicitly rather than relying on the predicates returning false: this is the
  // property the finding is about, and it should not depend on how a SQL helper
  // happens to treat a null person row.
  if (user.is_anonymous) {
    return { authorized: false, reason: 'anonymous' };
  }

  const [canManage, isSecretary] = await Promise.all(
    PREMIUM_MANAGER_PREDICATES.map(fn => client.rpc(fn, { check_show_id: showId }))
  );

  // Fail closed: a check that errored has not authorized anyone.
  if (canManage.error || isSecretary.error) {
    return { authorized: false, reason: 'check-failed' };
  }

  if (canManage.data !== true && isSecretary.data !== true) {
    return { authorized: false, reason: 'not-a-manager' };
  }

  return { authorized: true };
}
