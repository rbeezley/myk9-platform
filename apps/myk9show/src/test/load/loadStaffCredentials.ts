import { createClient } from '@supabase/supabase-js';
import { LOAD_SHOWS } from './loadFixture';

/**
 * Per-show staff credentials.
 *
 * A session carrying a show id is not show-scoped. `entries_select` admits
 * `show_id IN (SELECT manageable_show_ids())`, and the runner cloned ONE secretary
 * auth state across every staff session — so a credential able to manage all four
 * fixture shows would see all four regardless of which show its session targets,
 * collapsing the own-show versus cross-show comparison the multi-show fixture
 * exists to make.
 *
 * `manageable_show_ids()` includes a club-level secretary check
 * (`is_trial_secretary(s.club_id)`). Shows sharing a club are
 * therefore all manageable by that club's secretary no matter what show-scoped
 * grants exist, which is why each load show owns its own club.
 */

export interface LoadStaffCredential {
  readonly showIndex: number;
  readonly showId: string;
  readonly email: string;
  readonly password: string;
}

export interface MissingStaffCredential {
  readonly showIndex: number;
  readonly email: string;
  readonly passwordEnv: string;
}

/** Show 0 keeps the canonical secretary; the additional shows get their own. */
export function staffEmailForShow(showIndex: number): string {
  return showIndex === 0 ? 'secretary@myk9t.com' : `load-secretary-${showIndex}@myk9t.com`;
}

export function staffPasswordEnvForShow(showIndex: number): string {
  return showIndex === 0 ? 'E2E_SECRETARY_PASSWORD' : `E2E_LOAD_SECRETARY_${showIndex}_PASSWORD`;
}

export interface ResolvedStaffCredentials {
  readonly credentials: readonly LoadStaffCredential[];
  readonly missing: readonly MissingStaffCredential[];
}

export function resolveStaffCredentials(env: NodeJS.ProcessEnv): ResolvedStaffCredentials {
  const credentials: LoadStaffCredential[] = [];
  const missing: MissingStaffCredential[] = [];

  for (const show of LOAD_SHOWS) {
    const email = staffEmailForShow(show.index);
    const passwordEnv = staffPasswordEnvForShow(show.index);
    const password = env[passwordEnv];
    if (!password) {
      missing.push({ showIndex: show.index, email, passwordEnv });
      continue;
    }
    credentials.push({ showIndex: show.index, showId: show.showId, email, password });
  }

  return { credentials, missing };
}

/**
 * Fail closed before the load starts rather than after it. A missing credential
 * costs a refused dispatch; discovering it afterwards costs the whole
 * operator-approved window, and a run where every staff session silently saw all
 * four shows would look like it worked.
 */
export function assertStaffCredentialsComplete(resolved: ResolvedStaffCredentials): void {
  if (resolved.missing.length === 0) return;
  const detail = resolved.missing
    .map(entry => `show ${entry.showIndex} (${entry.email}, ${entry.passwordEnv})`)
    .join('; ');
  throw new Error(
    `Per-show staff credentials are not provisioned: ${detail}. ` +
      'Create the accounts with scripts/setup-e2e-test-users.ts and set their passwords, ' +
      'or the rehearsal would run every staff session under one credential that manages ' +
      'every fixture show, which defeats the cross-show measurement.'
  );
}

export interface ManageableShowScope {
  readonly showIndex: number;
  readonly email: string;
  readonly manageableShowIds: readonly string[];
}

/**
 * Within LOAD_SHOWS, each credential must manage exactly its assigned show.
 * Club-level staff may legitimately manage unrelated audit/E2E shows too. Keep
 * those in diagnostics, but do not confuse them with cross-load-show access.
 * A site-admin role or a grant on another load club must still fail closed.
 */
export function assertScopedToOwnShow(scopes: readonly ManageableShowScope[]): void {
  const problems: string[] = [];
  const fixtureShowIds = new Set(LOAD_SHOWS.map(show => show.showId));
  for (const scope of scopes) {
    const expected = LOAD_SHOWS[scope.showIndex]?.showId;
    const actual = [...scope.manageableShowIds].sort();
    const fixtureScope = actual.filter(id => fixtureShowIds.has(id));
    if (fixtureScope.length !== 1 || fixtureScope[0] !== expected) {
      problems.push(
        `${scope.email} manages [${actual.join(', ')}] but must manage exactly ${expected} within the load fixture`
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(`Staff credentials are not scoped to one show: ${problems.join('; ')}.`);
  }
}

/**
 * Signs a credential in and returns both its access token and the shows it can
 * actually manage.
 *
 * The scope comes from the database rather than the fixture: a club-level grant,
 * a site-admin role or a stale `user_roles` row would each widen it invisibly,
 * so the seed alone cannot prove what a credential sees.
 */
export async function authenticateAndResolveScope(
  supabaseUrl: string,
  anonKey: string,
  credential: { email: string; password: string; showIndex: number }
): Promise<{ accessToken: string; scope: ManageableShowScope }> {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: credential.email,
    password: credential.password,
  });
  if (error || !data.session) {
    throw new Error(`Could not sign in ${credential.email}: ${error?.message ?? 'no session'}`);
  }

  const { data: shows, error: rpcError } = await client.rpc('manageable_show_ids');
  if (rpcError) {
    throw new Error(
      `Could not resolve manageable shows for ${credential.email}: ${rpcError.message}`
    );
  }

  const manageableShowIds = Array.isArray(shows)
    ? shows.map(row => (typeof row === 'string' ? row : String((row as { id?: string }).id ?? '')))
    : [];

  return {
    accessToken: data.session.access_token,
    scope: { showIndex: credential.showIndex, email: credential.email, manageableShowIds },
  };
}
