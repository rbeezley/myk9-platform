/**
 * MYK9-1934: the native (no Docker) runtime for the isolated E2E lifecycle.
 *
 * This Mac has no Docker, and the Docker-service `--exclude` list the CI path passes is rejected
 * by the native runtime. These helpers pick the runtime, name this worktree's stack, and build the
 * env a spec run needs. They are pure so the lifecycle's tests can pin them; the lifecycle owns
 * every command it runs.
 */
import { realpathSync } from 'node:fs';

import { LOCAL_E2E_PROJECT_REF } from './isolated-e2e-target';
import type { LocalSupabaseEnvironment } from './isolated-e2e-lifecycle';

export type E2eRuntime = 'docker' | 'native';

export const NATIVE_STACK_ENV = { SUPABASE_EXPERIMENTAL_STACK: '1' } as const;
const NATIVE_EXCLUDED_SERVICES = ['studio', 'mail', 'analytics', 'pooler'] as const;

/** `MYK9_E2E_RUNTIME` wins; on CI it is Docker; otherwise native exactly when Docker is absent. */
export function chooseRuntime(env: NodeJS.ProcessEnv, dockerAvailable: boolean): E2eRuntime {
  const forced = env.MYK9_E2E_RUNTIME?.trim();
  if (forced === 'native' || forced === 'docker') return forced;
  if (forced) throw new Error(`MYK9_E2E_RUNTIME must be "native" or "docker", got "${forced}"`);
  // CI always has Docker. A failed `docker info` there is a sick daemon, which must fail loudly
  // on the Docker path rather than quietly start a native stack.
  if (env.CI === 'true' || env.GITHUB_ACTIONS === 'true') return 'docker';
  return dockerAvailable ? 'docker' : 'native';
}

export function nativeStartArgs(): string[] {
  return ['start', '--runtime', 'native', '--exclude', NATIVE_EXCLUDED_SERVICES.join(',')];
}

/** The `prepare` intent variables, defaulted for a native run the command itself owns. */
export function nativeIntentDefaults(env: NodeJS.ProcessEnv): Record<string, string> {
  return {
    MYK9_PLAYWRIGHT_REGRESSION_ENABLED: env.MYK9_PLAYWRIGHT_REGRESSION_ENABLED ?? 'true',
    MYK9_PLAYWRIGHT_REGRESSION_TARGET: env.MYK9_PLAYWRIGHT_REGRESSION_TARGET ?? 'isolated',
    MYK9_E2E_APPROVED_PROJECT_REFS: env.MYK9_E2E_APPROVED_PROJECT_REFS ?? LOCAL_E2E_PROJECT_REF,
    MYK9_E2E_SUPABASE_PROJECT_REF: env.MYK9_E2E_SUPABASE_PROJECT_REF ?? LOCAL_E2E_PROJECT_REF,
  };
}

/** `supabase status --output-format json` carries the values under `.env`. */
export function nativeStatusToEnv(json: string): string {
  const parsed = JSON.parse(json) as { env?: Record<string, unknown> };
  const values = parsed.env ?? {};
  return Object.entries(values)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n');
}

interface StackListEntry {
  id?: unknown;
  project_root?: unknown;
}

/** Exact comparison key for a worktree path: symlinks resolved, trailing slashes stripped. */
export function normalizeProjectRoot(path: string): string {
  let resolved = path;
  try {
    resolved = realpathSync(path);
  } catch {
    // A stale stack can name a path that no longer exists; compare it as written.
  }
  return resolved.length > 1 ? resolved.replace(/\/+$/, '') : resolved;
}

/**
 * The id of the stack whose `project_root` is exactly this worktree (after normalisation, never a
 * prefix match), or undefined. Other worktrees' stacks (some stale) never match, so teardown
 * cannot touch them. Several matches throw.
 */
