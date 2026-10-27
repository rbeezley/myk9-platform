// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import {
  ALLOW_PRODUCTION_FIXTURE_SIGN_IN,
  assertFixtureSignInAllowed,
  assertPlaywrightRunAllowed,
  targetsProductionProject,
} from './productionFixtureGuard';
import { authenticateAndResolveScope } from './load/loadStaffCredentials';

const PRODUCTION = 'https://sojmvhhwsjxmfistvzbe.supabase.co';
const LOCAL = 'http://127.0.0.1:54321';

describe('production fixture sign-in guard (MYK9-1454)', () => {
  it('recognises the production project, and nothing else', () => {
    expect(targetsProductionProject(PRODUCTION)).toBe(true);
    expect(targetsProductionProject(`${PRODUCTION}/`)).toBe(true);
    expect(targetsProductionProject(LOCAL)).toBe(false);
    expect(targetsProductionProject('https://otherproject.supabase.co')).toBe(false);
    // The ref inside a path or another host's label is not the production host.
    expect(targetsProductionProject('https://example.com/sojmvhhwsjxmfistvzbe')).toBe(false);
    expect(targetsProductionProject('https://notsojmvhhwsjxmfistvzbe.supabase.co')).toBe(false);
    expect(targetsProductionProject(undefined)).toBe(false);
    expect(targetsProductionProject('not a url')).toBe(false);
  });

  it('refuses a fixture sign-in to production by default, naming the caller and the opt-in', () => {
    expect(() => assertFixtureSignInAllowed(PRODUCTION, 'e2e sign-in', {})).toThrow(
      /e2e sign-in: refusing .*production project.*MYK9_ALLOW_PROD_E2E=1/s
    );
  });

  it('allows production only with the explicit opt-in, exactly "1"', () => {
    expect(() =>
      assertFixtureSignInAllowed(PRODUCTION, 'nightly health', {
        [ALLOW_PRODUCTION_FIXTURE_SIGN_IN]: '1',
      })
    ).not.toThrow();
    for (const value of ['true', 'yes', '0', '']) {
      expect(() =>
        assertFixtureSignInAllowed(PRODUCTION, 'x', { [ALLOW_PRODUCTION_FIXTURE_SIGN_IN]: value })
      ).toThrow(/refusing/);
    }
  });

  it('never blocks an isolated or unknown target', () => {
    expect(() => assertFixtureSignInAllowed(LOCAL, 'x', {})).not.toThrow();
    expect(() => assertFixtureSignInAllowed(undefined, 'x', {})).not.toThrow();
  });
});

describe('a Playwright run refuses to start against production with fixture passwords', () => {
  const withPassword = { E2E_SECRETARY_PASSWORD: 'pw', VITE_SUPABASE_URL: PRODUCTION };

  it('refuses when a fixture password is configured and the app talks to production', () => {
    expect(() => assertPlaywrightRunAllowed('playwright.config.ts', withPassword)).toThrow(
      /playwright\.config\.ts: refusing/
    );
  });

  it('allows the same run with the explicit opt-in', () => {
    expect(() =>
      assertPlaywrightRunAllowed('playwright.config.ts', {
        ...withPassword,
        [ALLOW_PRODUCTION_FIXTURE_SIGN_IN]: '1',
      })
    ).not.toThrow();
  });

  it('leaves a run alone that signs nobody in', () => {
    expect(() =>
      assertPlaywrightRunAllowed('playwright.config.ts', { VITE_SUPABASE_URL: PRODUCTION })
    ).not.toThrow();
    expect(() =>
      assertPlaywrightRunAllowed('playwright.config.ts', {
        VITE_SUPABASE_URL: PRODUCTION,
        E2E_SECRETARY_PASSWORD: '',
      })
    ).not.toThrow();
  });

  it('uses the isolated target when one is prepared, even if .env still names production', () => {
    expect(() =>
      assertPlaywrightRunAllowed('playwright.ci.config.ts', {
        ...withPassword,
        MYK9_E2E_SUPABASE_URL: LOCAL,
      })
    ).not.toThrow();
  });
});

describe('the load harness refuses before any password leaves the machine', () => {
  it('throws without creating a client when the target is production', async () => {
    const saved = process.env[ALLOW_PRODUCTION_FIXTURE_SIGN_IN];
    delete process.env[ALLOW_PRODUCTION_FIXTURE_SIGN_IN];
    try {
      await expect(
        authenticateAndResolveScope(PRODUCTION, 'anon', {
          email: 'secretary@myk9t.com',
          password: 'pw',
          showIndex: 0,
        })
      ).rejects.toThrow(/load harness sign-in: refusing/);
      expect(createClient).not.toHaveBeenCalled();
    } finally {
      if (saved !== undefined) process.env[ALLOW_PRODUCTION_FIXTURE_SIGN_IN] = saved;
    }
  });
});

/**
 * The guard only works if every place that sends a fixture password calls it, and only the
 * workflows that must measure production opt in. These read the sources, so they pin wiring, not
 * behaviour; the behaviour is pinned above and in each caller's own test.
 */
describe('every fixture sign-in path is guarded, and only production checks opt in', () => {
  const repo = resolve(import.meta.dirname, '../../../..');
  const read = (path: string) => readFileSync(resolve(repo, path), 'utf8');

  it.each([
    'apps/myk9show/src/test/performance/benchmarkAttempt.ts',
    'apps/myk9show/src/test/load/loadStaffCredentials.ts',
  ])('%s calls assertFixtureSignInAllowed before signing in', path => {
    const source = read(path);
    const guard = source.search(/^\s*assertFixtureSignInAllowed\(/m);
    expect(guard, 'a real call, not a comment or import').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(source.indexOf('signInWithPassword('));
  });

  it.each([
    'apps/myk9show/playwright.config.ts',
    'apps/myk9show/playwright.ci.config.ts',
    'apps/myk9show/playwright.audit.config.ts',
    'apps/myk9show/playwright.load.config.ts',
    'apps/myk9show/playwright.readiness.config.ts',
  ])('%s checks the run after loading .env and before defining the config', path => {
    const source = read(path);
    const guard = source.search(/^assertPlaywrightRunAllowed\(/m);
    expect(guard, 'a top-level call, not a comment or import').toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(source.lastIndexOf("loadEnv({ path: '.env'"));
    expect(guard).toBeLessThan(source.indexOf('export default defineConfig('));
  });

  it.each([
    '.github/workflows/nightly-health.yml',
    '.github/workflows/page-readiness-probe.yml',
    '.github/workflows/load-rehearsal.yml',
  ])('%s opts in, because it measures production on purpose', path => {
    expect(read(path)).toContain(`${ALLOW_PRODUCTION_FIXTURE_SIGN_IN}: '1'`);
  });

  it.each(['.github/workflows/ci.yml', '.github/workflows/nightly-e2e.yml'])(
    '%s never opts in: it runs against an isolated stack',
    path => {
      expect(read(path)).not.toContain(ALLOW_PRODUCTION_FIXTURE_SIGN_IN);
    }
  );
});
