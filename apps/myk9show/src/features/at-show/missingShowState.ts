/**
 * Why a show is not on screen at `/at-show/:showId`, and what to say about it.
 *
 * Three causes look identical to the boundary's caller but must NOT read the
 * same to a judge standing at a ring:
 *
 *   not-found        We reached the server and it does not have this show.
 *                    The only honest "this show is missing" case.
 *   uncached-offline The browser reports no network and we hold no local copy.
 *   unreachable      The browser reports a network, but the backend refused —
 *                    venue Wi-Fi with no working uplink, a captive portal, or a
 *                    backend outage. `navigator.onLine` is true and lying.
 *
 * The last one used to fall through to a generic "Oops! Something went wrong /
 * Try Again", which is a dead end: retrying cannot succeed until connectivity
 * returns, and it hid the one affordance that fixes the device (MYK9-205).
 */

/**
 * Thrown when a local miss could not be resolved against the server.
 *
 * Carries the fact that we already know the local replica has no copy — the
 * boundary needs that to offer priming instead of a bare retry.
 */
export class ShowUnreachableError extends Error {
  /** Structural marker: survives the bundling that can break `instanceof`. */
  readonly isShowUnreachable = true;

  constructor(public readonly reason?: unknown) {
    super("We couldn't reach the server to download this show");
    this.name = 'ShowUnreachableError';
  }
}

export function isShowUnreachableError(error: unknown): boolean {
  return (
    error instanceof ShowUnreachableError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { isShowUnreachable?: unknown }).isShowUnreachable === true)
  );
}

export type MissingShowReason = 'not-found' | 'uncached-offline' | 'unreachable';

/**
 * `verifiedOnline` means we successfully re-read the show table from the
 * server and it still had no such row — the one case where "not found" is a
 * fact rather than a guess.
 *
 * An unverified miss while the browser reports being online is left as
 * `not-found`: that is the anonymous/passcode path, which cannot sync the show
 * table at all, so we have no evidence either way and must not invent a
 * connectivity story.
 */
export function resolveMissingShowReason({
  verifiedOnline,
  isOnline,
}: {
  verifiedOnline: boolean;
  isOnline: boolean;
}): MissingShowReason {
  if (verifiedOnline) return 'not-found';
  return isOnline ? 'not-found' : 'uncached-offline';
}

export interface MissingShowCopy {
  title: string;
  description: string;
}

export function missingShowCopy(reason: MissingShowReason): MissingShowCopy {
  if (reason === 'not-found') {
    return {
      title: 'Show not found',
      description:
        "We couldn't find this show. It may have been removed, or the link may be out of date. Head back to your dashboard to find it.",
    };
  }

  if (reason === 'unreachable') {
    return {
      title: "This show isn't saved on this device",
      // Names the failure the user is actually in the middle of. Venue Wi-Fi
      // that associates but carries no traffic is the common shape, and it is
      // the one case where the device claims to be online.
      description:
        "This device has no saved copy of this show, and we couldn't reach the server to download it. Venue Wi-Fi often connects without working internet. Try again, or prepare the show for offline use once you have a real connection.",
    };
  }

  return {
    title: "This show isn't saved on this device",
    description:
      'This device has no saved copy of this show. Connect to the internet and prepare it for offline use before continuing.',
  };
}

/** Staff can prime a device; the affordance is pointless for a genuine 404. */
export function shouldOfferPriming({
  reason,
  isStaff,
  hasShowId,
}: {
  reason: MissingShowReason;
  isStaff: boolean;
  hasShowId: boolean;
}): boolean {
  return reason !== 'not-found' && isStaff && hasShowId;
}
