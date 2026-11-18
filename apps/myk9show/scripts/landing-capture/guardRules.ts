// The capture write guard's rules, as pure functions with no imports so they can be tested
// (src/test/scripts/landingCaptureGuard.test.ts) and loaded by node without a build.

/** Keep the same as PRODUCTION_PROJECT_REF in src/test/productionFixtureGuard.ts. */
export const PRODUCTION_PROJECT_REF = 'sojmvhhwsjxmfistvzbe';

/** True when a request's host is the production Supabase project. */
export function isProductionHost(hostname: string): boolean {
  return hostname.split('.').includes(PRODUCTION_PROJECT_REF);
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const READ_RPC = /^(get_|is_|list_|has_|can_|tv_|find_)/;
// Reads whose names do not say so. Both are declared STABLE in their migrations
// (20261031014300 and 20261113224300); check the definition before adding a name here.
const READ_RPC_NAMES = new Set([
  'entry_results_changed_since',
  'ringside_claim_generation_current',
]);

/** The RPC a PostgREST path calls, if it calls one. */
export function rpcName(pathname: string): string | undefined {
  return pathname.match(/\/rest\/v1\/rpc\/([^/?]+)/)?.[1];
}

export function isReadMethod(method: string): boolean {
  return READ_METHODS.has(method);
}

/**
 * Whether a request may leave the machine. GET/HEAD/OPTIONS read. Of the POSTs, only the
 * token endpoint (sign-in and refresh) and RPCs with a read name pass: RPCs are POSTs and some
 * write, so "/rpc/" is never let through as a whole, and neither is the rest of "/auth/v1/"
 * (sign-out, sign-up and recovery all change something).
 */
export function isReadRequest(method: string, pathname: string): boolean {
  if (isReadMethod(method)) return true;
  if (method !== 'POST') return false;
  if (pathname === '/auth/v1/token') return true;
  const rpc = rpcName(pathname);
  return rpc !== undefined && (READ_RPC.test(rpc) || READ_RPC_NAMES.has(rpc));
}

/**
 * A patch that drops rows must also shrink Content-Range ("0-48/49", or "*\/49" on a count
 * probe), or the app's sync sees fewer rows than the server promised and treats its copy of
 * the show as incomplete.
 */
export function rangeHeaders(
  headers: Record<string, string>,
  before: unknown,
  after: unknown
): Record<string, string> {
  const range = headers['content-range']?.match(/^(?:(\d+)-(\d+)|\*)\/(\d+|\*)$/);
  if (!range || !Array.isArray(before) || !Array.isArray(after)) return headers;
  const dropped = before.length - after.length;
  if (dropped === 0) return headers;
  const [, from, to, total] = range;
  const count = total === '*' ? '*' : String(Number(total) - dropped);
  const end = Number(to) - dropped;
  const rows = from === undefined || end < Number(from) ? '*' : `${from}-${end}`;
  return { ...headers, 'content-range': `${rows}/${count}` };
}
