import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { LOCAL_E2E_PROJECT_REF, resolveIsolatedE2eTarget } from './isolated-e2e-target';

export interface LocalSupabaseEnvironment {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
}

const REQUIRED_STATUS_KEYS = ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL'] as const;
const DEMO_SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const UNUSED_BROWSER_SUITE_SERVICES = [
  'analytics',
  'edge-runtime',
  'functions',
  'imgproxy',
  'inbucket',
  'meta',
  'studio',
  'vector',
] as const;

const POST_SEED_ASSERTION = `
SELECT
  (SELECT count(*) FROM public.shows WHERE id = '${DEMO_SHOW_ID}'),
  (SELECT count(*) FROM public.classes c JOIN public.trials t ON t.id = c.trial_id WHERE t.show_id = '${DEMO_SHOW_ID}'),
  (SELECT count(*) FROM public.judge_assignments ja JOIN public.classes c ON c.id = ja.class_id JOIN public.trials t ON t.id = c.trial_id WHERE t.show_id = '${DEMO_SHOW_ID}'),
  (SELECT count(*) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.is_active AND r.name IN ('secretary', 'club_admin', 'judge', 'steward', 'chairman'));
`;

export function parseSupabaseStatusEnv(output: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;

    const value = match[2].trim();
    values[match[1]] =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
        ? value.slice(1, -1)
        : value;
  }

  return values;
}

export function localSupabaseEnvironmentFromStatus(output: string): LocalSupabaseEnvironment {
  const values = parseSupabaseStatusEnv(output);
  const missing = REQUIRED_STATUS_KEYS.filter(key => !values[key]);
  if (missing.length > 0) {
    throw new Error(`Supabase local status is missing: ${missing.join(', ')}`);
  }

  return {
    apiUrl: values.API_URL,
    anonKey: values.ANON_KEY,
    serviceRoleKey: values.SERVICE_ROLE_KEY,
    dbUrl: values.DB_URL,
  };
}

export function buildJobEnvironment(local: LocalSupabaseEnvironment): Record<string, string> {
  return {
    MYK9_E2E_APPROVED_PROJECT_REFS: LOCAL_E2E_PROJECT_REF,
    MYK9_E2E_SUPABASE_PROJECT_REF: LOCAL_E2E_PROJECT_REF,
    MYK9_E2E_SUPABASE_URL: local.apiUrl,
    MYK9_E2E_SUPABASE_ANON_KEY: local.anonKey,
    VITE_SUPABASE_URL: local.apiUrl,
    VITE_SUPABASE_ANON_KEY: local.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
    SUPABASE_DB_URL: local.dbUrl,
  };
}

