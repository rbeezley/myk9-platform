/**
 * Paths that get the offline document shell: ringside scoring, Find Shows and
 * My Shows, `/exhibitor/entries` (MYK9-1539). The shell is account-agnostic
 * HTML; what a visitor sees offline is decided by the app's own boot. A
 * signed-out boot never reads the shows replica (useBrowseShowsList, MYK9-780)
 * and My Shows is behind the auth guard. Only `/exhibitor/entries` is listed,
 * not `/exhibitor/*`, because other account pages are unreviewed offline.
 */
export const OFFLINE_SHELL_ALLOWLIST: RegExp[] = [
  // The installed app's start_url (MYK9-1674): a cold offline launch must get the shell.
  /^\/app(?:[/?]|$)/,
  /^\/at-show(?:[/?]|$)/,
  /^\/shows(?:[/?]|$)/,
  /^\/exhibitor\/entries(?:[/?]|$)/,
];

const APP_SHELL_MARKER = 'name="myk9-supabase-origin"';
const NAVIGATION_TIMEOUT_MS = 3000;

/** Return the current app shell only when the navigation really reached myK9Show. */
export async function loadRingsideNavigation(
  request: Request,
  cachedShell: () => Promise<Response>,
  fetchDocument: typeof fetch = fetch,
  timeoutMs = NAVIGATION_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Ringside navigation timed out'));
    }, timeoutMs);
  });

  const network = async (): Promise<Response> => {
    const response = await fetchDocument(request, { cache: 'no-store', signal: controller.signal });
    if (
      response.status !== 200 ||
      response.redirected ||
      !response.headers.get('content-type')?.toLowerCase().includes('text/html')
    ) {
      throw new Error('Ringside navigation did not return an app document');
    }
    // A captive portal can reply 200 with HTML. Check the app's existing
    // metadata on a clone so the browser can still consume the original body.
    if (!(await response.clone().text()).includes(APP_SHELL_MARKER)) {
      throw new Error('Ringside navigation returned a different HTML document');
    }
    return response;
  };

  let currentDocument: Response | undefined;
  try {
    currentDocument = await Promise.race([network(), deadline]);
  } catch {
    // Any network, timeout, or document-validation failure uses the saved shell.
  } finally {
    clearTimeout(timeout);
  }
  return currentDocument ?? cachedShell();
}
