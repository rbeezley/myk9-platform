// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import {
  ALLOW_PRODUCTION_FIXTURE_SIGN_IN,
  PRODUCTION_PROJECT_REF,
  assertFixtureSignInAllowed,
  assertPlaywrightRunAllowed,
  bundleFilesNamingProduction,
  type AppServer,
  isLoopbackOrigin,
  signsInFixtureAccounts,
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
  const merged = { E2E_SECRETARY_PASSWORD: 'pw', VITE_SUPABASE_URL: PRODUCTION };
  const isolated = {
    E2E_SECRETARY_PASSWORD: 'pw',
    VITE_SUPABASE_URL: LOCAL,
    MYK9_E2E_SUPABASE_URL: LOCAL,
  };
  const optIn = { [ALLOW_PRODUCTION_FIXTURE_SIGN_IN]: '1' };
  // A dev server on the browser's own port: the config's own server, nothing to scan.
  const ownDev: AppServer = {
    kind: 'own',
    mode: 'dev',
    browserUrl: 'http://127.0.0.1:5300',
    serverPort: 5300,
  };
  const run = (
    env: Record<string, string>,
    shell: Record<string, string> = {},
    server: AppServer = ownDev,
    argv = ['test']
  ) => assertPlaywrightRunAllowed('playwright.config.ts', shell, server, env, argv);

  it('refuses when a fixture password is configured and the test process names production', () => {
    expect(() => run(merged)).toThrow(/playwright\.config\.ts: refusing .*production project/s);
  });

  it('allows the same run when the shell opts in', () => {
    expect(() => run(merged, optIn)).not.toThrow();
  });

  it('ignores an opt-in that only a .env file supplied', () => {
    // The merged env carries it (dotenv loaded it); the shell never set it.
    expect(() => run({ ...merged, ...optIn })).toThrow(/refusing/);
  });

  it('leaves a run alone that signs nobody in, and a --list run', () => {
    expect(() => run({ VITE_SUPABASE_URL: PRODUCTION })).not.toThrow();
    expect(() => run({ VITE_SUPABASE_URL: PRODUCTION, E2E_SECRETARY_PASSWORD: '' })).not.toThrow();
    expect(() => run({ VITE_SUPABASE_URL: PRODUCTION }, {}, { kind: 'external' })).not.toThrow();
    expect(() => run(merged, {}, ownDev, ['test', '--list'])).not.toThrow();
  });

  it('allows an isolated run whose config starts its own server', () => {
    expect(() => run(isolated)).not.toThrow();
  });

  it('refuses when only one of the two URLs is isolated: a stale loopback cannot hide production', () => {
    expect(() => run({ ...merged, MYK9_E2E_SUPABASE_URL: LOCAL })).toThrow(/refusing/);
    expect(() => run({ ...isolated, MYK9_E2E_SUPABASE_URL: PRODUCTION })).toThrow(/refusing/);
  });

  it('fails closed on a server the config did not start, even when every local URL is isolated', () => {
    expect(() => run(isolated, {}, { kind: 'external' })).toThrow(
      /app server is one this config did not start/
    );
    expect(() => run(isolated, optIn, { kind: 'external' })).not.toThrow();
  });

  it('refuses when the browser goes to a different server than the one the config starts (Codex round 3)', () => {
    const otherPort: AppServer = { ...ownDev, browserUrl: 'http://127.0.0.1:4173' };
    expect(() => run(isolated, {}, otherPort)).toThrow(
      /not the server this config starts on port 5300/
    );
    const otherHost: AppServer = { ...ownDev, browserUrl: 'https://myk9show.com' };
    expect(() => run(isolated, {}, otherHost)).toThrow(/not the server this config starts/);
    // A default-port URL compares as 80 / 443, not as "no port".
    expect(() =>
      run(isolated, {}, { ...ownDev, browserUrl: 'http://localhost', serverPort: 80 })
    ).not.toThrow();
  });

  describe('a preview serves dist/, so dist/ itself is checked (Codex round 3)', () => {
    const dists: string[] = [];
    afterEach(() => {
      for (const dir of dists.splice(0)) rmSync(dir, { recursive: true, force: true });
    });
    const distWith = (js: string) => {
      const dir = mkdtempSync(join(tmpdir(), 'guard-dist-'));
      dists.push(dir);
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'assets', 'index-abc.js'), js);
      writeFileSync(join(dir, 'index.html'), '<!doctype html>');
      return dir;
    };
    const preview = (distDir: string): AppServer => ({ ...ownDev, mode: 'preview', distDir });

    it('refuses a preview whose bundle names production, even with every env URL isolated', () => {
      const dist = distWith(`const u="${PRODUCTION}";`);
      expect(() => run(isolated, {}, preview(dist))).toThrow(
        /preview bundle was built against the production project/
      );
      expect(() => run(isolated, optIn, preview(dist))).not.toThrow();
    });

    it('allows a preview whose bundle names only the isolated stack, or that has no dist yet', () => {
      expect(() => run(isolated, {}, preview(distWith(`const u="${LOCAL}";`)))).not.toThrow();
      expect(() => run(isolated, {}, preview(join(tmpdir(), 'no-such-dist-myk9')))).not.toThrow();
    });

    it('bundleFilesNamingProduction walks nested chunks', () => {
      const dist = distWith('const ok = 1;');
      mkdirSync(join(dist, 'assets', 'scripts'));
      writeFileSync(join(dist, 'assets', 'scripts', 'chunk.js'), `x="${PRODUCTION}"`);
      writeFileSync(join(dist, 'assets', 'note.txt'), PRODUCTION);
      expect(bundleFilesNamingProduction(dist).map(f => f.replace(dist, ''))).toEqual([
        '/assets/scripts/chunk.js',
      ]);
    });
  });
});

