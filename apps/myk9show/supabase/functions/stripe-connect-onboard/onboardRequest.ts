// Parse the stripe-connect-onboard request body (MYK9-2445). Malformed JSON, a
// non-object body or a missing field is the caller's fault and answers 400,
// never the catch-all 500. Deno-free so it runs under vitest.

export interface OnboardRequest {
  club_id: string;
  return_path: string; // app-relative, e.g. "/club-admin/payments"
}

export type ParsedOnboardRequest =
  | { ok: true; value: OnboardRequest }
  | { ok: false; error: 'Invalid JSON body' | 'Missing required parameters: club_id, return_path' };

export function parseOnboardRequest(rawBody: string): ParsedOnboardRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Invalid JSON body' };
  }
  const { club_id, return_path } = parsed as Record<string, unknown>;
  if (typeof club_id !== 'string' || !club_id || typeof return_path !== 'string' || !return_path) {
    return { ok: false, error: 'Missing required parameters: club_id, return_path' };
  }
  return { ok: true, value: { club_id, return_path } };
}