export function findOptionalStackIdForProjectRoot(
  listJson: string,
  projectRoot: string
): string | undefined {
  const parsed = JSON.parse(listJson) as { stacks?: StackListEntry[] };
  const wanted = normalizeProjectRoot(projectRoot);
  const ids = (parsed.stacks ?? [])
    .filter(
      stack =>
        typeof stack.project_root === 'string' &&
        typeof stack.id === 'string' &&
        normalizeProjectRoot(stack.project_root) === wanted
    )
    .map(stack => String(stack.id));
  const [only, ...rest] = ids;
  if (rest.length > 0) {
    throw new Error(`Several native Supabase stacks name ${projectRoot}; destroy them by hand`);
  }
  return only;
}

export function findStackIdForProjectRoot(listJson: string, projectRoot: string): string {
  const id = findOptionalStackIdForProjectRoot(listJson, projectRoot);
  if (id === undefined) throw new Error(`No native Supabase stack found for ${projectRoot}`);
  return id;
}

export function stackDestroyArgs(stackId: string): string[] {
  return ['stack', 'destroy', '--stack-id', stackId.slice(0, 12), '--yes'];
}

/** The public part of a spec run's env: what the run summary prints. No service key. */
export function specRunEnv(local: LocalSupabaseEnvironment): Record<string, string> {
  return {
    VITE_SUPABASE_URL: local.apiUrl,
    MYK9_E2E_SUPABASE_URL: local.apiUrl,
    VITE_SUPABASE_ANON_KEY: local.anonKey,
    VITE_SUPABASE_PUBLISHABLE_KEY: local.anonKey,
    MYK9_E2E_SUPABASE_ANON_KEY: local.anonKey,
  };
}

export function formatSpecRunSummary(local: LocalSupabaseEnvironment): string {
  const lines = Object.entries(specRunEnv(local)).map(([key, value]) => `${key}=${value}`);
  return [
    'Spec run env (pnpm qa:isolated-e2e:run sets these for you):',
    ...lines.map(line => `  ${line}`),
    'Run a spec: pnpm qa:isolated-e2e:run <spec path> [playwright flags]',
    'Tear down:  pnpm qa:isolated-e2e:teardown',
  ].join('\n');
}

// Native runs every supabase call with the experimental-stack flag set.
export function withRuntimeEnv(env: NodeJS.ProcessEnv, runtime: E2eRuntime): NodeJS.ProcessEnv {
  return runtime === 'native' ? { ...env, ...NATIVE_STACK_ENV } : env;
}

/**
 * The env a spec run gets. The local stack's service key, DB URL and API URL are set last, so
 * whatever the shell or .env.local carried (a production key included) never reaches a spec.
 * They go to the child process only; the printed summary never includes them.
 */
export function buildSpecEnv(
  base: NodeJS.ProcessEnv,
  local: LocalSupabaseEnvironment,
  jobEnv: Record<string, string>
): NodeJS.ProcessEnv {
  return {
    ...base,
    ...jobEnv,
    ...specRunEnv(local),
    SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
    SUPABASE_DB_URL: local.dbUrl,
    SUPABASE_URL: local.apiUrl,
  };
}

/** Adds the single-worker chromium defaults unless the caller already chose either. */
export function withPlaywrightDefaults(args: string[]): string[] {
  const has = (flag: string) => args.some(arg => arg === flag || arg.startsWith(`${flag}=`));
  return [
    ...args,
    ...(has('--workers') || has('-j') ? [] : ['--workers=1']),
    ...(has('--project') ? [] : ['--project=chromium']),
  ];
}

/** E2E_*_PASSWORD values from .env.local text; keys already in `env` are skipped. */
export function parseE2ePasswords(content: string, env: NodeJS.ProcessEnv): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^(E2E_[A-Z0-9_]*PASSWORD)=(.*)$/);
    const key = match?.[1];
    const raw = match?.[2]?.trim();
    if (key === undefined || raw === undefined || env[key]) continue;
    const quoted = raw.match(/^(["'])(.*?)\1(?:\s+#.*)?$/);
    values[key] = quoted?.[2] ?? raw.replace(/\s+#.*$/, '');
  }
  return values;
}
