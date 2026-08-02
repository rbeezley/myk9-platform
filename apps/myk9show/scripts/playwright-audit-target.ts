const SHARED_STAGING_PROJECT_REF = 'sojmvhhwsjxmfistvzbe';

export const AUDIT_SERVER_IDENTITY_PATH = '/__myk9/audit-server-identity';
export const INTERCEPTED_STAGING_TARGET = 'shared-staging-intercepted';

interface AuditEnvironment {
  PLAYWRIGHT_AUDIT_BASE_URL?: string;
  PLAYWRIGHT_AUDIT_SERVER_ID?: string;
  PLAYWRIGHT_AUDIT_DATA_TARGET?: string;
  VITE_SUPABASE_URL?: string;
}

export interface AuditTarget {
  baseURL: string;
  serverId: string;
  dataTarget: typeof INTERCEPTED_STAGING_TARGET;
}

export function resolveAuditTarget(environment: AuditEnvironment): AuditTarget {
  const rawBaseURL = environment.PLAYWRIGHT_AUDIT_BASE_URL?.trim();
  const serverId = environment.PLAYWRIGHT_AUDIT_SERVER_ID?.trim();
  const dataTarget = environment.PLAYWRIGHT_AUDIT_DATA_TARGET?.trim();
  const supabaseURL = environment.VITE_SUPABASE_URL?.trim();

  if (!rawBaseURL) {
    throw new Error('PLAYWRIGHT_AUDIT_BASE_URL is required for an audit run.');
  }
  if (!serverId) {
    throw new Error('PLAYWRIGHT_AUDIT_SERVER_ID is required for an audit run.');
  }
  if (dataTarget !== INTERCEPTED_STAGING_TARGET) {
    throw new Error(
      `PLAYWRIGHT_AUDIT_DATA_TARGET must be ${INTERCEPTED_STAGING_TARGET}; audit writes must be intercepted.`
    );
  }

  const baseURL = parseURL(rawBaseURL, 'PLAYWRIGHT_AUDIT_BASE_URL');
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (
    baseURL.protocol !== 'http:' ||
    !allowedHosts.has(baseURL.hostname) ||
    baseURL.pathname !== '/' ||
    baseURL.search ||
    baseURL.hash ||
    baseURL.username ||
    baseURL.password
  ) {
    throw new Error('PLAYWRIGHT_AUDIT_BASE_URL must be an unambiguous loopback HTTP origin.');
  }

  const supabase = parseURL(supabaseURL ?? '', 'VITE_SUPABASE_URL');
  if (
    supabase.protocol !== 'https:' ||
    supabase.hostname !== `${SHARED_STAGING_PROJECT_REF}.supabase.co`
  ) {
    throw new Error('VITE_SUPABASE_URL does not identify the declared shared staging target.');
  }

  return {
    baseURL: baseURL.origin,
    serverId,
    dataTarget: INTERCEPTED_STAGING_TARGET,
  };
}

export function verifyAuditServerIdentity(payload: unknown, expectedServerId: string): void {
  if (!isRecord(payload) || payload.app !== 'myk9show' || payload.serverId !== expectedServerId) {
    throw new Error('The app server identity does not match PLAYWRIGHT_AUDIT_SERVER_ID.');
  }
}

function parseURL(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
