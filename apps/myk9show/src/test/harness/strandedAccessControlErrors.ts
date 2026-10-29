/**
 * MYK9-1477: Linux WebKit reports an app request that the outgoing document
 * abandoned at a navigation as a page error, `<url> due to access control
 * checks.`, with no `requestfailed` and no response. Run 40962869226 showed
 * every such error in the route-health sweep had exactly that signature.
 *
 * A page error carries only a URL, so it cannot be tied to one request. The
 * excuse works by elimination instead: when the route has SETTLED, every app
 * request the incoming document made has reported an outcome (a failure
 * records a `requestfailed` reason or a failed response; one with no outcome
 * stays pending and fails the settle check). An outcome-less access-control
 * error on a settled route can then only belong to a request the outgoing
 * document abandoned. So a page error is excused only when ALL of these hold:
 * - the route settled (`routeSettled`); otherwise nothing is excused;
 * - it is the WebKit access-control message;
 * - its URL matches a request the tracker saw still in flight when a
 *   cross-document navigation committed, and that request has reported no
 *   outcome since (`AppApiRequestTracker.stranded`);
 * - no request to that URL recorded a failure reason or a failed response in
 *   the same window, so a real failure can never borrow a stranded twin's excuse.
 *
 * Each stranded request excuses at most one page error.
 */
const ACCESS_CONTROL_SUFFIX = ' due to access control checks.';

export interface StrandedErrorTriage {
  kept: string[];
  excused: string[];
}

/**
 * Compare URLs without scheme or leading slashes: WebKit's message can drop
 * them. A scheme is stripped only when a slash follows it, so the host of a
 * scheme-less `localhost:54321/…` survives.
 */
function normalizeUrl(url: string) {
  return url.replace(/^[a-z][a-z0-9+.-]*:(?=\/)/i, '').replace(/^\/+/, '');
}

function lastToken(text: string) {
  const trimmed = text.trim();
  return trimmed.slice(trimmed.lastIndexOf(' ') + 1);
}

/** The URL an access-control page error names, or null for any other error. */
export function accessControlErrorUrl(message: string): string | null {
  if (!message.endsWith(ACCESS_CONTROL_SUFFIX)) return null;
  const url = lastToken(message.slice(0, -ACCESS_CONTROL_SUFFIX.length));
  return url ? normalizeUrl(url) : null;
}

/**
 * @param pageErrors   the route's page error messages
 * @param strandedUrls URLs of the tracker's stranded requests, one per request
 * @param failureLines the route's `failedResponses` and `failedRequests` lines,
 *                     each ending in the request URL
 * @param routeSettled whether the route's app API requests all settled
 */
export function triageStrandedAccessControlErrors(
  pageErrors: string[],
  strandedUrls: string[],
  failureLines: string[],
  routeSettled: boolean
): StrandedErrorTriage {
  if (!routeSettled) return { kept: [...pageErrors], excused: [] };
  const failed = new Set(failureLines.map(line => normalizeUrl(lastToken(line))));
  const budget = new Map<string, number>();
  for (const url of strandedUrls.map(normalizeUrl)) {
    if (failed.has(url)) continue;
    budget.set(url, (budget.get(url) ?? 0) + 1);
  }

  const kept: string[] = [];
  const excused: string[] = [];
  for (const message of pageErrors) {
    const url = accessControlErrorUrl(message);
    const remaining = url === null ? 0 : (budget.get(url) ?? 0);
    if (url !== null && remaining > 0) {
      budget.set(url, remaining - 1);
      excused.push(message);
    } else {
      kept.push(message);
    }
  }
  return { kept, excused };
}
