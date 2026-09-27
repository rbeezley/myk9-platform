/**
 * Deep link into a show's public preview (`?preview=public`) and back out of
 * it again.
 *
 * MYK9-856: a secretary who opened Preview from show setup (the Premium edit
 * tab, or the Landing Page card on Overview) had no way back — no exit
 * control on the preview itself, and the setup step they came from was gone
 * the moment the route swapped to the public landing. `returnTo` carries that
 * step through the round trip, the same way `cockpitRoutes.ts` carries a
 * secretary back to the Show Desk.
 */

/** Build the preview link, carrying the step to return to when leaving it. */
export function getShowPreviewHref(showId: string, returnTo: string): string {
  const params = new URLSearchParams({ preview: 'public', returnTo });
  return `/shows/${encodeURIComponent(showId)}?${params.toString()}`;
}

/**
 * Validate a `returnTo` candidate before using it to leave preview: same
 * origin, the same show's non-preview `/shows/:id` page. Rejects anything
 * else — including a stale or tampered `returnTo` that points back into
 * preview itself, which would trap the exit in a loop.
 */
export function resolvePreviewReturnHref(
  candidate: string | null | undefined,
  expectedShowId: string
): string | null {
  if (!candidate?.startsWith('/') || candidate.startsWith('//')) return null;
  let url: URL;
  try {
    url = new URL(candidate, 'https://myk9.internal');
  } catch {
    return null;
  }
  if (url.origin !== 'https://myk9.internal') return null;
  if (url.searchParams.get('preview') === 'public') return null;
  const match = url.pathname.match(/^\/shows\/([^/]+)$/);
  if (!match?.[1]) return null;
  if (decodeURIComponent(match[1]) !== expectedShowId) return null;
  return `${url.pathname}${url.search}`;
}
