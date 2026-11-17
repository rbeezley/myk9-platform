import { readPersistedAuthUserId } from '@/services/database/persistedAuthUserId';

type BootLocation = Pick<Location, 'pathname' | 'search' | 'hash'>;

/** Query keys an auth redirect lands with; any of them means the full app must handle the URL. */
const AUTH_RETURN_PARAMS = ['code', 'token', 'token_hash', 'error', 'error_code', 'type'];

/**
 * Whether this page load is a first-time visitor on the landing page (MYK9-2140): the path is
 * `/`, no session is stored on this device, and the URL carries nothing an auth redirect would
 * (a `?code=`, or a `#access_token=…` fragment). Only then may the landing page start without
 * the signed-in app shell. False on any doubt, which is the full app, as before.
 *
 * A passcode (anonymous) session is stored like any other, so it is never a guest here. A
 * browser that refuses storage access throws on the read; that is a doubt too.
 */
export function isGuestLandingBoot(
  location: BootLocation,
  readUserId: () => string | null = readPersistedAuthUserId
): boolean {
  if (location.pathname !== '/') return false;
  try {
    if (readUserId() !== null) return false;
  } catch {
    return false;
  }
  // `#get-started` is the landing page's own anchor; a fragment with `=` is a token hand-back.
  if (location.hash.includes('=')) return false;
  const params = new URLSearchParams(location.search);
  return !AUTH_RETURN_PARAMS.some(key => params.has(key));
}
