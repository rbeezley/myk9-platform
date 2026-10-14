/**
 * MYK9-971: serve the app's edge functions on the isolated Playwright Regression target.
 *
 * `supabase start` runs from the repository root, so its edge runtime serves `supabase/functions`.
 * The myK9Show functions the waitlist journey needs (cron-waitlist-expiration,
 * decline-waitlist-offer, withdraw-waitlist-offer, the Stripe functions) live only in
 * `apps/myk9show/supabase/functions`. The two trees share no function name, and their `_shared`
 * folders share only byte-identical files, so a union of the two is exactly what production runs.
 *
 * The union is staged INTO THE CI CHECKOUT before `supabase start`, never committed: the runner is
 * thrown away afterwards. Anything that would make the union lossy (a function in both trees, or a
 * `_shared` file that differs) aborts instead of choosing a side.
 *
 * Production deploys every function with `--no-verify-jwt` (each one authenticates its own caller),
 * but the local gateway verifies JWTs unless `config.toml` says otherwise. Without the same setting
 * here, the cron's `Bearer <CRON_SECRET>` is rejected as an invalid JWT before the function runs.
 */
import {
  appendFileSync,
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';

export const ROOT_FUNCTIONS_DIR = 'supabase/functions';
export const APP_FUNCTIONS_DIR = 'apps/myk9show/supabase/functions';
export const SUPABASE_CONFIG_FILE = 'supabase/config.toml';
const SHARED_DIR = '_shared';

/**
 * Test-only secrets for the local edge runtime. `STRIPE_SECRET_KEY` here is the fallback dummy: a
 * run with no Stripe test-mode key (a PR run, a fork, a laptop) serves the functions with it, and
 * the journey's paid leg skips. When the workflow supplies `STRIPE_TEST_SECRET_KEY` (a Stripe
 * sandbox `sk_test_` key), `isolatedFunctionSecrets` swaps it in so the paid leg (MYK9-971) reaches
 * real test-mode Stripe; any other non-empty value refuses to stage. The key never lands in this
 * file, the repository or a log: only in the runner's throwaway `functions/.env`.
 *
 * The webhook secrets stay local dummies: Stripe cannot reach the runner, so the spec delivers the
 * real `checkout.session.completed` event to the local `stripe-webhook` signed with this one.
 */
export const ISOLATED_FUNCTION_SECRETS = {
  CRON_SECRET: 'isolated-e2e-cron-secret',
  PUSH_WEBHOOK_SECRET: 'isolated-e2e-push-webhook-secret',
  STRIPE_SECRET_KEY: 'sk_test_isolated_e2e_no_stripe_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_isolated_e2e_local_only',
  STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_isolated_e2e_connect_local_only',
  SENTRY_ENVIRONMENT: 'isolated-e2e',
} as const;

const STRIPE_TEST_KEY_PREFIX = 'sk_test_';

/**
 * The Stripe key the local functions get: `STRIPE_TEST_SECRET_KEY` when it is a test-mode secret
 * key, the dummy when it is unset or blank. Anything else (a live key, a restricted key, a typo)
 * throws, and the message never repeats the value.
 */
export function resolveIsolatedStripeSecretKey(env: NodeJS.ProcessEnv): string {
  const key = env.STRIPE_TEST_SECRET_KEY?.trim();
  if (!key) return ISOLATED_FUNCTION_SECRETS.STRIPE_SECRET_KEY;
  if (!key.startsWith(STRIPE_TEST_KEY_PREFIX)) {
    throw new Error(
      `STRIPE_TEST_SECRET_KEY must be a Stripe test-mode secret key (${STRIPE_TEST_KEY_PREFIX}...); ` +
        'refusing to serve the isolated target with any other key.'
    );
  }
  return key;
}

export function isolatedFunctionSecrets(env: NodeJS.ProcessEnv): Record<string, string> {
  return { ...ISOLATED_FUNCTION_SECRETS, STRIPE_SECRET_KEY: resolveIsolatedStripeSecretKey(env) };
}

export interface FunctionStagingPlan {
  /** Whole function directories copied from the app tree. */
  functionDirs: string[];
  /** `_shared` files (relative to `_shared`) copied because the root tree lacks them. */
  sharedFiles: string[];
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path));
    }
  };
  walk(dir);
  return out.sort();
}