export function buildGithubEnvLines(local: LocalSupabaseEnvironment): string {
  const values = buildJobEnvironment(local);
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

export function resolveSupabaseCliCommand(env: NodeJS.ProcessEnv = process.env): string {
  return env.SUPABASE_CLI_BIN?.trim() || 'supabase';
}

export function localSupabaseStartArgs(): string[] {
  return ['start', '--exclude', UNUSED_BROWSER_SUITE_SERVICES.join(',')];
}

function redactLifecycleOutput(output: string): string {
  return output
    .replace(
      /\b(ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|DB_URL|POSTGRES_PASSWORD)=(?:"[^"]*"|'[^']*'|\S+)/g,
      '$1=[redacted]'
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-jwt]')
    .replace(/\bpostgres(?:ql)?:\/\/[^@\s]+@/g, 'postgresql://[redacted]@')
    .trim()
    .slice(-4000);
}

export function formatLifecycleFailure(label: string, detail = ''): string {
  const safeDetail = redactLifecycleOutput(detail);
  return safeDetail ? `${label} failed: ${safeDetail}` : `${label} failed`;
}

function capturedFailureOutput(error: unknown): string {
  if (!error || typeof error !== 'object') return '';

  const failure = error as { stderr?: string | Buffer; stdout?: string | Buffer };
  return [failure.stderr, failure.stdout]
    .map(value => (Buffer.isBuffer(value) ? value.toString('utf8') : (value ?? '')))
    .filter(Boolean)
    .join('\n');
}

function runCommand(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  options: { silent?: boolean } = {}
) {
  try {
    execFileSync(command, args, {
      cwd: process.cwd(),
      env,
      encoding: options.silent ? 'utf8' : undefined,
      stdio: options.silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
  } catch (error) {
    throw new Error(
      formatLifecycleFailure(label, options.silent ? capturedFailureOutput(error) : '')
    );
  }
}

function captureCommand(label: string, command: string, args: string[], env: NodeJS.ProcessEnv) {
  try {
    return execFileSync(command, args, {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } catch {
    throw new Error(formatLifecycleFailure(label));
  }
}

function readLocalEnvironment(env: NodeJS.ProcessEnv): LocalSupabaseEnvironment {
  const status = captureCommand(
    'Supabase status',
    resolveSupabaseCliCommand(env),
    ['status', '-o', 'env'],
    env
  );
  return localSupabaseEnvironmentFromStatus(status);
}

function writeJobEnvironment(local: LocalSupabaseEnvironment) {
  const githubEnvPath = process.env.GITHUB_ENV;
  if (githubEnvPath) {
    appendFileSync(githubEnvPath, buildGithubEnvLines(local), 'utf8');
  }
}

function runPostSeedAssertions(local: LocalSupabaseEnvironment, env: NodeJS.ProcessEnv) {
  const output = captureCommand(
    'Post-seed fixture verification',
    'psql',
    [local.dbUrl, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', POST_SEED_ASSERTION],
    env
  ).trim();

  const [showCount, classCount, assignmentCount, roleGrantCount] = output.split('|');
  if (
    showCount !== '1' ||
    Number(classCount) <= 0 ||
    Number(assignmentCount) <= 0 ||
    Number(roleGrantCount) <= 0
  ) {
    throw new Error('Post-seed fixture verification failed');
  }
}

function seedIsolatedAccounts(local: LocalSupabaseEnvironment, env: NodeJS.ProcessEnv) {
  runCommand(
    'Isolated E2E account database seed',
    'psql',
    [local.dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/seed-isolated-e2e-accounts.sql'],
    env
  );
}

function seedIsolatedPlatformGrants(local: LocalSupabaseEnvironment, env: NodeJS.ProcessEnv) {
  runCommand(
    'Isolated E2E platform grant mirror',
    'psql',
    [local.dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/seed-isolated-e2e-platform-grants.sql'],
    env
  );
}

function resetAndSeed(local: LocalSupabaseEnvironment, baseEnv: NodeJS.ProcessEnv) {
  const jobEnv = { ...baseEnv, ...buildJobEnvironment(local) };
  resolveIsolatedE2eTarget(jobEnv);

  runCommand('Supabase database reset', resolveSupabaseCliCommand(jobEnv), ['db', 'reset'], jobEnv);
  seedIsolatedPlatformGrants(local, jobEnv);
  runCommand(
    'E2E account setup',
    'pnpm',
    ['--dir', 'apps/myk9show', 'exec', 'tsx', 'scripts/setup-e2e-test-users.ts'],
    { ...jobEnv, MYK9_E2E_AUTH_ONLY: 'true' }
  );
  seedIsolatedAccounts(local, jobEnv);
  runCommand(
    'Deterministic demo seed',
    'psql',
    [local.dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/seed-demo.sql'],
    jobEnv
  );
  seedIsolatedAccounts(local, jobEnv);
  runPostSeedAssertions(local, jobEnv);
}

function assertPreparationIntent(env: NodeJS.ProcessEnv) {
  if (env.MYK9_PLAYWRIGHT_REGRESSION_ENABLED !== 'true') {
    throw new Error('Set MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true before preparing E2E data');
  }
  if (env.MYK9_PLAYWRIGHT_REGRESSION_TARGET !== 'isolated') {
    throw new Error('Set MYK9_PLAYWRIGHT_REGRESSION_TARGET=isolated before preparing E2E data');
  }
  if (env.MYK9_E2E_APPROVED_PROJECT_REFS !== LOCAL_E2E_PROJECT_REF) {
    throw new Error('The local preparation command requires MYK9_E2E_APPROVED_PROJECT_REFS=local');
  }
  if (env.MYK9_E2E_SUPABASE_PROJECT_REF !== LOCAL_E2E_PROJECT_REF) {
    throw new Error('The local preparation command requires MYK9_E2E_SUPABASE_PROJECT_REF=local');
  }
}

function prepare() {
  assertPreparationIntent(process.env);
  runCommand(
    'Supabase start',
    resolveSupabaseCliCommand(process.env),
    localSupabaseStartArgs(),
    process.env,
    {
      silent: true,
    }
  );
  const local = readLocalEnvironment(process.env);
  const jobEnv = { ...process.env, ...buildJobEnvironment(local) };
  resolveIsolatedE2eTarget(jobEnv);
  writeJobEnvironment(local);
  resetAndSeed(local, jobEnv);
  console.log(`Isolated E2E target prepared: ${LOCAL_E2E_PROJECT_REF}`);
}

function reset() {
  const local = readLocalEnvironment(process.env);
  const jobEnv = { ...process.env, ...buildJobEnvironment(local) };
  resolveIsolatedE2eTarget(jobEnv);
  writeJobEnvironment(local);
  resetAndSeed(local, jobEnv);
  console.log(`Isolated E2E target reset: ${LOCAL_E2E_PROJECT_REF}`);
}

function stop() {
  runCommand(
    'Supabase stop',
    resolveSupabaseCliCommand(process.env),
    ['stop', '--no-backup'],
    process.env
  );
  console.log('Isolated E2E target stopped');
}

export function main(command = process.argv[2] ?? 'prepare') {
  if (command === 'prepare') prepare();
  else if (command === 'reset') reset();
  else if (command === 'stop') stop();
  else throw new Error(`Unknown isolated E2E lifecycle command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
