/**
 * MYK9-1477: Linux WebKit reports a fetch the outgoing document starts while it
 * is being torn down as a page error, `<url> due to access control checks.`,
 * and never sends it: Playwright sees no `request` event for it at all (run
 * 40980816332: every kept error was `seen=never`, or its URL's real requests had
 * all finished). A request that was never sent cannot be a server or CORS
 * failure; a real one is sent and records a `requestfailed` reason
 * (`… Status code: N`) or a failed response (#3391 known-answer probe).
 *
 * A page error carries only a URL, so the excuse works by elimination. It is
 * excused only when ALL of these hold:
 * - the route settled (`routeSettled`): every request this route made has an
 *   outcome, so none is still in flight to fail later;
 * - it is the WebKit access-control message for an app API URL (`/rest/v1/`,
 *   `/functions/v1/`, `/auth/v1/`), the only requests whose failures the
 *   collectors record; a third-party URL's failure would be invisible here;
 * - no request to that URL recorded a failure reason or a failed response in
 *   the route's window. Any recorded failure keeps every error for that URL.
 */
import { isAppApiUrl } from './appApiRequestTracker';

const ACCESS_CONTROL_SUFFIX = ' due to access control checks.';

export interface AccessControlErrorTriage {
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
 * @param failureLines the route's `failedResponses` and `failedRequests` lines,
 *                     each ending in the request URL
 * @param routeSettled whether the route's app API requests all settled
 */
export function triageAccessControlErrors(
  pageErrors: string[],
  failureLines: string[],
  routeSettled: boolean
): AccessControlErrorTriage {
  if (!routeSettled) return { kept: [...pageErrors], excused: [] };
  const failed = new Set(failureLines.map(line => normalizeUrl(lastToken(line))));
  const kept: string[] = [];
  const excused: string[] = [];
  for (const message of pageErrors) {
    const url = accessControlErrorUrl(message);
    if (url !== null && isAppApiUrl(url) && !failed.has(url)) excused.push(message);
    else kept.push(message);
  }
  return { kept, excused };
}

export type RequestOutcome = 'no-outcome' | 'finished' | 'failed';

/**
 * Diagnostic only (MYK9-1477): for each access-control page error the triage
 * KEPT, say what the sweep saw of a request to that URL, so a nightly shows why
 * it was not excused: which outcomes requests to that URL had (`seen=never`
 * when none was sent), and how many requests shared its path.
 */
export function describeKeptAccessControlErrors(
  keptPageErrors: string[],
  seenRequests: Array<{ url: string; outcome: RequestOutcome }>
): string[] {
  const seen = seenRequests.map(request => ({ ...request, url: normalizeUrl(request.url) }));
  return keptPageErrors.flatMap(message => {
    const url = accessControlErrorUrl(message);
    if (url === null) return [];
    const path = url.split('?')[0];
    const outcomes = seen.filter(request => request.url === url).map(request => request.outcome);
    const samePath = seen.filter(request => request.url.split('?')[0] === path).length;
    return [
      `${path} seen=${outcomes.length > 0 ? outcomes.join(',') : 'never'} same-path-requests=${samePath}`,
    ];
  });
}
