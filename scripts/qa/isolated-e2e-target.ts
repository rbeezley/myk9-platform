export const SHARED_STAGING_PROJECT_REF = 'sojmvhhwsjxmfistvzbe';
export const LOCAL_E2E_PROJECT_REF = 'local';

export interface IsolatedE2eTarget {
  projectRef: string;
  supabaseUrl: string;
  isLocal: boolean;
}

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing isolated E2E configuration: ${name}`);
  return value;
}

function parseUrl(value: string, name: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid isolated E2E URL: ${name}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid isolated E2E URL protocol: ${name}`);
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`Isolated E2E URL must be an origin: ${name}`);
  }

  return parsed;
}

function approvedProjectRefs(env: NodeJS.ProcessEnv): string[] {
  const refs = requireValue(env, 'MYK9_E2E_APPROVED_PROJECT_REFS')
    .split(',')
    .map(ref => ref.trim())
    .filter(Boolean);

  if (refs.length === 0 || refs.includes(SHARED_STAGING_PROJECT_REF)) {
    throw new Error('Isolated E2E approved project refs are invalid');
  }

  return refs;
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function resolveIsolatedE2eTarget(env: NodeJS.ProcessEnv): IsolatedE2eTarget {
  if (env.MYK9_PLAYWRIGHT_REGRESSION_ENABLED !== 'true') {
    throw new Error('Stateful Playwright regression is not enabled');
  }

  if (env.MYK9_PLAYWRIGHT_REGRESSION_TARGET !== 'isolated') {
    throw new Error(
      'Stateful Playwright regression requires MYK9_PLAYWRIGHT_REGRESSION_TARGET=isolated'
    );
  }

  const projectRef = requireValue(env, 'MYK9_E2E_SUPABASE_PROJECT_REF');
  const targetUrlValue = requireValue(env, 'MYK9_E2E_SUPABASE_URL');
  const buildUrlValue = requireValue(env, 'VITE_SUPABASE_URL');
  const targetUrl = parseUrl(targetUrlValue, 'MYK9_E2E_SUPABASE_URL');
  const buildUrl = parseUrl(buildUrlValue, 'VITE_SUPABASE_URL');

  if (projectRef === SHARED_STAGING_PROJECT_REF) {
    throw new Error('Shared staging is not an approved isolated E2E target');
  }

  if (
    targetUrl.hostname.includes(SHARED_STAGING_PROJECT_REF) ||
    buildUrl.hostname.includes(SHARED_STAGING_PROJECT_REF)
  ) {
    throw new Error('Shared staging is not an approved isolated E2E target');
  }

  if (!approvedProjectRefs(env).includes(projectRef)) {
    throw new Error('Isolated E2E project ref is not on the approved allowlist');
  }

  if (projectRef !== LOCAL_E2E_PROJECT_REF) {
    throw new Error('Only the disposable local E2E target is supported');
  }

  if (targetUrl.origin !== buildUrl.origin) {
    throw new Error('VITE_SUPABASE_URL does not match the isolated E2E target URL');
  }

  if (!isLoopback(targetUrl.hostname)) {
    throw new Error('The local isolated E2E target must use a loopback URL');
  }

  return {
    projectRef,
    supabaseUrl: targetUrl.origin,
    isLocal: projectRef === LOCAL_E2E_PROJECT_REF,
  };
}
