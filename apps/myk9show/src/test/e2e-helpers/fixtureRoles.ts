import type { AuthPreflightRole } from './e2eAuthPreflight';

/**
 * The role names each CI fixture account must hold on SHARED STAGING, exactly.
 * Measured from the live accounts on 2026-10-17 and matching what
 * supabase/seed-demo.sql grants (it gives secretary@ and testadmin@ a Heartland
 * club_admin grant; supabase/seed-isolated-e2e-accounts.sql grants fewer, so use
 * --check-roles only against shared staging, never an isolated database).
 *
 * The sets are EXACT: an extra staff role is as much drift as a missing one,
 * because a stray secretary role on the exhibitor skips onboarding and swaps the
 * sidebar, and the suite then fails like a product bug (MYK9-1243).
 *
 * To move CI onto dedicated accounts, change which emails testUsers.ts and
 * e2eAuthPreflight.ts resolve; these sets describe the ROLE, not the address.
 */
export const EXPECTED_FIXTURE_ROLES: Record<AuthPreflightRole, readonly string[]> = {
  exhibitor: ['exhibitor'],
  secretary: ['club_admin', 'exhibitor', 'secretary', 'steward'],
  admin: ['club_admin', 'exhibitor', 'site_admin'],
  judge: ['judge'],
};

export type FixtureRoleVerdict = { ok: true } | { ok: false; message: string };

const normalize = (roles: readonly string[]): string[] => [...new Set(roles)].sort();

const DRIFT_DOCS_HINT =
  'This is a staging data problem, not a product failure: someone changed this CI account by hand. ' +
  'Restore its roles (see docs/operations/e2e-fixture-accounts.md), then re-run the check.';

/** Pure comparison: expected vs actual role names, order and duplicates irrelevant. */
export function compareFixtureRoles(
  email: string,
  expected: readonly string[],
  actual: readonly string[]
): FixtureRoleVerdict {
  const want = normalize(expected);
  const have = normalize(actual);
  if (want.length === have.length && want.every((role, i) => role === have[i])) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      `E2E fixture account drifted: ${email} expected roles [${want.join(', ')}] but has [${have.join(', ')}]\n` +
      DRIFT_DOCS_HINT,
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
