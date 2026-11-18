import type { ClubStripeAccount } from './useClubStripeAccount';

/**
 * Where a club stands on payouts (MYK9-2164). Every show needs the club's bank account before it
 * can be published, so this is the one reading the readiness line and the Publish refusal share.
 * - 'ready': payouts are on.
 * - 'in-review': the club finished setup and Stripe is checking it.
 * - 'incomplete': setup was started and not finished.
 * - 'not-connected': no account at all.
 * - 'demo': a demo club; the server publishes its shows without payouts.
 * - 'unknown': not loaded, offline, or the demo flag could not be read. Never read as "not
 *   connected": a club that is fine must not be told it is not.
 */
export type ClubPayoutsState =
  'ready' | 'in-review' | 'incomplete' | 'not-connected' | 'demo' | 'unknown';

export function deriveClubPayoutsState(input: {
  /** True once the account read returned an answer (null means "no account"). */
  accountResolved: boolean;
  account: Pick<ClubStripeAccount, 'onboarding_complete' | 'payouts_enabled'> | null | undefined;
  /** clubs.is_demo; undefined while unread or unreadable. */
  isDemo: boolean | undefined;
}): ClubPayoutsState {
  if (input.isDemo === true) return 'demo';
  if (input.account?.payouts_enabled === true) return 'ready';
  if (!input.accountResolved || input.isDemo === undefined) return 'unknown';
  if (!input.account) return 'not-connected';
  return input.account.onboarding_complete ? 'in-review' : 'incomplete';
}

/** True when payouts are missing for sure, so Publish would be refused. */
export function clubPayoutsBlockPublish(state: ClubPayoutsState): boolean {
  return state === 'not-connected' || state === 'incomplete' || state === 'in-review';
}

/** The club's Payments tab (the old /club-admin/payments page now lives there). */
export function clubPaymentsHref(clubId: string): string {
  return `/clubs/${clubId}?tab=payments`;
}

/** Why the show cannot be published yet, in plain words, for the three blocking states. */
export function clubPayoutsMessage(state: ClubPayoutsState): string {
  if (state === 'in-review') {
    return "Stripe is reviewing your club's bank account, usually a day or two. You can publish once it is approved.";
  }
  if (state === 'incomplete') {
    return "Your club's bank account setup is not finished. Entry fees need somewhere to go before you publish. Finish it on the club's Payments tab. A club admin can do it if you can't.";
  }
  return "Your club needs a bank account before you publish. Entry fees need somewhere to go. Set it up on the club's Payments tab. A club admin can do it if you can't.";
}

/**
 * The short phrase for the readiness line and the header nudge, in the lower-case style of the
 * header status line. Empty for a state that does not block Publish.
 */
export function clubPayoutsShortLabel(state: ClubPayoutsState): string {
  if (state === 'in-review') return 'Stripe is reviewing the bank account';
  if (state === 'incomplete') return 'bank account setup not finished';
  if (state === 'not-connected') return "club's bank account not set up";
  return '';
}

export const CLUB_PAYMENTS_LINK_LABEL = 'Open Payments';
