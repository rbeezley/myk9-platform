// Publishing a show opens online entries (status 'published' is the
// entries-open state), and online entry fees can only be paid out to clubs
// with a working Stripe Connect account. Fail closed: no account row, or a
// row without payouts_enabled, blocks NEWLY publishing. Shows that are
// already published are never un-published by this gate.

export const PUBLISH_BLOCKED_MESSAGE =
  "Connect your club's payment account before publishing — online entry fees need somewhere to go. Find it under My Club → Payments.";

export function canEnableOnlineEntries(
  account: { payouts_enabled: boolean } | null | undefined
): boolean {
  return account?.payouts_enabled === true;
}