describe('the helpers the configs use to declare their server', () => {
  it("isLoopbackOrigin: only this machine counts as the config's own server", () => {
    expect(isLoopbackOrigin('http://127.0.0.1:5173')).toBe(true);
    expect(isLoopbackOrigin('http://localhost:4173')).toBe(true);
    expect(isLoopbackOrigin('http://[::1]:4173')).toBe(true);
    expect(isLoopbackOrigin('https://myk9show.com')).toBe(false);
    expect(isLoopbackOrigin('http://192.168.1.20:5173')).toBe(false);
    expect(isLoopbackOrigin('not a url')).toBe(false);
  });

  it('signsInFixtureAccounts: any non-empty E2E_*_PASSWORD', () => {
    expect(signsInFixtureAccounts({ E2E_JUDGE_PASSWORD: 'x' })).toBe(true);
    expect(signsInFixtureAccounts({ E2E_JUDGE_PASSWORD: '' })).toBe(false);
    expect(signsInFixtureAccounts({ E2E_JUDGE_EMAIL: 'judge@myk9t.com' })).toBe(false);
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
    const call = source.slice(guard, source.indexOf(');', guard));
    // Every config says whose server the browser talks to (MYK9-1454 round 2).
    expect(call, 'declares its app server').toMatch(/kind: '(own|external)'/);
    expect(guard, 'a top-level call, not a comment or import').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(source.indexOf('export default defineConfig('));
    const firstLoad = source.indexOf('loadEnv({');
    if (firstLoad === -1) return;
    // A config that loads .env files snapshots the shell first and checks after the last load.
    expect(source.search(/^const shellEnv = \{ \.\.\.process\.env \};$/m)).toBeLessThan(firstLoad);
    expect(source.search(/^const shellEnv = /m)).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(source.lastIndexOf('loadEnv({'));
    expect(call, 'reads the opt-in from the pre-dotenv snapshot').toContain('shellEnv');
  });

  it('no e2e spec hard-codes the production project (Codex round 4: registrationUI did)', () => {
    const specs: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.spec.ts')) specs.push(path);
      }
    };
    walk(resolve(repo, 'apps/myk9show/src/test/e2e'));
    expect(specs.length, 'found the specs (positive control)').toBeGreaterThan(100);
    const offenders = specs.filter(path =>
      readFileSync(path, 'utf8').includes(PRODUCTION_PROJECT_REF)
    );
    expect(offenders.map(path => path.replace(repo, ''))).toEqual([]);
  });

  it('the ci config never reuses a running server for a run that signs fixture accounts in', () => {
    expect(read('apps/myk9show/playwright.ci.config.ts')).toMatch(
      /reuseExistingServer: !process\.env\.CI && !signsInFixtureAccounts\(\)/
    );
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
