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
 * (refocus, `_recoverAndRefresh`) keeps it, and a `replication:recovery`
 * event (the database was deleted and recreated) ends it. The record is
 * stored in the replica's own IndexedDB database, so it lives and dies with
 * the rows it vouches for. Distrust sets an in-memory bit before anything is
 * awaited and then removes the record, so a removal that fails under the
 * same storage pressure still distrusts for this page's lifetime.
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
import { databaseManager, REPLICATION_STORES } from '@myk9/replication';
import { logger } from '@/services/LoggingService';
import { supabase } from '@/services/database/supabaseClient';

/**
 * A reserved key in the replica database's sync metadata store (the
 * MutationQueueStore sequence-counter precedent), so the record lives and dies
 * with the rows: a deleted and recreated database (DatabaseManager.recover)
 * has no trust in it.
 */
const TRUST_KEY = 'dog_registrations:trust';

export interface RegistrationsTrustRecord {
  authUserId: string;
  verifiedAt: number;
}

let distrusted = false;
let distrustEpoch = 0;

async function metadataDb() {
  return databaseManager.getDatabase('dog_registrations');
}

export async function readRegistrationsTrust(): Promise<RegistrationsTrustRecord | null> {
  if (distrusted) return null;
  try {
    const db = await metadataDb();
    const stored = (await db.get(REPLICATION_STORES.SYNC_METADATA, TRUST_KEY)) as
      Partial<RegistrationsTrustRecord> | undefined;
    return stored && typeof stored.authUserId === 'string' && typeof stored.verifiedAt === 'number'
      ? { authUserId: stored.authUserId, verifiedAt: stored.verifiedAt }
      : null;
  } catch {
    return null;
  }
}

/** Record the trust a clean full sync for `authUserId` earned. */
export async function recordRegistrationsTrust(authUserId: string): Promise<void> {
  const epoch = distrustEpoch;
  try {
    const db = await metadataDb();
    await db.put(REPLICATION_STORES.SYNC_METADATA, {
      tableName: TRUST_KEY,
      authUserId,
      verifiedAt: Date.now(),
    });
    // A distrust that landed while the write was in flight wins.
    if (distrustEpoch === epoch) distrusted = false;
    else await db.delete(REPLICATION_STORES.SYNC_METADATA, TRUST_KEY);
  } catch (error) {
    // Unrecorded trust is no trust: stay cold until a write succeeds.
    logger.warn('Could not record registrations replica trust', 'replication', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The one way to stop serving the registrations replica. The in-memory bit is
 * set before anything is awaited, so callers may fire and forget; the stored
 * record is removed best-effort (a failed removal still distrusts this page).
 */
export async function distrustRegistrationsReplica(reason: string): Promise<void> {
  distrusted = true;
  distrustEpoch++;
  logger.info('Registrations replica distrusted', 'replication', { reason });
  try {
    const db = await metadataDb();
    await db.delete(REPLICATION_STORES.SYNC_METADATA, TRUST_KEY);
  } catch {
    // The in-memory bit holds for this page.
  }
}

if (typeof window !== 'undefined') {
  // DatabaseManager.recover() deleted and recreated the replica database.
  window.addEventListener('replication:recovery', () => {
    void distrustRegistrationsReplica('database-recovered');
  });
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
  const record = await readRegistrationsTrust();
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
    void distrustRegistrationsReplica('signed-out');
    return;
  }
  if (event !== 'SIGNED_IN') return;
  // Read-time identity checks cover the moment this read takes.
  void readRegistrationsTrust().then(record => {
    if (record && record.authUserId !== userId) {
      return distrustRegistrationsReplica('account-changed');
    }
    return undefined;
  });
}

/** Test-only: forget the in-memory distrust bit and the stored record. */
export async function resetRegistrationsTrustForTests(): Promise<void> {
  distrusted = false;
  try {
    const db = await metadataDb();
    await db.delete(REPLICATION_STORES.SYNC_METADATA, TRUST_KEY);
  } catch {
    // ignore
  }
}
