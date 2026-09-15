/**
 * ReplicatedEntriesTable - Offline-first entry data replication for myK9Show
 *
 * Manages entry/registration data with offline support using @myk9/replication.
 * Entries represent a dog+handler registered for a specific class.
 *
 * Conflict Resolution:
 * - Last-write-wins for most fields
 * - Check-in status: local takes precedence (offline check-ins are authoritative)
 */

import {
  ReplicatedTable,
  syncReplicatedTable,
  parseUpdatedAtMs,
  databaseManager,
  REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN,
  REPLICATION_STORES,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import type { CheckInStatus } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import {
  entryToSupabaseRow,
  rowToEntry,
  type EntryRow,
  type ReplicatedEntry,
} from './ReplicatedEntriesTable.mapper';
import { buildRingsideRpcFields, RINGSIDE_RPC_FUNCTION } from './ringsideEntryRpc';
import {
  evaluateWithdrawEligibility,
  WithdrawConflictError,
  WithdrawNotAllowedError,
  WithdrawNotFoundError,
  WithdrawUnavailableError,
  type WithdrawEligibility,
} from '@/services/database/entries/withdrawEligibility';

export { rowToEntry };
export type { ReplicatedEntry };

/**
 * MYK9-535: SECURITY DEFINER RPC that lets the person who owns an entry (dog
 * owner / co-owner / listed handler) withdraw it themselves.
 *
 * The `entries_update` RLS policy admits only `can_manage_show(show_id)`, so an
 * exhibitor's direct UPDATE matches 0 rows.
 *
 * ONLINE-ONLY, BY DESIGN — and deliberately NOT routed through the
 * MutationManager queue the ringside RPC uses. Withdrawal is pre-show by
 * definition (the RPC refuses a checked-in or in-ring entry), so it is not a
 * show-day offline flow, and it is money-adjacent: an optimistic local write
 * would report a withdrawal the server may refuse. The first attempt at this
 * DID queue optimistically and tried to undo the row on an authorization
 * failure; that revert could never fire, because `setOnce` refuses to overwrite
 * a locally-dirty row with a clean server value — exactly the guard that
 * protects offline scoring. The entry then read "withdrawn" forever while the
 * fee was still owed. The fix is not a better revert: it is not writing
 * optimistically at all. The call awaits the server, then stores the CONFIRMED
 * row clean.
 */
export const WITHDRAW_OWN_ENTRY_RPC = 'withdraw_own_entry';

/**
 * Project a replicated entry onto the withdraw predicate's input.
 *
 * The ORDER's payment status is deliberately NOT supplied. `rowToEntry` maps
 * `payment_status` only, so the replicated row has no order status to give — and
 * the RPC's own guard reads `entries.payment_status`, nothing else. Feeding an
 * order status in would let the client and the server disagree in the dangerous
 * direction: entry `paid_by_check` + order `pending` resolves to pending, so the
 * client would ALLOW a withdrawal the RPC refuses. The predicate keeps the
 * optional argument for callers that genuinely hold an order (its MYK9-495 unit
 * case pins that behaviour); this path is not one of them.
 */
function withdrawEligibilityOf(entry: ReplicatedEntry): WithdrawEligibility {
  return evaluateWithdrawEligibility({
    entryStatus: entry.entryStatus ?? entry.entry_status,
    paymentStatus: entry.paymentStatus,
    checkInStatus: entry.checkInStatus ?? entry.check_in_status,
    isInRing: entry.isInRing ?? entry.is_in_ring,
    isScored: entry.isScored ?? entry.is_scored,
    deletedAt: entry.deletedAt ?? entry.deleted_at,
  });
}

export class ReplicatedEntriesTable extends ReplicatedTable<ReplicatedEntry> {
  /** Most recent mutation ID from a create/update operation */
  private _lastMutationId: string | null = null;
  private _hasWarnedMissingShowScope = false;
  private readonly _syncsByShow = new Map<string, Promise<SyncResult>>();

  /**
   * IDs deleted locally this session. The download sync skips these
   * so it doesn't resurrect entries the user just deleted.
   */
  private _deletedIds: Set<string> = new Set();

  constructor() {
    super('entries', { logger });
  }

  /** Get the mutation ID from the last create/update operation */
  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  protected override rebuildUpdatePayload(entry: ReplicatedEntry): Record<string, unknown> {
    return entryToSupabaseRow(entry);
  }

  async sync(syncScopeId: string): Promise<SyncResult> {
    const showScopeId = syncScopeId.trim();
    if (!showScopeId) {
      if (!this._hasWarnedMissingShowScope) {
        logger.warn(`[${this.getTableName()}] Skipping remote sync without show scope`);
        this._hasWarnedMissingShowScope = true;
      }
      return {
        tableName: this.getTableName(),
        success: true,
        operation: 'incremental-sync',
        rowsAffected: 0,
        duration: 0,
      };
    }

    // Background replication and report reads can request the same show together.
    // Share only the active operation; the next refresh must still contact the server.
    const inFlight = this._syncsByShow.get(showScopeId);
    if (inFlight) return inFlight;
    const sync = this.syncShow(showScopeId).finally(() => {
      this._syncsByShow.delete(showScopeId);
    });
    this._syncsByShow.set(showScopeId, sync);
    return sync;
  }

  private async syncShow(showScopeId: string): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<EntryRow, ReplicatedEntry> = {
      getRemoteRowCount: async () => {
        try {
          const { count, error } = await supabase
            .from('view_authenticated_entry_results_replication')
            .select('id', { count: 'exact', head: true })
            .eq('show_id', showScopeId);

          if (error) {
            logger.warn(
              `[${showScopeId}] Entries coverage count unavailable; continuing sync`,
              'replication',
              { message: error.message }
            );
            return undefined;
          }

          return count ?? 0;
        } catch (error) {
          logger.warn(
            `[${showScopeId}] Entries coverage count unavailable; continuing sync`,
            'replication',
            { message: error instanceof Error ? error.message : String(error) }
          );
          return undefined;
        }
      },
      fetchRemoteRows: async ({ since }) => {
        // Filter by show_id if provided. In myK9Show this scope value is the Show ID.
        // Read through the authenticated result view instead of public.entries:
        // managers receive raw scored fields, while exhibitors only receive
        // their own entries with result columns nulled by the release cascade.
        // The view flattens dog display fields as dog_call_name/dog_breed.
        let query = supabase
          .from('view_authenticated_entry_results_replication')
          .select('*')
          .gt('updated_at', new Date(since).toISOString())
          .order('updated_at', { ascending: true });

        query = query.eq('show_id', showScopeId);

        const { data, error } = await query;

        if (error) {
          throw new Error(`Entries refresh failed: ${error.message}`);
        }

        return (data ?? []) as unknown as EntryRow[];
      },
      getRemoteId: remote => {
        return String(remote.id);
      },
      getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
      toLocalRow: rowToEntry,
      // After a non-conflicting dirty sync-down reconciles a row, a queued full-row
      // direct UPDATE (updateStatus/updateEntry) must be refreshed to the merged
      // payload so advancing its OCC token doesn't clobber server-changed untouched
      // fields (e.g. final_placement bumped by the recalc trigger). RPC writes carry
      // a delta and don't need this.
      rebuildUpdatePayload: entry => entryToSupabaseRow(entry),
      filterLocalRows: (rows, scope) =>
        scope.value ? rows.filter(row => row.showId === scope.value) : rows,
      resolveConflict: (local, remote) => this.resolveConflict(local, remote),
      shouldSkipRemoteRow: remote => {
        const entryId = String(remote.id);
        const shouldSkip = this._deletedIds.has(entryId);
        if (shouldSkip) {
          logger.log(`[${this.getTableName()}] Skipping deleted entry ${entryId} during sync`);
        }
        return shouldSkip;
      },
      afterSuccessfulSync: async ({ serverIds, localRows }) => {
        const pendingCount = await this.getMutationPendingCount();
        if (pendingCount > 0) {
          return;
        }

        for (const local of localRows) {
          if (local._localOnly && !serverIds.has(local.id)) {
            logger.log(`[${this.getTableName()}] Removing orphan local entry ${local.id}`);
            await this.delete(local.id);
          }
        }

        // Safe to clear deleted IDs — all DELETEs have been uploaded.
        this._deletedIds.clear();
      },
    };

    const result = await syncReplicatedTable(
      this,
      adapter,
      { value: showScopeId },
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN,
      }
    );

    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }

    return result;
  }

  /**
   * Conflict resolution for entries.
   * If the local entry has unsynced changes (pending mutation), keep it so the
   * write is not overwritten by a stale server snapshot before it uploads.
   * Server state is applied on the next sync after the mutation is uploaded.
   */
  protected resolveConflict(local: ReplicatedEntry, remote: ReplicatedEntry): ReplicatedEntry {
    if (local._syncStatus === 'pending') {
      return local;
    }
    return remote;
  }

  /**
   * Get entries by class ID
   */
  async getEntriesByClass(classId: string): Promise<ReplicatedEntry[]> {
    const all = await this.getAll();
    return all.filter(e => e.classId === classId);
  }

  /**
   * Get entries by show ID
   */
  async getEntriesByShow(showId: string): Promise<ReplicatedEntry[]> {
    const all = await this.getAll();
    return all.filter(e => e.showId === showId);
  }

  /**
   * Get entries by armband number
   */
  async getEntriesByArmband(armband: string): Promise<ReplicatedEntry[]> {
    const all = await this.getAll();
    return all.filter(e => e.armband === armband);
  }

  /**
   * Get entry by ID
   */
  async getEntryById(entryId: string): Promise<ReplicatedEntry | null> {
    return this.get(entryId);
  }

  /**
   * Load an entry for a write, hydrating the local replica from the server on
   * a cache miss.
   *
   * Pages like secretary Entry Management read their lists via PostgREST and
   * never run a per-show entries sync (only /at-show and scoring surfaces call
   * `sync(showId)`), so in a fresh browser profile the replica is cold and the
   * first check-in / day-of scratch would fail with "Entry not found" even
   * though the entry exists server-side. Hydration reads the same view the
   * sync adapter uses and seeds a clean row carrying its OCC serverVersion, so
   * the queued mutation's precondition matches the server. Offline misses
   * still throw the canonical not-found error: there is nothing to write
   * against, and the caller's retry UX handles it.
   */
  private async getOrHydrateEntry(entryId: string): Promise<ReplicatedEntry> {
    const cached = await this.get(entryId);
    if (cached) return cached;

    // An entry deleted locally this session must not be resurrected by a write.
    if (!this._deletedIds.has(entryId)) {
      try {
        const { data, error } = await supabase
          .from('view_authenticated_entry_results')
          .select('*')
          .eq('id', entryId)
          .maybeSingle();

        // Re-check after the await: a deleteEntry() for this id may have landed
        // while the fetch was in flight, and must still win the race.
        if (!error && data && !this._deletedIds.has(entryId)) {
          const row = data as unknown as EntryRow;
          const hydrated = rowToEntry(row);
          const serverVersion = (row as Record<string, unknown>).version as number | undefined;
          await this.set(entryId, hydrated, false, undefined, serverVersion);
          logger.log(`[${this.getTableName()}] Hydrated cold-replica entry ${entryId} for write`);
          return hydrated;
        }
      } catch (error) {
        logger.warn(`[${this.getTableName()}] Cold-replica hydration failed for ${entryId}`, error);
      }
    }

    throw new Error(`Entry ${entryId} not found`);
  }

  /**
   * Update entry status (offline-first)
   * @returns mutation ID if queued, null if no MutationManager
   */
  async updateEntryStatus(entryId: string, status: string): Promise<string | null> {
    const entry = await this.getOrHydrateEntry(entryId);

    const updated: ReplicatedEntry = {
      ...entry,
      status,
      entryStatus: status,
      entry_status: status,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(entryId, updated, true);
    const mutationId = await this.queueMutation('UPDATE', entryId, entryToSupabaseRow(updated));
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated entry ${entryId} status to ${status}`);
    return mutationId;
  }

  /**
   * Update only the show-day check-in status.
   *
   * This deliberately queues a narrow payload because handler/self check-in
   * policies allow `check_in_status` changes without granting broad row writes.
   */
  async updateCheckInStatus(entryId: string, status: CheckInStatus): Promise<string | null> {
    const entry = await this.getOrHydrateEntry(entryId);

    const updated: ReplicatedEntry = {
      ...entry,
      checkInStatus: status,
      check_in_status: status,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(entryId, updated, true);
    const mutationId = await this.queueMutation(
      'UPDATE',
      entryId,
      {
        id: entryId,
        check_in_status: status,
        updated_at: new Date().toISOString(),
      },
      undefined,
      // check_in_status is ringside-whitelisted; route through the RPC so judges/
      // stewards can persist check-ins (updated_at is auto-managed, not intent).
      { name: RINGSIDE_RPC_FUNCTION, fields: { check_in_status: status } }
    );
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated entry ${entryId} check-in status to ${status}`);
    return mutationId;
  }

  /**
   * Update entry (marks as dirty for sync)
   * @returns mutation ID if queued, null if no MutationManager
   */
  async updateEntry(entryId: string, updates: Partial<ReplicatedEntry>): Promise<string | null> {
    const entry = await this.getOrHydrateEntry(entryId);

    const updated: ReplicatedEntry = {
      ...entry,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    const supabaseRow = entryToSupabaseRow(updated);
    // Auto-route ringside-only writes (scoring/run-order/check-in/placement)
    // through the SECURITY DEFINER RPC so assigned judges / stewards — who are
    // denied by the entries UPDATE RLS policy — can persist. Writes that touch
    // any non-ringside column fall through to the direct UPDATE. See
    // ./ringsideEntryRpc.ts.
    const rpcFields = buildRingsideRpcFields(Object.keys(updates), supabaseRow);

    // Durable-first: queue the mutation BEFORE mutating the local cache. If the
    // queue write THROWS (overflow/quota), the optimistic cache is never touched,
    // so we don't strand a dirty row that shows as saved but has no mutation to
    // upload — the caller's error path leaves the list unchanged. (There is no
    // orphan-repair to rescue such a row.) The OCC serverVersion precondition
    // reads the pre-update cache row, which our optimistic edit hasn't changed.
    //
    // A `null` return means no MutationManager is wired (a dev/test or
    // misconfiguration case, never production, where the provider always wires
    // it). We still update the cache so offline-cache behavior works; the scoring
    // caller separately treats `null` as a failure and surfaces it.
    //
    // deferUpload: don't let the auto-upload flush (and delete) this mutation
    // before the dirty cache row exists — otherwise, when online with slow
    // storage, the row could be written dirty AFTER its mutation was already
    // uploaded+removed, stranding it as pending forever. We trigger the upload
    // ourselves after set() below.
    const mutationId = await this.queueMutation(
      'UPDATE',
      entryId,
      supabaseRow,
      undefined,
      rpcFields ? { name: RINGSIDE_RPC_FUNCTION, fields: rpcFields } : undefined,
      /* deferUpload */ true
    );

    await this.set(entryId, updated, true);
    this.requestUpload();
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated entry ${entryId}`);
    return mutationId;
  }

  /**
   * Update only the secretary lifecycle status fields.
   *
   * Entry Management still has a PostgREST read path during Wave D, so the row
   * may not be hydrated in IndexedDB yet. This method can seed the local cache
   * from the already-loaded secretary row while queueing a narrow UPDATE payload
   * so missing seed fields are not uploaded as NULL.
   */
  async updateSecretaryLifecycleStatus(
    entryId: string,
    updates: Partial<ReplicatedEntry>,
    seed: Partial<ReplicatedEntry> = {}
  ): Promise<string | null> {
    const entry = (await this.get(entryId)) ?? ({ id: entryId, ...seed } as ReplicatedEntry);
    const updated: ReplicatedEntry = {
      ...entry,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(entryId, updated, true);

    const payload: Record<string, unknown> = {
      id: entryId,
      entry_status: updates.entry_status ?? updates.entryStatus ?? updates.status,
      updated_at: new Date().toISOString(),
    };

    if (updates.check_in_status !== undefined || updates.checkInStatus !== undefined) {
      payload.check_in_status = updates.check_in_status ?? updates.checkInStatus;
    }

    if (updates.withdrawal_reason !== undefined || updates.withdrawalReason !== undefined) {
      payload.withdrawal_reason = updates.withdrawal_reason ?? updates.withdrawalReason;
    }

    const mutationId = await this.queueMutation('UPDATE', entryId, payload);
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated entry ${entryId} secretary lifecycle status`);
    return mutationId;
  }

  /**
   * The owner-tier guards, evaluated against the replicated row. Used by the
   * Pull affordance and by `withdrawOwnEntry` itself so the two cannot drift.
   */
  async getWithdrawEligibility(entryId: string): Promise<WithdrawEligibility> {
    const entry = await this.getOrHydrateEntry(entryId);
    return withdrawEligibilityOf(entry);
  }

  /**
   * Withdraw an entry the caller owns — MYK9-535. Online-only (see the note on
   * WITHDRAW_OWN_ENTRY_RPC): awaits the server, then stores the confirmed row.
   *
   * Every failure leaves the local row untouched and arrives as a typed error so
   * the dialog can say something true: `WithdrawNotAllowedError` (a refusal the
   * client saw coming), `WithdrawNotFoundError` (the row is gone),
   * `WithdrawUnavailableError` (no connection), `WithdrawConflictError` (someone
   * else changed it), or the raw Postgres error for anything unclassified.
   */
  async withdrawOwnEntry(entryId: string): Promise<{ from: string | undefined }> {
    const { entry, wasCached } = await this.loadEntryForWithdrawal(entryId);

    const eligibility = withdrawEligibilityOf(entry);
    if (!eligibility.allowed) throw new WithdrawNotAllowedError(eligibility);

    const version = await this.callWithdrawRpc(entryId, await this.getServerVersion(entryId));

    // MYK9-573: captured BEFORE the RPC, so a sync landing mid-call cannot turn
    // an update into an insert.
    await this.hydrateConfirmedRow(entryId, wasCached, version);

    logger.log(`[${this.getTableName()}] Withdrew entry ${entryId} via ${WITHDRAW_OWN_ENTRY_RPC}`);
    return { from: entry.entryStatus ?? entry.entry_status };
  }

  /**
   * The row the guards run against.
   *
   * `getOrHydrateEntry` throws the same "not found" for a row that is ABSENT and
   * for a read that FAILED, and those need different sentences, so the cold-cache
   * case is resolved here: a read error means "no connection", an empty result
   * means "this entry is gone".
   *
   * Reports whether the row came from the CACHE, because that decides whether
   * the post-write hydrate may touch the store at all (MYK9-573). A cold row is
   * read for the guards and deliberately never cached.
   */
  private async loadEntryForWithdrawal(
    entryId: string
  ): Promise<{ entry: ReplicatedEntry; wasCached: boolean }> {
    const cached = await this.get(entryId);
    if (cached) return { entry: cached, wasCached: true };

    let result: { data: unknown; error: unknown };
    try {
      result = await supabase
        .from('view_authenticated_entry_results')
        .select('*')
        .eq('id', entryId)
        .maybeSingle();
    } catch {
      throw new WithdrawUnavailableError();
    }
    if (result.error) throw new WithdrawUnavailableError();
    if (!result.data) throw new WithdrawNotFoundError();
    return { entry: rowToEntry(result.data as unknown as EntryRow), wasCached: false };
  }

  /**
   * Call the RPC, retrying ONCE on a version conflict.
   *
   * A 40001 is otherwise a dead end: the retry would re-read the same stale
   * `serverVersion` out of IndexedDB and conflict forever. The RPC puts the
   * authoritative version in DETAIL (the same contract `ringside_update_entry`
   * uses), so the retry uses that. A second conflict is a real race with another
   * writer and becomes an error the exhibitor can act on.
   */
  private async callWithdrawRpc(
    entryId: string,
    expectedVersion: number | null
  ): Promise<number | undefined> {
    const attempt = async (version: number | null) =>
      supabase.rpc(
        WITHDRAW_OWN_ENTRY_RPC as never,
        {
          p_entry_id: entryId,
          p_fields: { entry_status: 'withdrawn' },
          p_expected_version: version,
        } as never
      );

    let { data, error } = await attempt(expectedVersion);

    if (error && (error as { code?: string }).code === '40001') {
      // `Number(null)` and `Number('')` are both 0, which is a perfectly valid
      // version — so an EMPTY detail must be rejected before the conversion,
      // not after it, or a conflict with no version retries at version 0.
      const detail = (error as { details?: string | null }).details;
      const serverVersion = detail == null || detail === '' ? Number.NaN : Number(detail);
      if (!Number.isFinite(serverVersion)) throw new WithdrawConflictError();
      logger.warn(
        `[${this.getTableName()}] Withdrawal of ${entryId} hit a version conflict; retrying at ${serverVersion}`
      );
      ({ data, error } = await attempt(serverVersion));
      if (error && (error as { code?: string }).code === '40001') {
        throw new WithdrawConflictError();
      }
    }

    if (error) throw this.classifyWithdrawTransportError(error);
    return typeof data === 'number' ? data : undefined;
  }

  /**
   * A fetch that never reached Postgres carries no SQLSTATE. Report that as
   * "you appear to be offline" rather than leaking a transport string into the
   * dialog — a warm cached row reaches the RPC without ever touching the
   * cold-cache path that would otherwise have caught this.
   */
  private classifyWithdrawTransportError(error: unknown): unknown {
    const code = (error as { code?: string } | null)?.code;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline || !code) return new WithdrawUnavailableError();
    return error;
  }

  /**
   * The OCC token for this row, or null when it has never been synced. Read the
   * same way `ReplicatedTable.queueMutation` reads it, so the version sent to
   * the RPC is the one the queue path would have sent.
   *
   * Unlike `queueMutation` this does NOT gate on `isConflictSurfacingEnabled()`:
   * that kill-switch exists to keep last-write-wins behaviour for QUEUED writes
   * whose conflicts surface asynchronously. This is a direct call that can
   * report a conflict to the caller immediately, so it always sends the token.
   */
  private async getServerVersion(entryId: string): Promise<number | null> {
    try {
      const db = await databaseManager.getDatabase(this.getTableName());
      const row = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
        this.getTableName(),
        String(entryId),
      ])) as { serverVersion?: number } | undefined;
      return row?.serverVersion ?? null;
    } catch {
      // No OCC token is safe here: the RPC treats null as "no precondition".
      return null;
    }
  }

  /**
   * Re-read the authoritative row after a confirmed server write and UPDATE it
   * in the replica, clean. Falls back to a local status patch when the read-back
   * fails, so a successful withdrawal is never displayed as still entered.
   *
   * NEVER INSERTS (MYK9-573). The invariant this has to respect: this table is
   * SHOW-SCOPED, and an account-scope read treats a non-empty store as complete.
   * `readWithReplicationFallback` falls through to PostgREST only while the
   * local result is empty, and an unscoped `getAll()` returns whatever the store
   * holds — so seeding one row into an otherwise empty replica made
   * /exhibitor/entries report that single row as the user's entire entry list,
   * across reloads, until the row was deleted by hand. Updating a row the
   * show-scoped sync already put there is safe; creating one is not, and an
   * account-level page re-reads from the server anyway.
   *
   * A clean write also lands only while the row is not locally dirty — `setOnce`
   * refuses to overwrite a dirty row with a clean value. Withdrawal itself no
   * longer dirties it, and no other edit path in this dialog dirties a row that
   * is still ELIGIBLE to withdraw; if one is ever added, this write would be
   * skipped and the entry would keep showing its pre-withdrawal status.
   */
  private async hydrateConfirmedRow(
    entryId: string,
    wasCached: boolean,
    newVersion?: number
  ): Promise<void> {
    if (!wasCached) {
      logger.log(
        `[${this.getTableName()}] Entry ${entryId} is not in the show-scoped replica; ` +
          'skipping the post-withdrawal cache write so an account-scope read still falls through'
      );
      return;
    }

    try {
      const { data, error } = await supabase
        .from('view_authenticated_entry_results')
        .select('*')
        .eq('id', entryId)
        .maybeSingle();
      if (!error && data) {
        const row = data as unknown as EntryRow;
        const serverVersion =
          ((row as Record<string, unknown>).version as number | undefined) ?? newVersion;
        await this.set(entryId, rowToEntry(row), false, undefined, serverVersion);
        return;
      }
    } catch (readBackError) {
      logger.warn(
        `[${this.getTableName()}] Withdrawal read-back failed for ${entryId}`,
        readBackError
      );
    }

    const cached = await this.get(entryId);
    if (cached) {
      await this.set(
        entryId,
        { ...cached, entryStatus: 'withdrawn', entry_status: 'withdrawn', status: 'withdrawn' },
        false,
        undefined,
        newVersion
      );
    }
  }

  async updateArmbandForDogInShow(
    showId: string,
    dogId: string,
    armband: string,
    entryIds: string[] = []
  ): Promise<{ updated: number; mutationIds: string[] }> {
    const entries = (await this.getEntriesByShow(showId)).filter(
      entry => entry.dogId === dogId && !entry.deletedAt && !entry.deleted_at
    );
    const targets = new Map<string, ReplicatedEntry | null>();
    entries.forEach(entry => targets.set(entry.id, entry));
    entryIds.forEach(entryId => {
      if (entryId && !targets.has(entryId)) {
        targets.set(entryId, null);
      }
    });

    const mutationIds: string[] = [];
    for (const [entryId, entry] of targets) {
      if (entry) {
        const updated: ReplicatedEntry = {
          ...entry,
          armband,
          armbandNumber: armband,
          _lastModified: new Date(),
          _syncStatus: 'pending',
        };

        await this.set(entryId, updated, true);
      }

      const mutationId = await this.queueMutation('UPDATE', entryId, {
        id: entryId,
        armband,
        updated_at: new Date().toISOString(),
      });
      if (mutationId) {
        mutationIds.push(mutationId);
        this._lastMutationId = mutationId;
      }
    }

    logger.log(
      `[${this.getTableName()}] Updated ${targets.size} entries for dog ${dogId} to armband ${armband}`
    );
    return { updated: targets.size, mutationIds };
  }

  /**
   * Create a new entry locally (queued for sync)
   * @param entry - Entry data (must include id)
   * @param dependsOn - Optional mutation IDs that must upload before this entry
   * The mutation ID is available via `lastMutationId` for dependency tracking.
   */
  async createEntry(
    entry: ReplicatedEntry,
    dependsOn: string | string[] = []
  ): Promise<ReplicatedEntry> {
    const newEntry: ReplicatedEntry = {
      ...entry,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(entry.id, newEntry, true);
    const mutationId = await this.queueMutation(
      'INSERT',
      entry.id,
      entryToSupabaseRow(newEntry),
      typeof dependsOn === 'string' ? [dependsOn] : dependsOn.length > 0 ? dependsOn : undefined
    );
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Created new entry ${entry.id}`);
    return newEntry;
  }

  /**
   * Delete an entry locally and queue DELETE mutation for Supabase sync.
   * Also marks the ID so the download sync won't resurrect it this session.
   */
  async deleteEntry(entryId: string): Promise<string | null> {
    this._deletedIds.add(entryId);
    await this.delete(entryId);
    const mutationId = await this.queueMutation('DELETE', entryId, { id: entryId });
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Deleted entry ${entryId}`);
    return mutationId;
  }
}

// Singleton export
export const replicatedEntriesTable = new ReplicatedEntriesTable();
