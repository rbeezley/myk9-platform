import { MYK9Q_ORIGINS, MYK9SHOW_ORIGINS, resolveCorsOrigin } from '../_shared/http/cors.ts';

// Validate-passcode is shared by myK9Q and myK9Show sign-in surfaces.
const ALLOWED_ORIGINS = [
  ...MYK9Q_ORIGINS,
  ...MYK9SHOW_ORIGINS.filter(origin => !MYK9Q_ORIGINS.includes(origin)),
];

export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin = resolveCorsOrigin(requestOrigin, ALLOWED_ORIGINS);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