function listDirs(dir: string): string[] {
  return readdirSync(dir)
    .filter(name => statSync(join(dir, name)).isDirectory())
    .sort();
}

/** What staging would copy, or a thrown error naming every collision that would lose code. */
export function planAppFunctionStaging(repoRoot: string): FunctionStagingPlan {
  const rootDir = join(repoRoot, ROOT_FUNCTIONS_DIR);
  const appDir = join(repoRoot, APP_FUNCTIONS_DIR);
  const rootFunctions = new Set(listDirs(rootDir));
  const collisions: string[] = [];
  const functionDirs: string[] = [];

  for (const name of listDirs(appDir)) {
    if (name === SHARED_DIR) continue;
    if (rootFunctions.has(name)) collisions.push(`function ${name} exists in both trees`);
    else functionDirs.push(name);
  }

  const sharedFiles: string[] = [];
  const rootShared = join(rootDir, SHARED_DIR);
  const appShared = join(appDir, SHARED_DIR);
  for (const file of listFiles(appShared)) {
    const target = join(rootShared, file);
    if (!existsSync(target)) sharedFiles.push(file);
    else if (!readFileSync(target).equals(readFileSync(join(appShared, file)))) {
      collisions.push(`_shared/${file} differs between the trees`);
    }
  }

  if (collisions.length > 0) {
    throw new Error(
      `Cannot serve the app's edge functions beside the root ones without losing code:\n  ${collisions.join('\n  ')}`
    );
  }
  return { functionDirs, sharedFiles };
}

/** `[functions.<name>] verify_jwt = false` for each function the config does not already declare. */
export function noVerifyJwtConfig(existingConfig: string, functionNames: string[]): string {
  return functionNames
    .filter(name => !existingConfig.includes(`[functions.${name}]`))
    .map(name => `\n[functions.${name}]\nverify_jwt = false\n`)
    .join('');
}

export function functionSecretsEnvFile(env: NodeJS.ProcessEnv = {}): string {
  return `${Object.entries(isolatedFunctionSecrets(env))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

/**
 * Copies the app's functions into the root tree, writes the test-only `functions/.env`, and turns
 * off gateway JWT verification for every served function, as production's deploy does.
 * Refuses outside CI unless explicitly allowed, because it writes into the checkout.
 */
export function stageAppEdgeFunctions(
  repoRoot: string,
  env: NodeJS.ProcessEnv
): FunctionStagingPlan {
  if (env.CI !== 'true' && env.MYK9_ISOLATED_E2E_ALLOW_FUNCTION_STAGING !== 'true') {
    throw new Error(
      'Staging edge functions writes into the checkout; it runs in CI only. Set ' +
        'MYK9_ISOLATED_E2E_ALLOW_FUNCTION_STAGING=true to run it in a throwaway clone.'
    );
  }
  // Resolved first: a non-test Stripe key refuses before anything is copied.
  const secretsFile = functionSecretsEnvFile(env);
  const plan = planAppFunctionStaging(repoRoot);
  const rootDir = join(repoRoot, ROOT_FUNCTIONS_DIR);
  const appDir = join(repoRoot, APP_FUNCTIONS_DIR);
  for (const name of plan.functionDirs) {
    cpSync(join(appDir, name), join(rootDir, name), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
  for (const file of plan.sharedFiles) {
    cpSync(join(appDir, SHARED_DIR, file), join(rootDir, SHARED_DIR, file), {
      force: false,
      errorOnExist: true,
    });
  }
  writeFileSync(join(rootDir, '.env'), secretsFile, 'utf8');
  const configPath = join(repoRoot, SUPABASE_CONFIG_FILE);
  const served = listDirs(rootDir).filter(name => name !== SHARED_DIR);
  appendFileSync(configPath, noVerifyJwtConfig(readFileSync(configPath, 'utf8'), served), 'utf8');
  return plan;
}
