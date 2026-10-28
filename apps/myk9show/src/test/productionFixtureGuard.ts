/**
 * MYK9-1454: refuse to sign a fixture account into the production project unless the run says so.
 *
 * There is one Supabase project, and it is production. Every fixture sign-in pays a full
 * replication sync, about 2,800 REST calls, so a browser walk, perf baseline or e2e spec run
 * against it makes the live site slow for real users while it runs. On 2026-10-27 a local perf
 * run held p95 at 3.3 s with 5xx errors (MYK9-1454), and before MYK9-1449 every CI smoke run did
 * the same. CI now builds a disposable local stack per job; this makes "against production" a
 * deliberate, visible choice everywhere else.
 *
 * A run that must measure production (the nightly read-only health check, the page-readiness
 * probe, the load rehearsal) sets `MYK9_ALLOW_PROD_E2E=1` in its own environment. The opt-in is
 * read from the process environment as the shell or workflow set it, never from `.env` files:
 * a saved opt-in would turn the guard off for good without anyone seeing it.
 *
 * What the guard checks is the URL the run itself will use, never an inference about another
 * process: the test process's environment, which a server the config starts inherits (and which
 * Vite lets win over its `.env.[mode]` files). A server the config did NOT start can talk to
 * anything, so a fixture run against one is refused unless opted in.
 *
 * A dev server also reads `.env.development` and `.env.development.local`, which the test process
 * never loads. For that server the guard asks Vite's own `loadEnv` what `VITE_SUPABASE_URL` the
 * server will resolve (MYK9-1457), rather than re-implementing its precedence or expansion. A
 * preview server serves a prebuilt `dist/`, which is scanned instead, so `.env.production` is
 * covered by what it built. Known residual, documented in docs/qa/e2e-suite-map.md: a server the
 * config did not start.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

export const PRODUCTION_PROJECT_REF = 'sojmvhhwsjxmfistvzbe';
/** apps/myk9show/dist: what `vite preview` serves. */
const DEFAULT_DIST_DIR = resolve(import.meta.dirname, '../../dist');
/** apps/myk9show: where Vite looks for `.env.[mode]` files. */
const DEFAULT_APP_ROOT = resolve(import.meta.dirname, '../..');
export const ALLOW_PRODUCTION_FIXTURE_SIGN_IN = 'MYK9_ALLOW_PROD_E2E';

/**
 * Loaded on demand: `vite` pulls in esbuild, which refuses to start under the jsdom environment
 * the load unit tests run in, and only a dev-server config needs it.
 */
function loadViteEnv(mode: string, root: string, prefix: string): Record<string, string> {
  const vite = createRequire(import.meta.url)('vite') as typeof import('vite');
  return vite.loadEnv(mode, root, prefix);
}

type Env = Readonly<Record<string, string | undefined>>;

/** True when `supabaseUrl` names the production project. A blank or unparsable URL is not. */
export function targetsProductionProject(supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false;
  try {
    return new URL(supabaseUrl).hostname.split('.').includes(PRODUCTION_PROJECT_REF);
  } catch {
    return false;
  }
}

const refusal = (who: string, why: string): Error =>
  new Error(
    `${who}: refusing to sign a test account in, because ${why}. ` +
      'Every fixture sign-in runs a full sync and slows the live site for real users (MYK9-1454). ' +
      'Point VITE_SUPABASE_URL at an isolated stack (pnpm qa:isolated-e2e:prepare) and let the ' +
      'config start its own app server, or, for a run that must measure production, set ' +
      `${ALLOW_PRODUCTION_FIXTURE_SIGN_IN}=1 in the shell (it is ignored in .env files).`
  );

const optedIn = (optInEnv: Env): boolean => optInEnv[ALLOW_PRODUCTION_FIXTURE_SIGN_IN] === '1';

/**
 * Throws before a fixture password is sent to the production project, unless the run's own
 * environment sets `MYK9_ALLOW_PROD_E2E=1`. Any one of `supabaseUrls` naming production is
 * enough: the test process reads two variables, and a stale loopback value in one must not hide
 * a production value in the other. `who` names the caller, so the refusal says what to change.
 */
export function assertFixtureSignInAllowed(
  supabaseUrls: string | undefined | ReadonlyArray<string | undefined>,
  who: string,
  optInEnv: Env = process.env
): void {
  const urls = typeof supabaseUrls === 'string' || !supabaseUrls ? [supabaseUrls] : supabaseUrls;
  if (!urls.some(targetsProductionProject)) return;
  if (optedIn(optInEnv)) return;
  throw refusal(who, `the target is the production project (${PRODUCTION_PROJECT_REF})`);
}

