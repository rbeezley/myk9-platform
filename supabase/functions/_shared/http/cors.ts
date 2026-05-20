// supabase/functions/_shared/http/cors.ts
// CORS helpers for edge functions.
//
// Two canonical origin allowlists live here so the per-function copies stay
// in sync. If you add a new origin, add it to the list here once and every
// migrated function inherits the change.

export const MYK9SHOW_ORIGINS: readonly string[] = [
  'https://myk9show.com',
  'https://www.myk9show.com',
  'https://app.myk9show.com',
  'https://myk9-platform-myk9show.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
];

export const MYK9Q_ORIGINS: readonly string[] = [
  'https://myk9q.com',
  'https://www.myk9q.com',
  'https://app.myk9q.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];

const DEFAULT_ALLOWED_HEADERS: readonly string[] = [
  'authorization',
  'x-client-info',
  'apikey',
  'content-type',
];

/**
 * Build CORS headers for a request, echoing the origin if it's in the
 * allowlist, otherwise falling back to the first allowlist entry.
 */
export function corsHeaders(
  req: Request,
  origins: readonly string[],
  allowedHeaders: readonly string[] = DEFAULT_ALLOWED_HEADERS,
): Record<string, string> {
  const requestOrigin = req.headers.get('origin');
  const origin =
    requestOrigin && origins.includes(requestOrigin) ? requestOrigin : origins[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': allowedHeaders.join(', '),
  };
}
