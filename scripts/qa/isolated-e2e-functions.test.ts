import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  APP_FUNCTIONS_DIR,
  ISOLATED_FUNCTION_SECRETS,
  ROOT_FUNCTIONS_DIR,
  SUPABASE_CONFIG_FILE,
  functionSecretsEnvFile,
  noVerifyJwtConfig,
  perWorkerEdgeRuntimeConfig,
  planAppFunctionStaging,
  resolveIsolatedStripeSecretKey,
  stageAppEdgeFunctions,
} from './isolated-e2e-functions';

function write(path: string, body: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
}

/** A throwaway repo with one root function, two app functions and overlapping `_shared` trees. */
function fixtureRepo(overrides: { sameSharedFile?: string; extraRootFunction?: string } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'isolated-e2e-functions-'));
  const root = join(repo, ROOT_FUNCTIONS_DIR);
  const app = join(repo, APP_FUNCTIONS_DIR);
  write(join(root, 'admin-delete-user/index.ts'), 'root fn');
  write(join(root, '_shared/cors.ts'), 'cors v1');
  write(join(repo, SUPABASE_CONFIG_FILE), '[api]\nenabled = true\n');
  write(join(app, 'cron-waitlist-expiration/index.ts'), 'cron');
  write(join(app, 'cron-waitlist-expiration/offerStep.ts'), 'offer');
  write(join(app, 'decline-waitlist-offer/index.ts'), 'decline');
  write(join(app, '_shared/cors.ts'), overrides.sameSharedFile ?? 'cors v1');
  write(join(app, '_shared/stripe/live.ts'), 'live');
  if (overrides.extraRootFunction) {
    write(join(root, overrides.extraRootFunction, 'index.ts'), 'clash');
  }
  return repo;
}

describe('planAppFunctionStaging', () => {
  it('copies app-only functions and the _shared files the root tree lacks', () => {
    expect(planAppFunctionStaging(fixtureRepo())).toEqual({
      functionDirs: ['cron-waitlist-expiration', 'decline-waitlist-offer'],
      sharedFiles: ['stripe/live.ts'],
    });
  });

  it('refuses a function that exists in both trees', () => {
    expect(() =>
      planAppFunctionStaging(fixtureRepo({ extraRootFunction: 'decline-waitlist-offer' }))
    ).toThrow(/function decline-waitlist-offer exists in both trees/);
  });

  it('refuses a _shared file whose bytes differ', () => {
    expect(() => planAppFunctionStaging(fixtureRepo({ sameSharedFile: 'cors v2' }))).toThrow(
      /_shared\/cors\.ts differs/
    );
  });

  it('holds for this repository: the union loses nothing', () => {
    const plan = planAppFunctionStaging(process.cwd());
    expect(plan.functionDirs).toEqual(
      expect.arrayContaining([
        'cron-waitlist-expiration',
        'decline-waitlist-offer',
        'withdraw-waitlist-offer',
        'stripe-payment-link',
        'stripe-webhook',
      ])
    );
  });
});

describe('stageAppEdgeFunctions', () => {
  it('refuses to write into a checkout outside CI', () => {
    expect(() => stageAppEdgeFunctions(fixtureRepo(), {})).toThrow(/runs in CI only/);
  });

  it('stages the union and a test-only secrets file', () => {
    const repo = fixtureRepo();
    stageAppEdgeFunctions(repo, { CI: 'true' });
    const root = join(repo, ROOT_FUNCTIONS_DIR);
    expect(readFileSync(join(root, 'cron-waitlist-expiration/offerStep.ts'), 'utf8')).toBe('offer');
    expect(readFileSync(join(root, '_shared/stripe/live.ts'), 'utf8')).toBe('live');
    expect(readFileSync(join(root, 'admin-delete-user/index.ts'), 'utf8')).toBe('root fn');
    const envFile = readFileSync(join(root, '.env'), 'utf8');
    expect(envFile).toContain(`CRON_SECRET=${ISOLATED_FUNCTION_SECRETS.CRON_SECRET}`);
    // Never a live key: the journey must not be able to reach real Stripe.
    expect(envFile).toMatch(/^STRIPE_SECRET_KEY=sk_test_/m);
    expect(existsSync(join(root, 'decline-waitlist-offer/index.ts'))).toBe(true);
    // The cron authenticates with CRON_SECRET, not a JWT; the gateway must let it through.
    const config = readFileSync(join(repo, SUPABASE_CONFIG_FILE), 'utf8');
    for (const name of [
      'admin-delete-user',
      'cron-waitlist-expiration',
      'decline-waitlist-offer',
    ]) {
      expect(config).toContain(`[functions.${name}]\nverify_jwt = false`);
    }
    expect(config).not.toContain('[functions._shared]');
    expect(config.startsWith('[api]\nenabled = true\n')).toBe(true);
    // MYK9-1467: workers stay alive between requests, as in production.
    expect(config).toMatch(/^\[edge_runtime\]\npolicy = "per_worker"$/m);
  });
});

