// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import {
  ALLOW_PRODUCTION_FIXTURE_SIGN_IN,
  assertFixtureSignInAllowed,
  assertPlaywrightRunAllowed,
  targetsProductionProject,
  viteSupabaseUrl,
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
  const merged = { E2E_SECRETARY_PASSWORD: 'pw', VITE_SUPABASE_URL: PRODUCTION };
  const appRoots: string[] = [];
  afterEach(() => {
    for (const dir of appRoots.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  /** An app folder holding exactly these `.env*` files, so the real worktree's `.env` stays out. */
  const appRootWith = (files: Record<string, string> = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'guard-app-'));
    appRoots.push(dir);
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    return dir;
  };
  const run = (
    env: Record<string, string>,
    shell: Record<string, string> = {},
    argv = ['test'],
    appRoot = appRootWith()
  ) => assertPlaywrightRunAllowed('playwright.config.ts', shell, env, argv, appRoot);

  it('refuses when a fixture password is configured and the app talks to production', () => {
    expect(() => run(merged)).toThrow(/playwright\.config\.ts: refusing/);
  });

  it('allows the same run when the shell opts in', () => {
    expect(() => run(merged, { [ALLOW_PRODUCTION_FIXTURE_SIGN_IN]: '1' })).not.toThrow();
  });

  it('ignores an opt-in that only a .env file supplied', () => {
    // The merged env carries it (dotenv loaded it); the shell never set it.
    expect(() => run({ ...merged, [ALLOW_PRODUCTION_FIXTURE_SIGN_IN]: '1' })).toThrow(/refusing/);
  });

  it('leaves a run alone that signs nobody in, and a --list run', () => {
    expect(() => run({ VITE_SUPABASE_URL: PRODUCTION })).not.toThrow();
    expect(() => run({ VITE_SUPABASE_URL: PRODUCTION, E2E_SECRETARY_PASSWORD: '' })).not.toThrow();
    expect(() => run(merged, {}, ['test', '--list'])).not.toThrow();
  });

  it('allows a run whose app and test process both target the isolated stack', () => {
    expect(() =>
      run({ ...merged, VITE_SUPABASE_URL: LOCAL, MYK9_E2E_SUPABASE_URL: LOCAL })
    ).not.toThrow();
  });

  it('refuses when only one of the two URLs is isolated: a stale loopback cannot hide production', () => {
    expect(() => run({ ...merged, MYK9_E2E_SUPABASE_URL: LOCAL })).toThrow(/refusing/);
    expect(() =>
      run({
        E2E_SECRETARY_PASSWORD: 'pw',
        VITE_SUPABASE_URL: LOCAL,
        MYK9_E2E_SUPABASE_URL: PRODUCTION,
      })
    ).toThrow(/refusing/);
  });

  it('refuses when only the Vite server mode file names production (Codex round 1)', () => {
    const local = { E2E_SECRETARY_PASSWORD: 'pw', VITE_SUPABASE_URL: LOCAL };
    for (const file of ['.env.development', '.env.development.local', '.env.production']) {
      const appRoot = appRootWith({ [file]: `VITE_SUPABASE_URL=${PRODUCTION}\n` });
      expect(() => run(local, {}, ['test'], appRoot), file).toThrow(/refusing/);
    }
  });

  it('lets a shell-set isolated URL win over every .env file, as Vite does', () => {
    const appRoot = appRootWith({
      '.env': `VITE_SUPABASE_URL=${PRODUCTION}\n`,
      '.env.development': `VITE_SUPABASE_URL=${PRODUCTION}\n`,
    });
    const isolated = { VITE_SUPABASE_URL: LOCAL, MYK9_E2E_SUPABASE_URL: LOCAL };
    expect(() =>
      run({ E2E_SECRETARY_PASSWORD: 'pw', ...isolated }, isolated, ['test'], appRoot)
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

  // Every config on disk, so a new one cannot slip past unguarded.
  const configs = readdirSync(resolve(repo, 'apps/myk9show'))
    .filter(name => /^playwright(\..+)?\.config\.ts$/.test(name))
    .map(name => `apps/myk9show/${name}`);

  it('finds every Playwright config (positive control)', () => {
    expect(configs.length).toBeGreaterThanOrEqual(7);
    expect(configs).toContain('apps/myk9show/playwright.ci.config.ts');
  });

  it.each(configs)('%s checks the run before defining the config', path => {
    const source = read(path);
    const guard = source.search(/^assertPlaywrightRunAllowed\(/m);
    expect(guard, 'a top-level call, not a comment or import').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(source.indexOf('export default defineConfig('));
    const firstLoad = source.indexOf('loadEnv({');
    if (firstLoad === -1) return;
    // A config that loads .env files snapshots the shell first and checks after the last load.
    expect(source.search(/^const shellEnv = \{ \.\.\.process\.env \};$/m)).toBeLessThan(firstLoad);
    expect(source.search(/^const shellEnv = /m)).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(source.lastIndexOf('loadEnv({'));
    expect(source.slice(guard, source.indexOf('\n', guard))).toContain('shellEnv');
  });

  it.each([
    '.github/workflows/nightly-health.yml',
    '.github/workflows/page-readiness-probe.yml',
    '.github/workflows/load-rehearsal.yml',
  ])('%s opts in, because it measures production on purpose', path => {
    expect(read(path)).toContain(`${ALLOW_PRODUCTION_FIXTURE_SIGN_IN}: '1'`);
  });

  it.each([
    '.github/workflows/ci.yml',
    '.github/workflows/nightly-e2e.yml',
    '.github/workflows/batch3-verification.yml',
    '.github/workflows/show-day-verification.yml',
  ])('%s never opts in: it runs against an isolated stack', path => {
    expect(read(path)).not.toContain(ALLOW_PRODUCTION_FIXTURE_SIGN_IN);
  });
});

describe('viteSupabaseUrl resolves the app server URL with Vite precedence', () => {
  it('takes the later file, and the shell over every file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guard-vite-'));
    try {
      writeFileSync(join(dir, '.env'), 'VITE_SUPABASE_URL=https://a.example\n');
      writeFileSync(join(dir, '.env.local'), 'VITE_SUPABASE_URL=https://b.example\n');
      writeFileSync(join(dir, '.env.development'), 'VITE_SUPABASE_URL=https://c.example\n');
      expect(viteSupabaseUrl('development', {}, dir)).toBe('https://c.example');
      expect(viteSupabaseUrl('production', {}, dir)).toBe('https://b.example');
      expect(viteSupabaseUrl('development', { VITE_SUPABASE_URL: LOCAL }, dir)).toBe(LOCAL);
      expect(viteSupabaseUrl('development', {}, join(dir, 'missing'))).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
