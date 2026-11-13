/**
 * MYK9-1934: the native (no Docker) runtime for the isolated E2E lifecycle.
 *
 * This Mac has no Docker, and the Docker-service `--exclude` list the CI path passes is rejected
 * by the native runtime. These helpers pick the runtime, name this worktree's stack, and build the
 * env a spec run needs. They are pure so the lifecycle's tests can pin them; the lifecycle owns
 * every command it runs.
 */
import { LOCAL_E2E_PROJECT_REF } from './isolated-e2e-target';
import type { LocalSupabaseEnvironment } from './isolated-e2e-lifecycle';

export type E2eRuntime = 'docker' | 'native';

export const NATIVE_STACK_ENV = { SUPABASE_EXPERIMENTAL_STACK: '1' } as const;
const NATIVE_EXCLUDED_SERVICES = ['studio', 'mail', 'analytics', 'pooler'] as const;

/** `MYK9_E2E_RUNTIME` wins; otherwise native exactly when Docker is absent. */
export function chooseRuntime(env: NodeJS.ProcessEnv, dockerAvailable: boolean): E2eRuntime {
  const forced = env.MYK9_E2E_RUNTIME?.trim();
  if (forced === 'native' || forced === 'docker') return forced;
  if (forced) throw new Error(`MYK9_E2E_RUNTIME must be "native" or "docker", got "${forced}"`);
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

/**
 * The id of the stack whose `project_root` is exactly this worktree. Other worktrees' stacks
 * (some stale) are never matched, so teardown cannot touch them. Zero or several matches throw.
 */
export function findStackIdForProjectRoot(listJson: string, projectRoot: string): string {
  const parsed = JSON.parse(listJson) as { stacks?: StackListEntry[] };
  const ids = (parsed.stacks ?? [])
    .filter(stack => stack.project_root === projectRoot && typeof stack.id === 'string')
    .map(stack => String(stack.id));
  const [only, ...rest] = ids;
  if (only === undefined) throw new Error(`No native Supabase stack found for ${projectRoot}`);
  if (rest.length > 0) {
    throw new Error(`Several native Supabase stacks name ${projectRoot}; destroy them by hand`);
  }
  return only;
}

export function stackDestroyArgs(stackId: string): string[] {
  return ['stack', 'destroy', '--stack-id', stackId.slice(0, 12), '--yes'];
}

/** What a spec run needs from the stack. The service key is deliberately not here. */
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
