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
 */
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const ROOT_FUNCTIONS_DIR = 'supabase/functions';
export const APP_FUNCTIONS_DIR = 'apps/myk9show/supabase/functions';
const SHARED_DIR = '_shared';

/**
 * Test-only secrets for the local edge runtime. The Stripe key is a dummy: the journey never
 * reaches a step that calls Stripe (MYK9-971 leaves the paid leg until a test-mode key exists), and
 * a real key must never be written here.
 */
export const ISOLATED_FUNCTION_SECRETS = {
  CRON_SECRET: 'isolated-e2e-cron-secret',
  PUSH_WEBHOOK_SECRET: 'isolated-e2e-push-webhook-secret',
  STRIPE_SECRET_KEY: 'sk_test_isolated_e2e_never_called',
  STRIPE_WEBHOOK_SECRET: 'whsec_isolated_e2e_never_called',
  STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_isolated_e2e_connect_never_called',
  SENTRY_ENVIRONMENT: 'isolated-e2e',
} as const;

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

export function functionSecretsEnvFile(): string {
  return `${Object.entries(ISOLATED_FUNCTION_SECRETS)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

/**
 * Copies the app's functions into the root tree and writes the test-only `functions/.env`.
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
  writeFileSync(join(rootDir, '.env'), functionSecretsEnvFile(), 'utf8');
  return plan;
}
