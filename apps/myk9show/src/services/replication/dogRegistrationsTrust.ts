/**
 * When may a registration reader answer from the replica alone (MYK9-1090)?
 *
 * Only while ONE trust record says so: `{ authUserId, verifiedAt }`, written
 * by a clean full sync (changes pass, ID pass and hydration all succeeded,
 * nothing doubted the replica meanwhile) for the account that ran it. While
 * the record is missing, or names another account, the readers are cold: they
 * ask PostgREST, and a failed cold read is an error, never an empty list.
 *
 * Every doubt calls `distrustRegistrationsReplica` and nothing else: quota
 * eviction, a failed or capped ID pass, failed hydration of missing ids, a
 * failed write mirror, a cleared cache, an account mismatch at sync start, and
 * sign-out or a DIFFERENT account signing in (`useAuth`, the same handlers
 * that purge the ringside claim cache, MYK9-834). A same-user SIGNED_IN
 * (refocus, `_recoverAndRefresh`) keeps it. The persisted record is cleared
 * and an in-memory bit is set, so a removal that fails under the same storage
 * pressure still distrusts for this page's lifetime.
 *
 * Identity at read time (offline-identity-pairing, the ringside precedent in
 * `ringsideClaimCache.ts`): a resolved user must equal the record. An
 * unresolved one (`getSession()` returns no session) is untrusted online,
 * where it really means no session, and keeps the recorded trust offline,
 * where auth-js reports no session for an access token that merely expired
 * while it could not refresh (one hour, `jwt_expiry`).
 *
 * Residual gap: an account swap made while this app was not running, with no
 * auth event reaching it, leaves the record naming the previous account. It
 * is caught as soon as identity next resolves (a read online, or the next
 * sync's start); until then, offline, the device serves the replica it last
 * verified.
 */
import { logger } from '@/services/LoggingService';
import { supabase } from '@/services/database/supabaseClient';

const STORAGE_KEY = 'myk9:registrations-replica-trust';

export interface RegistrationsTrustRecord {
  authUserId: string;
  verifiedAt: number;
}

let distrusted = false;
let distrustEpoch = 0;

export function readRegistrationsTrust(): RegistrationsTrustRecord | null {
  if (distrusted) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RegistrationsTrustRecord> | null;
    return parsed && typeof parsed.authUserId === 'string' && typeof parsed.verifiedAt === 'number'
      ? { authUserId: parsed.authUserId, verifiedAt: parsed.verifiedAt }
      : null;
  } catch {
    return null;
  }
}

/** Record the trust a clean full sync for `authUserId` earned. */
export function recordRegistrationsTrust(authUserId: string): void {
  try {
    const record: RegistrationsTrustRecord = { authUserId, verifiedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    distrusted = false;
  } catch (error) {
    // Unrecorded trust is no trust: stay cold until a write succeeds.
    logger.warn('Could not record registrations replica trust', 'replication', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** The one way to stop serving the registrations replica. */
export function distrustRegistrationsReplica(reason: string): void {
  distrusted = true;
  distrustEpoch++;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The in-memory bit holds for this page; a reload re-reads storage.
  }
  logger.info('Registrations replica distrusted', 'replication', { reason });
}

/** Changes on every distrust, so a sync can tell one landed while it ran. */
export function registrationsDistrustEpoch(): number {
  return distrustEpoch;
}

/** The signed-in auth user, the identity the mutation queue uses; null when unresolved. */
export async function currentAuthUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** The single trust check both registration readers use. */
export async function isRegistrationsReplicaTrusted(): Promise<boolean> {
  const record = readRegistrationsTrust();
  if (!record) return false;
  const userId = await currentAuthUserId();
  if (userId) return userId === record.authUserId;
  return isOffline();
}

/**
 * `useAuth`'s auth-event hook: sign-out, or a different account signing in,
 * ends the trust. A same-user SIGNED_IN (refocus) does not (MYK9-834).
 */
export function distrustRegistrationsOnAuthEvent(event: string, userId: string | undefined): void {
  if (event === 'SIGNED_OUT') {
    distrustRegistrationsReplica('signed-out');
    return;
  }
  if (event !== 'SIGNED_IN') return;
  const record = readRegistrationsTrust();
  if (record && record.authUserId !== userId) distrustRegistrationsReplica('account-changed');
}

/** Test-only: forget the in-memory distrust bit and the record. */
export function resetRegistrationsTrustForTests(): void {
  distrusted = false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