describe('perWorkerEdgeRuntimeConfig (MYK9-1467)', () => {
  it('adds the section when the config has none', () => {
    expect(perWorkerEdgeRuntimeConfig('[api]\nenabled = true\n')).toBe(
      '[api]\nenabled = true\n\n[edge_runtime]\npolicy = "per_worker"\n'
    );
  });

  it('adds the policy to an existing section without one, and touches nothing else', () => {
    expect(
      perWorkerEdgeRuntimeConfig(
        '[edge_runtime]\nenabled = true\n[functions.a]\nverify_jwt = false\n'
      )
    ).toBe(
      '[edge_runtime]\npolicy = "per_worker"\nenabled = true\n[functions.a]\nverify_jwt = false\n'
    );
  });

  it("replaces a oneshot policy, but not another section's policy line", () => {
    expect(
      perWorkerEdgeRuntimeConfig('[other]\npolicy = "x"\n[edge_runtime]\npolicy = "oneshot"\n')
    ).toBe('[other]\npolicy = "x"\n[edge_runtime]\npolicy = "per_worker"\n');
  });
});

describe('resolveIsolatedStripeSecretKey', () => {
  it('uses the dummy when STRIPE_TEST_SECRET_KEY is unset or blank', () => {
    expect(resolveIsolatedStripeSecretKey({})).toBe(ISOLATED_FUNCTION_SECRETS.STRIPE_SECRET_KEY);
    expect(resolveIsolatedStripeSecretKey({ STRIPE_TEST_SECRET_KEY: '  ' })).toBe(
      ISOLATED_FUNCTION_SECRETS.STRIPE_SECRET_KEY
    );
  });

  it('passes a test-mode secret key through', () => {
    expect(resolveIsolatedStripeSecretKey({ STRIPE_TEST_SECRET_KEY: 'sk_test_x' })).toBe(
      'sk_test_x'
    );
    expect(functionSecretsEnvFile({ STRIPE_TEST_SECRET_KEY: 'sk_test_x' })).toMatch(
      /^STRIPE_SECRET_KEY=sk_test_x$/m
    );
  });

  it('throws on a live key without repeating it', () => {
    let message = '';
    try {
      resolveIsolatedStripeSecretKey({ STRIPE_TEST_SECRET_KEY: 'sk_live_x' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/must be a Stripe test-mode secret key/);
    expect(message).not.toContain('sk_live_x');
  });

  it('throws on a restricted test key too: only sk_test_ is accepted', () => {
    expect(() => resolveIsolatedStripeSecretKey({ STRIPE_TEST_SECRET_KEY: 'rk_test_x' })).toThrow(
      /must be a Stripe test-mode secret key/
    );
  });

  it('refuses to stage anything when the key is live', () => {
    const repo = fixtureRepo();
    expect(() =>
      stageAppEdgeFunctions(repo, { CI: 'true', STRIPE_TEST_SECRET_KEY: 'sk_live_x' })
    ).toThrow(/must be a Stripe test-mode secret key/);
    expect(existsSync(join(repo, ROOT_FUNCTIONS_DIR, 'cron-waitlist-expiration'))).toBe(false);
    expect(existsSync(join(repo, ROOT_FUNCTIONS_DIR, '.env'))).toBe(false);
  });

  it('stages the test key into the functions env file', () => {
    const repo = fixtureRepo();
    stageAppEdgeFunctions(repo, { CI: 'true', STRIPE_TEST_SECRET_KEY: 'sk_test_x' });
    const envFile = readFileSync(join(repo, ROOT_FUNCTIONS_DIR, '.env'), 'utf8');
    expect(envFile).toMatch(/^STRIPE_SECRET_KEY=sk_test_x$/m);
    expect(envFile).toContain(
      `STRIPE_WEBHOOK_SECRET=${ISOLATED_FUNCTION_SECRETS.STRIPE_WEBHOOK_SECRET}`
    );
  });
});

describe('noVerifyJwtConfig', () => {
  it('skips a function the config already declares', () => {
    expect(noVerifyJwtConfig('[functions.a]\nverify_jwt = true\n', ['a', 'b'])).toBe(
      '\n[functions.b]\nverify_jwt = false\n'
    );
  });
});
