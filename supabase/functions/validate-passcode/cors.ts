// CORS configuration - restrict to known app domains and Vercel previews.
// Preview deployments must be allowed because real-device pilots often use a
// branch URL before the production alias can be promoted.
const ALLOWED_ORIGINS = [
  'https://myk9q.com',
  'https://www.myk9q.com',
  'https://app.myk9q.com',
  'https://myk9-platform-myk9q.vercel.app',
  'https://myk9-platform-myk9show.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/myk9-platform-myk9show-[a-z0-9-]+\.vercel\.app$/i,
];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) ||
    ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin));
}

export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin = requestOrigin && isAllowedOrigin(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
