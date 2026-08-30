import { resolveFixtureEmail } from '../fixtures/fixtureEmail';
import { assertAddressIsLive } from '../fixtures/retiredFixtureDomain';

export type AuthPreflightRole = 'secretary' | 'admin' | 'judge' | 'exhibitor';

interface RoleEnv {
  email: string;
  defaultEmail: string;
  password: string;
}

export interface AuthPreflightCredential {
  role: AuthPreflightRole;
  email: string;
  password: string;
}

export interface AuthPreflightConfig {
  supabaseUrl: string;
  anonKey: string;
  credentials: AuthPreflightCredential[];
}

/**
 * Default addresses, matching `testUsers.ts` and the accounts the seeds create.
 *
 * These are not secrets. They are hard-coded in `setup-e2e-test-users.ts` and
 * `seed-isolated-e2e-accounts.sql`, both in git, and an isolated target creates
 * exactly these — so for that target the address is not a free variable at all
 * and an override can only ever name an account that was never created.
 *
 * That is not hypothetical. Playwright Regression seeded `secretary@myk9t.com`
 * into a fresh isolated database and then preflighted whatever
 * `E2E_SECRETARY_EMAIL` held, so it failed on all seven of its runs on `main`
 * (2026-07-16 through 2026-08-24) with HTTP 400 and never reached a single
 * test. `testUsers.ts` already reasons this way about club-admin: "this address
 * is hard-coded in the seeds... An override could only ever point at an account
 * that was never granted anything."
 *
 * Passwords stay required and undefaulted — those genuinely are secrets, and a
 * missing one must still fail loudly.
 */
const ROLE_ENV: Record<AuthPreflightRole, RoleEnv> = {
  secretary: {
    email: 'E2E_SECRETARY_EMAIL',
    defaultEmail: 'secretary@myk9t.com',
    password: 'E2E_SECRETARY_PASSWORD',
  },
  admin: {
    email: 'E2E_ADMIN_EMAIL',
    defaultEmail: 'testadmin@myk9t.com',
    password: 'E2E_ADMIN_PASSWORD',
  },
  judge: {
    email: 'E2E_JUDGE_EMAIL',
    defaultEmail: 'judge@myk9t.com',
    password: 'E2E_JUDGE_PASSWORD',
  },
  exhibitor: {
    email: 'E2E_DEMO_EXHIBITOR_EMAIL',
    defaultEmail: 'exhibitor@myk9t.com',
    password: 'E2E_DEMO_EXHIBITOR_PASSWORD',
  },
};

function isAuthPreflightRole(role: string): role is AuthPreflightRole {
  return role in ROLE_ENV;
}

export function resolveAuthPreflightConfig(
  env: NodeJS.ProcessEnv,
  roles: readonly string[]
): AuthPreflightConfig {
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const missingBase = [
    !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
    !anonKey ? 'VITE_SUPABASE_ANON_KEY' : null,
  ].filter(Boolean);

  if (!supabaseUrl || !anonKey) {
    throw new Error(`Missing E2E auth preflight secret(s): ${missingBase.join(', ')}`);
  }

  const credentials = roles.map(role => {
    if (!isAuthPreflightRole(role)) {
      throw new Error(`Unsupported E2E auth preflight role: ${role}`);
    }

    const envNames = ROLE_ENV[role];
    const email = resolveFixtureEmail(env[envNames.email], envNames.defaultEmail);
    const password = env[envNames.password];

    if (!password) {
      throw new Error(
        `Missing E2E auth preflight secret(s) for ${role}: ${envNames.password}`
      );
    }

    // A retired address must die here rather than at Supabase. This preflight
    // runs BEFORE Playwright in five workflow steps (ci.yml x2, nightly-e2e,
    // nightly-health x2), so it is the FIRST place a stale `E2E_*_EMAIL`
    // secret surfaces — and it would surface as the same generic
    // "Invalid login credentials" that a wrong password gives, sending the
    // reader off to rotate a password that was never wrong.
    //
    // Note the asymmetry with testUsers.ts: there, every email has an
    // @myk9t.com default, so only a STALE override is dangerous. Here there
    // are no defaults at all — a MISSING secret already fails loudly above.
    // Staleness is the only failure mode this adds, which is exactly the one
    // the generic error hides.
    assertAddressIsLive(email);

    return {
      role,
      email,
      password,
    };
  });

  return {
    supabaseUrl,
    anonKey,
    credentials,
  };
}

export async function verifyE2EAuthCredentials(
  config: AuthPreflightConfig,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const tokenUrl = `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`;

  for (const credential of config.credentials) {
    const response = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: credential.email,
        password: credential.password,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `E2E auth preflight failed for ${credential.role}: Supabase rejected the configured credentials (HTTP ${response.status}). Refresh ${ROLE_ENV[credential.role].email}/${ROLE_ENV[credential.role].password} and reset the Supabase auth user password.`
      );
    }

    const body = (await response.json().catch(() => null)) as { access_token?: unknown } | null;
    if (typeof body?.access_token !== 'string' || body.access_token.length === 0) {
      throw new Error(
        `E2E auth preflight failed for ${credential.role}: Supabase returned no access token. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`
      );
    }
  }
}
