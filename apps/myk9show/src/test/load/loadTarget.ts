export type LoadTargetMode = 'discovery' | 'isolated' | 'staging' | 'e2e';

export interface LoadTargetInput {
  mode?: string;
  baseUrl: string;
  supabaseUrl: string;
  projectRef: string;
  approvedProjectRefs: readonly string[];
  deniedProjectRefs?: readonly string[];
  cloudApproved?: boolean;
  computeTier?: string;
}

export interface ResolvedLoadTarget {
  mode: Exclude<LoadTargetMode, 'discovery'>;
  baseUrl: string;
  supabaseUrl: string;
  projectRef: string;
  computeTier: string;
  gateEligible: boolean;
}

function parseHttpUrl(label: string, value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTP URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  return parsed;
}

function isLocalHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

export function inferSupabaseProjectRef(supabaseUrl: string): string {
  const hostname = parseHttpUrl('Supabase URL', supabaseUrl).hostname;
  if (isLocalHost(hostname)) return 'local';
  const suffix = '.supabase.co';
  if (!hostname.endsWith(suffix)) {
    throw new Error('Cloud Supabase URL must use a project-specific supabase.co host.');
  }
  return hostname.slice(0, -suffix.length);
}

export function resolveLoadTarget(input: LoadTargetInput): ResolvedLoadTarget {
  if (!['isolated', 'staging', 'e2e'].includes(input.mode ?? '')) {
    throw new Error('Load target mode must be isolated, staging, or e2e.');
  }

  const mode = input.mode as ResolvedLoadTarget['mode'];
  const baseUrl = parseHttpUrl('Application URL', input.baseUrl);
  const supabaseUrl = parseHttpUrl('Supabase URL', input.supabaseUrl);
  const inferredProjectRef = inferSupabaseProjectRef(input.supabaseUrl);

  if (input.projectRef !== inferredProjectRef) {
    throw new Error('Supabase project ref does not match the configured Supabase URL.');
  }
  if (!input.approvedProjectRefs.includes(input.projectRef)) {
    throw new Error('Supabase project is not in the explicit load-test allowlist.');
  }
  if (input.deniedProjectRefs?.includes(input.projectRef)) {
    throw new Error('Supabase project is explicitly denied for load tests.');
  }

  if (mode === 'isolated') {
    if (
      input.projectRef !== 'local' ||
      !isLocalHost(baseUrl.hostname) ||
      !isLocalHost(supabaseUrl.hostname)
    ) {
      throw new Error('Isolated load mode requires matching local application and Supabase hosts.');
    }
    return {
      mode,
      baseUrl: baseUrl.origin,
      supabaseUrl: supabaseUrl.origin,
      projectRef: 'local',
      computeTier: 'local-development (non-gate)',
      gateEligible: false,
    };
  }

  if (!input.cloudApproved) {
    throw new Error('Cloud load target requires explicit operator approval.');
  }
  if (!input.computeTier?.trim()) {
    throw new Error('Cloud load target requires a declared compute tier.');
  }
  if (isLocalHost(supabaseUrl.hostname)) {
    throw new Error('Cloud load target cannot resolve to a local Supabase host.');
  }

  return {
    mode,
    baseUrl: baseUrl.origin,
    supabaseUrl: supabaseUrl.origin,
    projectRef: input.projectRef,
    computeTier: input.computeTier.trim(),
    gateEligible: true,
  };
}

export function loadTargetFromEnv(env: NodeJS.ProcessEnv): ResolvedLoadTarget {
  const approvedProjectRefs = (env.LOAD_TEST_APPROVED_PROJECT_REFS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const deniedProjectRefs = (env.LOAD_TEST_DENIED_PROJECT_REFS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  return resolveLoadTarget({
    mode: env.LOAD_TEST_MODE,
    baseUrl: env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    supabaseUrl: env.VITE_SUPABASE_URL ?? '',
    projectRef: env.LOAD_TEST_SUPABASE_PROJECT_REF ?? '',
    approvedProjectRefs,
    deniedProjectRefs,
    cloudApproved: env.LOAD_TEST_CLOUD_APPROVED === 'true',
    computeTier: env.LOAD_TEST_COMPUTE_TIER,
  });
}
