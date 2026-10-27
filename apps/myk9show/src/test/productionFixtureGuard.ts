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
 * probe, the load rehearsal) sets `MYK9_ALLOW_PROD_E2E=1`. Nothing else does.
 */

export const PRODUCTION_PROJECT_REF = 'sojmvhhwsjxmfistvzbe';
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
 * Throws before a fixture password is sent to the production project, unless
 * `MYK9_ALLOW_PROD_E2E=1` is set. `who` names the caller, so the refusal says what to change.
 */
export function assertFixtureSignInAllowed(
  supabaseUrl: string | undefined,
  who: string,
  env: Env = process.env
): void {
  if (!targetsProductionProject(supabaseUrl)) return;
  if (env[ALLOW_PRODUCTION_FIXTURE_SIGN_IN] === '1') return;
  throw new Error(
    `${who}: refusing to sign a test account into the production project (${PRODUCTION_PROJECT_REF}). ` +
      'Every fixture sign-in runs a full sync and slows the live site for real users (MYK9-1454). ' +
      'Point VITE_SUPABASE_URL at an isolated stack (pnpm qa:isolated-e2e:prepare), or, for a run ' +
      `that must measure production, set ${ALLOW_PRODUCTION_FIXTURE_SIGN_IN}=1.`
  );
}

const FIXTURE_PASSWORD = /^E2E_[A-Z_]+_PASSWORD$/;

/**
 * The Playwright-config form, called at the top of every config that loads `.env`. A spec can
 * sign in through `testUsers.signIn` or type the password itself (show-presence, entry-intent),
 * so the one place every run passes is its config: if any fixture password is configured and
 * the app under test talks to production, the run refuses to start. A run with no fixture
 * password signs nobody in and is left alone.
 */
export function assertPlaywrightRunAllowed(configName: string, env: Env = process.env): void {
  const signsInFixtures = Object.entries(env).some(
    ([name, value]) => FIXTURE_PASSWORD.test(name) && !!value
  );
  if (!signsInFixtures) return;
  assertFixtureSignInAllowed(env.MYK9_E2E_SUPABASE_URL || env.VITE_SUPABASE_URL, configName, env);
}
