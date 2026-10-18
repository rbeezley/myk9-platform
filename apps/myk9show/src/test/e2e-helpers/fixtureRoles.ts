import type { AuthPreflightRole } from './e2eAuthPreflight';

export interface FixtureRoleRule {
  /** Role names the account must hold. */
  required: readonly string[];
  /** Role names the account must NOT hold. Anything in neither list is tolerated. */
  forbidden: readonly string[];
}

/**
 * What each CI fixture account must (and must not) hold on SHARED STAGING.
 *
 * Required + forbidden, not an exact set: staging accumulates harmless grants
 * through normal app use (secretary@ holds club_admin on clubs it created while
 * signed in by hand), and a reseed would not restore them. What breaks specs is
 * a role that changes the account's identity, such as a secretary role on the
 * exhibitor, which skips onboarding and swaps the sidebar (MYK9-1243). Only
 * roles seed-demo.sql restores are required.
 *
 * To move CI onto dedicated accounts, change which emails testUsers.ts and
 * e2eAuthPreflight.ts resolve; these rules describe the ROLE, not the address.
 */
export const FIXTURE_ROLE_RULES: Record<AuthPreflightRole, FixtureRoleRule> = {
  exhibitor: {
    required: ['exhibitor'],
    forbidden: ['secretary', 'club_admin', 'steward', 'judge', 'site_admin', 'chairman'],
  },
  secretary: { required: ['secretary', 'steward'], forbidden: ['site_admin', 'judge'] },
  admin: { required: ['site_admin'], forbidden: [] },
  judge: {
    required: ['judge'],
    // seed-demo.sql 10g removes the judge's exhibitor grant: an extra role lets an
    // authorization check pass through the wrong branch (MYK9-141).
    forbidden: ['exhibitor', 'secretary', 'club_admin', 'site_admin', 'steward', 'chairman'],
  },
};

export type FixtureRoleVerdict = { ok: true } | { ok: false; message: string };

const unique = (roles: readonly string[]): string[] => [...new Set(roles)].sort();

const DRIFT_DOCS_HINT =
  'This is a staging data problem, not a product failure: someone changed this CI account by hand. ' +
  'Restore its roles (see docs/operations/e2e-fixture-accounts.md), then re-run the check.';

/** Pure comparison: actual role names against a required/forbidden rule; order irrelevant. */
export function compareFixtureRoles(
  email: string,
  rule: FixtureRoleRule,
  actual: readonly string[]
): FixtureRoleVerdict {
  const have = new Set(actual);
  const missing = unique(rule.required.filter(role => !have.has(role)));
  const forbidden = unique(rule.forbidden.filter(role => have.has(role)));
  if (missing.length === 0 && forbidden.length === 0) return { ok: true };
  const problems = [
    missing.length > 0 ? `is missing [${missing.join(', ')}]` : null,
    forbidden.length > 0 ? `has forbidden [${forbidden.join(', ')}]` : null,
  ].filter(Boolean);
  return {
    ok: false,
    message: `E2E fixture account drifted: ${email} ${problems.join(' and ')}\n${DRIFT_DOCS_HINT}`,
  };
}

/**
 * Reads the signed-in user's OWN active role names through the same RPC the app's
 * RBAC layer uses after sign-in (get_user_roles; self-lookups are permitted). Read
 * only, anon key plus the user's own access token, never a service-role key.
 */
export async function fetchOwnRoleNames(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  userId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string[]> {
  const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/get_user_roles`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!response.ok) {
    throw new Error(`could not read own roles via get_user_roles (HTTP ${response.status})`);
  }
  const rows = (await response.json().catch(() => null)) as
    { role_name?: unknown; is_active?: unknown }[] | null;
  if (!Array.isArray(rows)) {
    throw new Error('get_user_roles returned an unexpected shape');
  }
  return rows
    .filter(row => row.is_active !== false && typeof row.role_name === 'string')
    .map(row => row.role_name as string);
}
