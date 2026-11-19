/**
 * The clubs store's identity state and the plain words for why rows are withheld
 * (MYK9-2168). Types and copy only; the boundary that sets them is
 * `clubsIdentityBoundary.ts`.
 */

export type ClubsWithheldReason =
  /** No usable session could be read, so which account this is is unknown. */
  | 'identity-unknown'
  /** The replica holds another account's rows and this device cannot download this account's. */
  | 'offline'
  /** Another account has a club change on this device that has not been sent. */
  | 'pending-edits'
  /** The check could not finish; try again. */
  | 'failed';

export type ClubsIdentity =
  | { status: 'unverified'; reason: ClubsWithheldReason | null; principalKey: null }
  | { status: 'verified'; reason: null; principalKey: string };

const MESSAGES: Record<ClubsWithheldReason, string> = {
  'identity-unknown':
    "We can't tell which account is signed in on this device. Connect to the internet and sign in again to see your clubs.",
  offline:
    'Connect to the internet to load clubs for this account. The clubs saved on this device belong to a different account.',
  'pending-edits':
    'Another account has club changes on this device that are not sent yet. Sign back in to that account to send them, then try again.',
  failed: "We couldn't confirm your clubs. Try again.",
};

export function clubsWithheldMessage(reason: ClubsWithheldReason | null): string {
  return reason === null ? "We couldn't load your clubs." : MESSAGES[reason];
}