const FIXTURE_PASSWORD = /^E2E_[A-Z_]+_PASSWORD$/;

/** True when the run has any fixture password, so a spec may sign a fixture account in. */
export function signsInFixtureAccounts(env: Env = process.env): boolean {
  return Object.entries(env).some(([name, value]) => FIXTURE_PASSWORD.test(name) && !!value);
}

/**
 * How the config gets its app server.
 *
 * `external`: the browser talks to a server the config did not start (the audit config, a load
 * run without LOAD_TEST_START_APP), whose Supabase target nothing here can see.
 *
 * `own`: the config starts a server on `serverPort` and never reuses a running one. A `dev`
 * server inherits the environment checked here. A `preview` server serves whatever `dist/` was
 * built against, so the bundle itself is scanned. The browser must point at that very server:
 * `browserUrl` is its base URL, compared host and port.
 */
export type AppServer =
  | { kind: 'external' }
  | {
      kind: 'own';
      mode: 'dev' | 'preview';
      browserUrl: string;
      serverPort: number;
      /** For `preview`: the directory it serves. Defaults to apps/myk9show/dist. */
      distDir?: string;
      /** For `dev`: the directory Vite reads `.env.[mode]` from. Defaults to apps/myk9show. */
      appRoot?: string;
    };

/** True when `baseUrl` is served from this machine, where the config's own server listens. */
export function isLoopbackOrigin(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function portOf(url: string): number | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.port) return Number(parsed.port);
    return parsed.protocol === 'https:' ? 443 : parsed.protocol === 'http:' ? 80 : undefined;
  } catch {
    return undefined;
  }
}

/** The built JavaScript files under `dir` that name the production project. */
export function bundleFilesNamingProduction(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const hits: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (
        entry.name.endsWith('.js') &&
        readFileSync(path, 'utf8').includes(PRODUCTION_PROJECT_REF)
      ) {
        hits.push(path);
      }
    }
  };
  walk(dir);
  return hits;
}

/**
 * The Playwright-config form, called at the top of every config. A spec can sign in through
 * `testUsers.signIn` or type the password itself (show-presence, entry-intent), so the one place
 * every run passes is its config. A run with fixture passwords is refused, unless the shell opts
 * in, when anything the browser will reach can be shown to be, or cannot be shown not to be,
 * production: the test process's URLs, a server the config did not start, a browser pointed at a
 * different server than the one started, or a preview bundle built against production. Left
 * alone: a run with no fixture password (it signs nobody in) and `--list`, which only collects
 * tests.
 *
 * `shellEnv` is the environment as it was BEFORE the config loaded `.env` files; the opt-in is
 * read from it alone. `env` is the merged one the run, and any server it starts, will use.
 */
export function assertPlaywrightRunAllowed(
  configName: string,
  shellEnv: Env,
  appServer: AppServer,
  env: Env = process.env,
  argv: ReadonlyArray<string> = process.argv
): void {
  if (argv.includes('--list')) return;
  if (!signsInFixtureAccounts(env)) return;
  if (optedIn(shellEnv)) return;
  if (appServer.kind === 'external') {
    throw refusal(
      configName,
      'the app server is one this config did not start, so its Supabase target cannot be checked'
    );
  }
  if (
    !isLoopbackOrigin(appServer.browserUrl) ||
    portOf(appServer.browserUrl) !== appServer.serverPort
  ) {
    throw refusal(
      configName,
      `the browser goes to ${appServer.browserUrl}, not the server this config starts on port ${appServer.serverPort}`
    );
  }
  if (appServer.mode === 'preview') {
    const built = bundleFilesNamingProduction(appServer.distDir ?? DEFAULT_DIST_DIR);
    if (built.length > 0) {
      throw refusal(
        configName,
        `the preview bundle was built against the production project (${built.length} file(s) in dist/ name ${PRODUCTION_PROJECT_REF}); rebuild against the isolated stack`
      );
    }
  }
  // `vite` serves in development mode; loadEnv applies the server's own precedence.
  const devServerUrl =
    appServer.mode === 'dev'
      ? loadViteEnv('development', appServer.appRoot ?? DEFAULT_APP_ROOT, 'VITE_').VITE_SUPABASE_URL
      : undefined;
  assertFixtureSignInAllowed(
    [env.MYK9_E2E_SUPABASE_URL, env.VITE_SUPABASE_URL, devServerUrl],
    configName,
    shellEnv
  );
}
