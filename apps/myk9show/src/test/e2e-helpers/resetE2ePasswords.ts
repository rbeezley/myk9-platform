/**
 * Pure helpers for `scripts/reset-e2e-passwords.ts` — resolving the canonical
 * e2e test-account roster from environment variables.
 *
 * Kept free of network and filesystem access so the roster logic is
 * unit-testable (vitest includes `src/**`; `scripts/` is not in its include
 * globs). The env-var names and default emails mirror
 * `src/test/e2e/helpers/testUsers.ts` — if an account is added there, add it
 * to CANONICAL_ROLES here too.
 */

export interface E2EAccount {
  role: string;
  email: string;
  password: string;
}

interface RoleEnvSpec {
  emailVar: string;
  passwordVar: string;
  defaultEmail: string;
  /** Some accounts fall back to another account's password (see testUsers.ts). */
  passwordFallbackVar?: string;
}

const CANONICAL_ROLES: Record<string, RoleEnvSpec> = {
  admin: {
    emailVar: 'E2E_ADMIN_EMAIL',
    passwordVar: 'E2E_ADMIN_PASSWORD',
    defaultEmail: 'e2e-admin@test.myk9.com',
  },
  secretary: {
    emailVar: 'E2E_SECRETARY_EMAIL',
    passwordVar: 'E2E_SECRETARY_PASSWORD',
    defaultEmail: 'e2e-secretary@test.myk9.com',
  },
  judge: {
    emailVar: 'E2E_JUDGE_EMAIL',
    passwordVar: 'E2E_JUDGE_PASSWORD',
    defaultEmail: 'e2e-judge@test.myk9.com',
  },
  exhibitor: {
    emailVar: 'E2E_DEMO_EXHIBITOR_EMAIL',
    passwordVar: 'E2E_DEMO_EXHIBITOR_PASSWORD',
    defaultEmail: 'e2e-exhibitor@test.myk9.com',
  },
  clubadmin: {
    emailVar: 'E2E_CLUB_EMAIL',
    passwordVar: 'E2E_CLUB_PASSWORD',
    defaultEmail: 'e2e-clubadmin@test.myk9.com',
    passwordFallbackVar: 'E2E_DEMO_EXHIBITOR_PASSWORD',
  },
};

export const ALL_ROLES = Object.keys(CANONICAL_ROLES);

/** Minimal dotenv-style parser: KEY=value lines, ignores comments/blanks. */
export function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/**
 * Resolve the requested roles to concrete { email, password } accounts.
 * Throws with the exact missing env-var name so the failure is actionable.
 * Duplicate roles are deduped; unknown roles list the valid options.
 */
export function resolveAccounts(
  env: Record<string, string | undefined>,
  roles: string[]
): E2EAccount[] {
  const accounts: E2EAccount[] = [];
  const seen = new Set<string>();

  for (const role of roles) {
    if (seen.has(role)) continue;
    seen.add(role);

    const spec = CANONICAL_ROLES[role];
    if (!spec) {
      throw new Error(`Unknown e2e role "${role}". Valid roles: ${ALL_ROLES.join(', ')}`);
    }

    const email = env[spec.emailVar] || spec.defaultEmail;
    const password =
      env[spec.passwordVar] ||
      (spec.passwordFallbackVar ? env[spec.passwordFallbackVar] : undefined);

    if (!password) {
      const sources = [spec.passwordVar, spec.passwordFallbackVar].filter(Boolean).join(' or ');
      throw new Error(
        `Missing password for role "${role}": set ${sources} (apps/myk9show/.env.local or environment)`
      );
    }

    accounts.push({ role, email: email.toLowerCase(), password });
  }

  return accounts;
}
