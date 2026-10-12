import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  APP_FUNCTIONS_DIR,
  ISOLATED_FUNCTION_SECRETS,
  ROOT_FUNCTIONS_DIR,
  SUPABASE_CONFIG_FILE,
  noVerifyJwtConfig,
  planAppFunctionStaging,
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
  });
});

describe('noVerifyJwtConfig', () => {
  it('skips a function the config already declares', () => {
    expect(noVerifyJwtConfig('[functions.a]\nverify_jwt = true\n', ['a', 'b'])).toBe(
      '\n[functions.b]\nverify_jwt = false\n'
    );
  });
});
