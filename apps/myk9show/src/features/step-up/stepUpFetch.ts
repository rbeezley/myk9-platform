/**
 * MYK9-1208: the Supabase client's fetch, taught to answer a step-up refusal.
 *
 * Refunds and role changes are refused server-side unless the session re-authenticated in
 * the last five minutes: PostgREST answers with SQLSTATE `MKAUT`
 * (public.require_recent_reauth), an edge function with `{ error: 'step_up_required' }`
 * (_shared/stepUpReauth.ts). On either, this asks the person to confirm once, then replays
 * the same request with the new session's token. Every refund and role-change call goes
 * through the one client, so each entry point is covered without its own wiring, and
 * nothing else changes: any other response passes straight through, untouched.
 *
 * Refunds and role changes are online-only, so a request that is replayed was never queued
 * offline. Ringside and scoring endpoints cannot return either refusal.
 */
export const STEP_UP_SQLSTATE = 'MKAUT';
export const STEP_UP_REQUIRED_CODE = 'step_up_required';

type Fetch = typeof fetch;

export function isStepUpRefusalBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const { code, error } = body as { code?: unknown; error?: unknown };
  return code === STEP_UP_SQLSTATE || error === STEP_UP_REQUIRED_CODE;
}

async function isStepUpRefusal(response: Response): Promise<boolean> {
  if (response.ok) return false;
  if (!(response.headers.get('content-type') ?? '').includes('json')) return false;
  try {
    return isStepUpRefusalBody(await response.clone().json());
  } catch {
    return false;
  }
}

function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

export function createStepUpFetch(
  requestStepUp: (refusedToken: string | null) => Promise<string | null>,
  baseFetch: Fetch = (input, init) => globalThis.fetch(input, init)
): Fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    // The sign-in that answers the prompt goes through this same fetch.
    const isRequestObject = typeof Request !== 'undefined' && input instanceof Request;
    if (isRequestObject || urlOf(input).includes('/auth/v1/')) return response;
    if (!(await isStepUpRefusal(response))) return response;

    const refusedToken =
      new Headers(init?.headers).get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;
    const accessToken = await requestStepUp(refusedToken);
    // Cancelled: hand back the refusal, whose message reads "Confirm your password to continue."
    if (!accessToken) return response;

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return baseFetch(input, { ...init, headers });
  };
}
