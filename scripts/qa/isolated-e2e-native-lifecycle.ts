/**
 * MYK9-1934: native (no Docker) orchestration for the isolated E2E lifecycle. The Docker path and
 * the shared seeding stay in isolated-e2e-lifecycle.ts, which dispatches here.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertPreparationIntent,
  buildJobEnvironment,
  captureCommand,
  readLocalEnvironment,
  resetAndSeed,
  resolveSupabaseCliCommand,
  runCommand,
} from './isolated-e2e-lifecycle';
import {
  buildSpecEnv,
  chooseRuntime,
  findOptionalStackIdForProjectRoot,
  findStackIdForProjectRoot,
  formatSpecRunSummary,
  nativeIntentDefaults,
  nativeStartArgs,
  parseE2ePasswords,
  stackDestroyArgs,
  withPlaywrightDefaults,
  withRuntimeEnv,
  type E2eRuntime,
} from './isolated-e2e-native';
import { LOCAL_E2E_PROJECT_REF, resolveIsolatedE2eTarget } from './isolated-e2e-target';
import { describePortHolder, detectBindFailurePort } from './port-conflict-diagnostics';

export function dockerAvailable(env: NodeJS.ProcessEnv): boolean {
  try {
    execFileSync('docker', ['info'], { env, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function currentRuntime(env: NodeJS.ProcessEnv): E2eRuntime {
  const forced = env.MYK9_E2E_RUNTIME?.trim();
  return chooseRuntime(env, forced ? true : dockerAvailable(env));
}

// The E2E_*_PASSWORD values live in the main checkout's .env.local, which a worktree does not
// copy. Only keys the shell has not set are read; values are never printed.
function mainCheckoutE2ePasswords(env: NodeJS.ProcessEnv): Record<string, string> {
  const root = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' })
    .split('\n')[0]
    ?.replace(/^worktree /, '');
  const file = root ? resolve(root, 'apps/myk9show/.env.local') : '';
  if (!file || !existsSync(file)) return {};
  return parseE2ePasswords(readFileSync(file, 'utf8'), env);
}

function listStacks(env: NodeJS.ProcessEnv): string {
  return captureCommand(
    'Supabase stack list',
    resolveSupabaseCliCommand(env),
    ['stack', 'list', '--output-format', 'json'],
    withRuntimeEnv(env, 'native')
  );
}

function destroyStack(env: NodeJS.ProcessEnv, stackId: string) {
  runCommand(
    'Supabase stack destroy',
    resolveSupabaseCliCommand(env),
    stackDestroyArgs(stackId),
    withRuntimeEnv(env, 'native')
  );
}

// Always starts from a clean database: a stack this worktree already has (running, dirtied by a
// spec, or half-seeded) is destroyed first, because `db reset` is not offered on native stacks.
export function prepareNative() {
  const baseEnv = {
    ...mainCheckoutE2ePasswords(process.env),
    ...process.env,
    ...nativeIntentDefaults(process.env),
  };
  assertPreparationIntent(baseEnv);
  const existing = findOptionalStackIdForProjectRoot(listStacks(baseEnv), process.cwd());
  if (existing !== undefined) {
    console.log("Destroying this worktree's existing native stack so prepare starts clean");
    destroyStack(baseEnv, existing);
  }
  try {
    runCommand(
      'Supabase start (native)',
      resolveSupabaseCliCommand(baseEnv),
      nativeStartArgs(),
      withRuntimeEnv(baseEnv, 'native'),
      { silent: true }
    );
  } catch (error) {
    const port = detectBindFailurePort(error instanceof Error ? error.message : String(error));
    if (port !== null) console.error(describePortHolder(port));
    throw error;
  }
  try {
    const local = readLocalEnvironment(baseEnv, 'native');
    const jobEnv = { ...baseEnv, ...buildJobEnvironment(local) };
    resolveIsolatedE2eTarget(jobEnv);
    resetAndSeed(local, jobEnv, { skipDbReset: true });
    console.log(`Isolated E2E target prepared (native): ${LOCAL_E2E_PROJECT_REF}`);
    console.log(formatSpecRunSummary(local));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\nThe native Supabase stack for this worktree is still running. ` +
        'Remove it with: pnpm qa:isolated-e2e:teardown'
    );
  }
}

export function teardown() {
  const stackId = findStackIdForProjectRoot(listStacks(process.env), process.cwd());
  destroyStack(process.env, stackId);
  console.log('Isolated E2E native stack destroyed (this worktree only)');
}

export function runSpec(args: string[]) {
  if (args.length === 0) throw new Error('Usage: pnpm qa:isolated-e2e:run <spec> [flags]');
  const local = readLocalEnvironment(process.env, 'native');
  const specEnv = buildSpecEnv(
    {
      ...mainCheckoutE2ePasswords(process.env),
      ...process.env,
      ...nativeIntentDefaults(process.env),
    },
    local,
    buildJobEnvironment(local)
  );
  resolveIsolatedE2eTarget(specEnv);
  const result = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', ...withPlaywrightDefaults(args)],
    {
      cwd: resolve(process.cwd(), 'apps/myk9show'),
      env: specEnv,
      stdio: 'inherit',
    }
  );
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}
