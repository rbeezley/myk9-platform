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
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseEnvFile } from 'dotenv';

export const PRODUCTION_PROJECT_REF = 'sojmvhhwsjxmfistvzbe';
/** apps/myk9show: where Vite reads its `.env*` files from. */
const APP_ROOT = resolve(import.meta.dirname, '../..');
/** `vite` (dev) runs in development mode; `vite build`/`vite preview` in production mode. */
const VITE_SERVER_MODES = ['development', 'production'] as const;
export const ALLOW_PRODUCTION_FIXTURE_SIGN_IN = 'MYK9_ALLOW_PROD_E2E';

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

/**
 * Throws before a fixture password is sent to the production project, unless the run's own
 * environment sets `MYK9_ALLOW_PROD_E2E=1`. Any one of `supabaseUrls` naming production is
 * enough: the app bundle and the test process can each read a different variable, and a stale
 * loopback value in one must not hide a production value in the other. `who` names the caller,
 * so the refusal says what to change.
 */
export function assertFixtureSignInAllowed(
  supabaseUrls: string | undefined | ReadonlyArray<string | undefined>,
  who: string,
  optInEnv: Env = process.env
): void {
  const urls = typeof supabaseUrls === 'string' || !supabaseUrls ? [supabaseUrls] : supabaseUrls;
  if (!urls.some(targetsProductionProject)) return;
  if (optInEnv[ALLOW_PRODUCTION_FIXTURE_SIGN_IN] === '1') return;
  throw new Error(
    `${who}: refusing to sign a test account into the production project (${PRODUCTION_PROJECT_REF}). ` +
      'Every fixture sign-in runs a full sync and slows the live site for real users (MYK9-1454). ' +
      'Point VITE_SUPABASE_URL at an isolated stack (pnpm qa:isolated-e2e:prepare), or, for a run ' +
      `that must measure production, set ${ALLOW_PRODUCTION_FIXTURE_SIGN_IN}=1 in the shell ` +
      '(it is ignored in .env files).'
  );
}

const FIXTURE_PASSWORD = /^E2E_[A-Z_]+_PASSWORD$/;

/**
 * The `VITE_SUPABASE_URL` the app server will actually use in `mode`, resolved as Vite does:
 * `.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local` (later files win), and a value the
 * shell set wins over all of them. The config's own dotenv load reads only `.env.local`/`.env`,
 * so without this a production URL in `.env.development` would reach the browser unchecked.
 */
export function viteSupabaseUrl(
  mode: string,
  shellEnv: Env,
  appRoot: string = APP_ROOT
): string | undefined {
  if (shellEnv.VITE_SUPABASE_URL) return shellEnv.VITE_SUPABASE_URL;
  let url: string | undefined;
  for (const file of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    const path = resolve(appRoot, file);
    if (!existsSync(path)) continue;
    const value = parseEnvFile(readFileSync(path)).VITE_SUPABASE_URL;
    if (value) url = value;
  }
  return url;
}

/**
 * The Playwright-config form, called at the top of every config. A spec can sign in through
 * `testUsers.signIn` or type the password itself (show-presence, entry-intent), so the one place
 * every run passes is its config: if any fixture password is configured and the app under test
 * talks to production, the run refuses to start. Left alone: a run with no fixture password
 * (it signs nobody in) and `--list`, which only collects tests.
 *
 * `shellEnv` is the environment as it was BEFORE the config loaded `.env` files; the opt-in is
 * read from it alone. `env` is the merged one the run will use.
 */
export function assertPlaywrightRunAllowed(
  configName: string,
  shellEnv: Env,
  env: Env = process.env,
  argv: ReadonlyArray<string> = process.argv,
  appRoot: string = APP_ROOT
): void {
  if (argv.includes('--list')) return;
  const signsInFixtures = Object.entries(env).some(
    ([name, value]) => FIXTURE_PASSWORD.test(name) && !!value
  );
  if (!signsInFixtures) return;
  // Every URL a part of the run may talk to: the test process's two, and the app server's in
  // each mode a config can start it in. Any one naming production refuses.
  assertFixtureSignInAllowed(
    [
      env.MYK9_E2E_SUPABASE_URL,
      env.VITE_SUPABASE_URL,
      ...VITE_SERVER_MODES.map(mode => viteSupabaseUrl(mode, shellEnv, appRoot)),
    ],
    configName,
    shellEnv
  );
}
