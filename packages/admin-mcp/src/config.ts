/**
 * Configuration loading for the local site-admin MCP server.
 *
 * Fails closed: any missing/invalid required env var throws an
 * {@link AdminMcpConfigError} rather than returning a partial config, so the
 * server never starts with ambiguous credentials or unbounded limits.
 *
 * Verified schema/env anchors live in docs/plan-site-admin-mcp-v1.md
 * ("Verified Schema Anchors"). Keep env var names in sync with that section
 * and docs/admin-mcp-local-setup.md.
 */

export type EnvLabel = 'local' | 'staging' | 'production';

export interface AdminMcpConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  appBaseUrl: string;
  envLabel: EnvLabel;
  defaultLimit: number;
  maxLimit: number;
}

const ENV_LABELS: readonly EnvLabel[] = ['local', 'staging', 'production'];

/** Hard ceiling on any list-tool limit, regardless of configured max. */
const HARD_MAX_LIMIT = 100;
const FALLBACK_DEFAULT_LIMIT = 25;
const FALLBACK_MAX_LIMIT = 50;

export class AdminMcpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminMcpConfigError';
  }
}

function requireString(env: NodeJS.ProcessEnv, key: string): string {
  const raw = env[key];
  if (raw == null || raw.trim() === '') {
    throw new AdminMcpConfigError(`Missing required env var ${key}`);
  }
  return raw.trim();
}

/**
 * Require an env var that is an absolute http(s) URL. Rejects relative paths
 * (`/`), non-http schemes (`javascript:`, `ftp:`), and malformed values so
 * deep links are never broken or unsafe. Returns the validated raw string.
 */
function requireHttpUrl(env: NodeJS.ProcessEnv, key: string): string {
  const raw = requireString(env, key);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AdminMcpConfigError(
      `${key} must be an absolute http(s) URL, received "${raw}"`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AdminMcpConfigError(
      `${key} must use the http or https scheme, received "${raw}"`,
    );
  }
  return raw;
}

function parsePositiveIntLimit(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
): number {
  const raw = env[key];
  if (raw == null || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AdminMcpConfigError(
      `${key} must be a positive integer, received "${raw}"`,
    );
  }
  return parsed;
}

export function loadAdminMcpConfig(env: NodeJS.ProcessEnv): AdminMcpConfig {
  const supabaseUrl = requireHttpUrl(env, 'MYK9_MCP_SUPABASE_URL');

  const supabaseServiceRoleKey = requireString(
    env,
    'MYK9_MCP_SUPABASE_SERVICE_ROLE_KEY',
  );

  // Validate as an absolute http(s) URL, then trim trailing slashes so link
  // building can join paths cleanly.
  const appBaseUrl = requireHttpUrl(env, 'MYK9_MCP_APP_BASE_URL').replace(
    /\/+$/,
    '',
  );

  const envLabelRaw = requireString(env, 'MYK9_MCP_ENV_LABEL');
  if (!ENV_LABELS.includes(envLabelRaw as EnvLabel)) {
    throw new AdminMcpConfigError(
      `MYK9_MCP_ENV_LABEL must be one of ${ENV_LABELS.join(', ')}, received "${envLabelRaw}"`,
    );
  }
  const envLabel = envLabelRaw as EnvLabel;

  // Cap the configured max at the hard ceiling; clamp default below max.
  const configuredMax = parsePositiveIntLimit(
    env,
    'MYK9_MCP_MAX_LIMIT',
    FALLBACK_MAX_LIMIT,
  );
  const maxLimit = Math.min(configuredMax, HARD_MAX_LIMIT);

  const configuredDefault = parsePositiveIntLimit(
    env,
    'MYK9_MCP_DEFAULT_LIMIT',
    FALLBACK_DEFAULT_LIMIT,
  );
  const defaultLimit = Math.min(configuredDefault, maxLimit);

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    appBaseUrl,
    envLabel,
    defaultLimit,
    maxLimit,
  };
}
