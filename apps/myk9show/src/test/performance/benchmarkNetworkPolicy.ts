import { AUDIT_READ_ONLY_RPCS } from '../e2e/helpers/sharedStagingWriteGuard';

// The additional admin checks are STABLE in migrations 156 and 124.
const readOnlyRpcNames = new Set([...AUDIT_READ_ONLY_RPCS, 'is_site_admin', 'is_platform_admin']);

/** Classify browser requests before they can reach shared staging services. */
export function benchmarkRequestDisposition(
  method: string,
  requestUrl: string,
  supabaseUrl: string | undefined
): 'continue' | 'acknowledge' | 'block' {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return 'continue';
  if (!supabaseUrl) return 'block';

  const url = new URL(requestUrl);
  const base = new URL(supabaseUrl);
  if (url.origin !== base.origin) return 'block';
  if (method === 'POST' && url.pathname === '/functions/v1/receive-logs') return 'acknowledge';
  if (method === 'POST' && url.pathname === '/rest/v1/analytics_events') return 'acknowledge';
  if (
    method === 'POST' &&
    url.pathname === '/auth/v1/token' &&
    url.searchParams.get('grant_type') === 'refresh_token'
  ) {
    return 'continue';
  }
  if (
    method === 'POST' &&
    url.pathname.startsWith('/rest/v1/rpc/') &&
    readOnlyRpcNames.has(url.pathname.split('/').at(-1) ?? '')
  ) {
    return 'continue';
  }
  return 'block';
}
