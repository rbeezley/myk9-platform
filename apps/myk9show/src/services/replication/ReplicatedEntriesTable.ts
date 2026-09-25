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
  type ColdInsertGuardMode,
  type ReplicatedSetResult,
  type SyncReplicatedTableAdapter,
  type SyncOptions,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import type { CheckInStatus } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import type { Database } from '@/types/supabase';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import {
  entryToSupabaseRow,
  rowToEntry,
  type EntryRow,
  type ReplicatedEntry,
} from './ReplicatedEntriesTable.mapper';
import { buildRingsideRpcFields, RINGSIDE_RPC_FUNCTION } from './ringsideEntryRpc';
import {
  classifyMoveUpRpcError,
  MOVE_UP_ENTRY_RPC,
  REVERSE_MOVE_UP_ENTRY_RPC,
} from './moveUpEntryRpc';
import {
  JumpHeightConflictError,
  JumpHeightNotFoundError,
  JumpHeightUnavailableError,
  UPDATE_OWN_ENTRY_JUMP_HEIGHT_RPC,
} from '@/services/database/entries/jumpHeightErrors';
import {
  evaluateWithdrawEligibility,
  WITHDRAW_MISSING,
  WithdrawConflictError,
  WithdrawNotAllowedError,
  WithdrawNotFoundError,
  WithdrawUnavailableError,
  type RemoveFromClassEligibility,
  type WithdrawEligibility,
} from '@/services/database/entries/withdrawEligibility';
import type {
  RemoveFromClassKind,
  WithdrawalReasonCode,
} from '@/features/registries/withdrawalPolicy';

export { rowToEntry };
export type { ReplicatedEntry };

/** The two move-up server functions, as the generated types name them. */
type MoveUpRpcName = typeof MOVE_UP_ENTRY_RPC | typeof REVERSE_MOVE_UP_ENTRY_RPC;
type MoveUpRpcArgs<Fn extends MoveUpRpcName> = Database['public']['Functions'][Fn]['Args'];
type MoveUpRpcReturns<Fn extends MoveUpRpcName> = Database['public']['Functions'][Fn]['Returns'];

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

const ENTRIES_REPLICATION_PAGE_SIZE = 1000;
const RECEIPT_REFERENCE_REFRESH_VERSION = 1;
const RECEIPT_REFERENCE_REFRESH_KEY = 'myk9:entries:receipt-reference-refresh';

function receiptReferenceRefreshStorageKey(showId: string, principalId: string): string {
  return `${RECEIPT_REFERENCE_REFRESH_KEY}:v${RECEIPT_REFERENCE_REFRESH_VERSION}:${principalId}:${showId}`;
}

function hasReceiptReferenceRefresh(showId: string, principalId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  return (
    localStorage.getItem(receiptReferenceRefreshStorageKey(showId, principalId)) === 'complete'
  );
}

function markReceiptReferenceRefresh(showId: string, principalId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(receiptReferenceRefreshStorageKey(showId, principalId), 'complete');
}

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
function withdrawEligibilityOf(
  entry: ReplicatedEntry,
  kind: RemoveFromClassKind = 'withdraw'
): WithdrawEligibility {
  return evaluateWithdrawEligibility({
    kind,
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
  private readonly _syncsByShow = new Map<string, { sync: Promise<SyncResult>; forced: boolean }>();

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

  /**
   * MYK9-575: `entries` replicates PER SHOW, so a single-row INSERT from an
   * account-level surface (/my-entries, /exhibitor/entries) makes the store
   * non-empty and an unscoped read returns that one row as the whole dataset.
   * `set()` therefore refuses an INSERT unless the caller names its reason via
   * `allowColdInsert`; the sync download writes through `batchSet` and is
   * unaffected.
   *
   * Loud in dev/test, quiet in production: a refusal must never crash a
   * show-day write. The queued server mutation still uploads; only the local
   * cache row is skipped, which is the safe side (the account read keeps
   * falling through to PostgREST).
   */
  protected override coldInsertGuardMode(): ColdInsertGuardMode | null {
    return import.meta.env.DEV || import.meta.env.MODE === 'test' ? 'throw' : 'skip';
  }

  /**
   * `set()` can legitimately store NOTHING — a refused cold INSERT in
   * production `skip` mode (MYK9-575), or a dirty row preserved against a clean
   * server value. Never let a caller report such a write as stored. The queued
   * server mutation is the authoritative half and still uploads; only the
   * optimistic local row is missing, and the next per-show sync restores it.
   *
   * @returns true when the local cache row was actually written.
   */
  private reportSetResult(entryId: string, result: ReplicatedSetResult): boolean {
    if (result.written) return true;
    logger.warn(
      `[${this.getTableName()}] Local cache write skipped for ${entryId} (${result.reason}); ` +
        'any queued server mutation still applies'
    );
    return false;
  }

  async sync(syncScopeId: string, options?: Partial<SyncOptions>): Promise<SyncResult> {
    return this.syncForPrincipal(syncScopeId, 'anonymous', options);
  }

  async syncForPrincipal(
    syncScopeId: string,
    principalId: string,
    options?: Partial<SyncOptions>
  ): Promise<SyncResult> {
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
    const syncKey = `${principalId}:${showScopeId}`;
    const running = this._syncsByShow.get(syncKey);
    const forceFullSync = options?.forceFullSync === true;
    // A forced full sync must not be answered by an incremental one already
    // running (MYK9-752): wait that one out, then run its own. Anything shares
    // a forced run; only an ordinary call shares an ordinary one.
    if (running && (running.forced || !forceFullSync)) return running.sync;
    const sync = (running ? running.sync.then(noop, noop) : Promise.resolve())
      .then(() => this.syncShow(showScopeId, principalId, forceFullSync))
      .finally(() => {
        if (this._syncsByShow.get(syncKey)?.sync === sync) this._syncsByShow.delete(syncKey);
      });
    this._syncsByShow.set(syncKey, { sync, forced: forceFullSync });
    return sync;
  }

  async refreshReceiptReferencesForUser(principalId: string): Promise<void> {
    const localRows = await this.getAll();
    const showIds = new Set(
      localRows.map(row => row.showId).filter((showId): showId is string => Boolean(showId))
    );

    await Promise.all(
      [...showIds]
        .filter(showId => !hasReceiptReferenceRefresh(showId, principalId))
        .map(showId => this.syncForPrincipal(showId, principalId))
    );
  }

  private async syncShow(
    showScopeId: string,
    principalId: string,
    forceFullSync = false
  ): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);
    const needsReceiptReferenceRefresh = !hasReceiptReferenceRefresh(showScopeId, principalId);
    let remoteRowCount: number | undefined;
    let receiptReferenceColumnObserved = false;

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

          remoteRowCount = count ?? 0;
          return remoteRowCount;
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
        const rows: EntryRow[] = [];
        let cursorUpdatedAt: string | null = null;
        let cursorId: string | null = null;

        for (;;) {
          let query = supabase.from('view_authenticated_entry_results_replication').select('*');

          if (cursorUpdatedAt && cursorId && typeof query.or === 'function') {
            query = query.or(
              `updated_at.gt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.gt.${cursorId})`
            );
          } else {
            query = query.gt('updated_at', new Date(since).toISOString());
          }

          query = query.order('updated_at', { ascending: true });
          if (typeof query.order === 'function') {
            query = query.order('id', { ascending: true });
          }

          query = query.eq('show_id', showScopeId);
          const response =
            typeof query.range === 'function'
              ? await query.range(0, ENTRIES_REPLICATION_PAGE_SIZE - 1)
              : await query;

          if (response.error) {
            throw new Error(`Entries refresh failed: ${response.error.message}`);
          }

          const pageRows = (response.data ?? []) as unknown as EntryRow[];
          rows.push(...pageRows);
          if (
            pageRows.some(row =>
              Object.prototype.hasOwnProperty.call(row, 'registration_confirmation_number')
            )
          ) {
            receiptReferenceColumnObserved = true;
          }
          if (pageRows.length < ENTRIES_REPLICATION_PAGE_SIZE) return rows;

          const lastRow = pageRows[pageRows.length - 1];
          if (!lastRow?.updated_at || !lastRow.id) return rows;
          cursorUpdatedAt = String(lastRow.updated_at);
          cursorId = String(lastRow.id);
        }
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
        forceFullSync: forceFullSync || needsReceiptReferenceRefresh,
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN,
      }
    );

    if (
      needsReceiptReferenceRefresh &&
      result.success &&
      (receiptReferenceColumnObserved || remoteRowCount === 0)
    ) {
      markReceiptReferenceRefresh(showScopeId, principalId);
    }

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
   * Load an entry FOR A WRITE, hydrating the local replica from the server on
   * a cache miss.
   *
   * The name carries the only justification for the hydration: `entries` is
   * show-scoped, so the INSERT it performs is opted out of the MYK9-575 guard
   * and must never be reachable from a read path. Reads use `get` /
   * `readEntryForWithdrawal`, which write nothing.
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
  private async getOrHydrateEntryForWrite(entryId: string): Promise<ReplicatedEntry> {
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
          this.reportSetResult(
            entryId,
            await this.set(entryId, hydrated, false, undefined, serverVersion, {
              allowColdInsert: 'write-path hydration of a cold show-scoped replica',
            })
          );
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
    const entry = await this.getOrHydrateEntryForWrite(entryId);

    const updated: ReplicatedEntry = {
      ...entry,
      status,
      entryStatus: status,
      entry_status: status,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    this.reportSetResult(entryId, await this.set(entryId, updated, true));
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
    const entry = await this.getOrHydrateEntryForWrite(entryId);

    const updated: ReplicatedEntry = {
      ...entry,
      checkInStatus: status,
      check_in_status: status,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    this.reportSetResult(entryId, await this.set(entryId, updated, true));
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
    const entry = await this.getOrHydrateEntryForWrite(entryId);

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

    this.reportSetResult(entryId, await this.set(entryId, updated, true));
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
    const cached = await this.get(entryId);
    // MYK9-575: with no cached row AND no seed there is nothing to store but a
    // stub `{ id, entry_status }` — `bulkUpdateEntryStatus` passes no seed, so a
    // cold bulk status change would otherwise INSERT a partial row as dirty and
    // then upload it. Queue the server mutation and write nothing locally; the
    // next per-show sync brings the real row back.
    const seededRow =
      Object.keys(seed).length > 0 ? ({ id: entryId, ...seed } as ReplicatedEntry) : null;
    const entry = cached ?? seededRow;

    if (entry) {
      const updated: ReplicatedEntry = {
        ...entry,
        ...updates,
        _lastModified: new Date(),
        _syncStatus: 'pending',
      };

      const result = await this.set(
        entryId,
        updated,
        true,
        undefined,
        undefined,
        cached
          ? undefined
          : { allowColdInsert: 'secretary lifecycle write seeded from the loaded row' }
      );
      if (!result.written) {
        logger.warn(
          `[${this.getTableName()}] Local cache write skipped for ${entryId} (${result.reason}); the server mutation is still queued`
        );
      }
    } else {
      logger.log(
        `[${this.getTableName()}] No cached row and no seed for ${entryId}; queueing the status mutation without a local write`
      );
    }

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

    // MYK9-632: the manager's Withdraw carries the recognised reason CODE, and
    // their Pull carries an explicit null that CLEARS a code a previous
    // withdrawal left. `??` would swallow that null, so both keys are read for
    // presence and the value is taken from whichever was supplied.
    if (
      updates.withdrawal_reason_code !== undefined ||
      updates.withdrawalReasonCode !== undefined
    ) {
      payload.withdrawal_reason_code =
        updates.withdrawal_reason_code !== undefined
          ? updates.withdrawal_reason_code
          : updates.withdrawalReasonCode;
    }

    const mutationId = await this.queueMutation('UPDATE', entryId, payload);
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated entry ${entryId} secretary lifecycle status`);
    return mutationId;
  }

  /**
   * The owner-tier guards, evaluated against the replicated row. Used by the
   * Pull affordance and by `withdrawOwnEntry` itself so the two cannot drift.
   *
   * MYK9-573: goes through the NON-CACHING read. This runs on open for every
   * class row in `EntryEditDialog`, which is mounted on the account-level
   * `/my-entries`; the previous `getOrHydrateEntryForWrite` seeded one row per class
   * into an otherwise-empty show-scoped store before Pull was ever clicked.
   */
  async getWithdrawEligibility(entryId: string): Promise<WithdrawEligibility> {
    const batch = await this.getWithdrawEligibilityForEntries([entryId]);
    return batch[entryId] ?? WITHDRAW_MISSING;
  }

  /**
   * The same guards for MANY entries in ONE round trip.
   *
   * The dialog runs this on every open, for every class row, and cards group by
   * `registration_id` — a multi-dog order is routinely 20-40 rows. Once the
   * eligibility read stopped seeding the replica (MYK9-573) the per-id version
   * became N parallel PostgREST reads on each open, where previously the first
   * open seeded and every later one was free. One `in('id', ids)` restores that.
   *
   * Still writes NOTHING to the store. Cached rows are answered locally and only
   * the misses are fetched. Per-id semantics are preserved: an id missing from
   * the batch result is 'missing'; a failed batch leaves every uncached id
   * absent from the map so the caller applies its own lookup-failed refusal.
   */
  async getWithdrawEligibilityForEntries(
    entryIds: string[]
  ): Promise<Record<string, WithdrawEligibility>> {
    const both = await this.getRemoveFromClassEligibilityForEntries(entryIds);
    return Object.fromEntries(
      Object.entries(both).map(([entryId, pair]) => [entryId, pair.withdraw])
    );
  }

  /**
   * MYK9-632: BOTH verdicts for each row, from the same single round trip.
   *
   * The exhibitor is offered two acts and they diverge on exactly one guard (a
   * paid entry may be pulled but not withdrawn), so one verdict cannot drive the
   * dialog: a paid row must grey Withdraw out, with its reason, while Pull stays
   * live. Evaluating twice over the same row costs nothing and keeps the two
   * answers from ever disagreeing about the row they describe.
   */
  async getRemoveFromClassEligibilityForEntries(
    entryIds: string[]
  ): Promise<Record<string, RemoveFromClassEligibility>> {
    const unique = [...new Set(entryIds.filter(Boolean))];
    const result: Record<string, RemoveFromClassEligibility> = {};
    const misses: string[] = [];

    const bothOf = (entry: ReplicatedEntry): RemoveFromClassEligibility => ({
      withdraw: withdrawEligibilityOf(entry, 'withdraw'),
      pull: withdrawEligibilityOf(entry, 'pull'),
    });
    const missingPair: RemoveFromClassEligibility = {
      withdraw: WITHDRAW_MISSING,
      pull: WITHDRAW_MISSING,
    };

    for (const entryId of unique) {
      const cached = await this.get(entryId);
      if (cached) result[entryId] = bothOf(cached);
      else if (this._deletedIds.has(entryId)) result[entryId] = missingPair;
      else misses.push(entryId);
    }

    if (misses.length === 0) return result;

    let rows: unknown[];
    try {
      const { data, error } = await supabase
        .from('view_authenticated_entry_results')
        .select('*')
        .in('id', misses);
      // A failed batch leaves every miss out of the map — the caller decides
      // what an unanswered id means, and its default is a refusal.
      if (error || !data) return result;
      rows = data as unknown[];
    } catch {
      return result;
    }

    const byId = new Map<string, unknown>();
    for (const row of rows) {
      const id = (row as { id?: string }).id;
      if (id) byId.set(id, row);
    }
    for (const entryId of misses) {
      const row = byId.get(entryId);
      result[entryId] = row ? bothOf(rowToEntry(row as EntryRow)) : missingPair;
    }
    return result;
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
  async withdrawOwnEntry(
    entryId: string,
    options: { kind?: RemoveFromClassKind; reason?: WithdrawalReasonCode | null } = {}
  ): Promise<{ from: string | undefined; to: string }> {
    const kind: RemoveFromClassKind = options.kind ?? 'withdraw';
    const reason = kind === 'withdraw' ? (options.reason ?? null) : null;
    // MYK9-632: the two acts write DIFFERENT statuses. 'scratched' is the
    // platform's stored word for a pull — the secretary's pull-reconciliation
    // surface keys on it — and the user-facing word is "Pull" everywhere.
    const targetStatus = kind === 'pull' ? 'scratched' : 'withdrawn';

    if (kind === 'withdraw' && reason == null) {
      throw new WithdrawNotAllowedError(
        {
          allowed: false,
          code: 'status',
          reason: 'Choose a withdrawal reason before withdrawing this entry.',
        },
        kind
      );
    }

    const { entry, wasCached, coldVersion } = await this.readEntryForWithdrawal(entryId, kind);

    const eligibility = withdrawEligibilityOf(entry, kind);
    if (!eligibility.allowed) throw new WithdrawNotAllowedError(eligibility, kind);

    // A cached row's OCC token lives in the replica; a cold row's came back with
    // the read that answered the guards.
    const expectedVersion = wasCached ? await this.getServerVersion(entryId) : coldVersion;
    const version = await this.callWithdrawRpc(entryId, expectedVersion, kind, reason);

    // MYK9-573: `wasCached` is probed BEFORE the RPC and is the primary gate —
    // a row that was absent then is never written, even if a sync lands during
    // the call. The write additionally re-checks the store for the OPPOSITE
    // race (present then, evicted during the call).
    await this.hydrateConfirmedRow(entryId, wasCached, version, targetStatus);

    logger.log(
      `[${this.getTableName()}] ${kind === 'pull' ? 'Pulled' : 'Withdrew'} entry ${entryId} via ${WITHDRAW_OWN_ENTRY_RPC}`
    );
    return { from: entry.entryStatus ?? entry.entry_status, to: targetStatus };
  }

  /**
   * The row the guards run against.
   *
   * `getOrHydrateEntryForWrite` throws the same "not found" for a row that is ABSENT and
   * for a read that FAILED, and those need different sentences, so the cold-cache
   * case is resolved here: a read error means "no connection", an empty result
   * means "this entry is gone".
   *
   * NEVER WRITES TO THE STORE (MYK9-573) — unlike `getOrHydrateEntryForWrite`, which
   * seeds a clean row on a cache miss because the secretary check-in/scratch
   * path needs an OCC token to write against. Both withdrawal-path readers (the
   * Pull affordance's eligibility check and the withdrawal itself) come through
   * here, so a cold row is read for the guards and discarded. That is what keeps
   * "the row is in the store" meaning "the show-scoped sync put it there".
   *
   * `wasCached` is reported for logging and intent; the write gate itself is a
   * FRESH `get` at the moment of writing (see `hydrateConfirmedRow`).
   */
  private async readEntryForWithdrawal(
    entryId: string,
    // MYK9-632: carried only so an "offline" refusal names the act the exhibitor
    // actually chose.
    kind: RemoveFromClassKind = 'withdraw'
  ): Promise<{ entry: ReplicatedEntry; wasCached: boolean; coldVersion: number | null }> {
    const cached = await this.get(entryId);
    if (cached) return { entry: cached, wasCached: true, coldVersion: null };

    // An entry deleted locally this session is gone as far as this caller is
    // concerned; the server copy must not resurrect it into a withdrawal.
    if (this._deletedIds.has(entryId)) throw new WithdrawNotFoundError();

    let result: { data: unknown; error: unknown };
    try {
      result = await supabase
        .from('view_authenticated_entry_results')
        .select('*')
        .eq('id', entryId)
        .maybeSingle();
    } catch {
      throw new WithdrawUnavailableError(kind);
    }
    if (result.error) throw new WithdrawUnavailableError(kind);
    if (!result.data) throw new WithdrawNotFoundError();
    const row = result.data as unknown as EntryRow;
    // Carried out so the RPC still gets an OCC precondition on a cold row. The
    // replica has no `serverVersion` for a row it never stored, and without this
    // the account-level path would send `p_expected_version: null` — which makes
    // the retry-once-on-40001 contract unreachable exactly where it is needed.
    const version = (row as unknown as Record<string, unknown>).version;
    return {
      entry: rowToEntry(row),
      wasCached: false,
      coldVersion: typeof version === 'number' ? version : null,
    };
  }

  /**
   * Call the RPC, retrying ONCE on a version conflict.
   *
   * A 40001 is otherwise a dead end: the retry would re-read the same stale
   * `serverVersion` out of IndexedDB and conflict forever. The RPC puts the
   * authoritative version in DETAIL (the same contract `ringside_update_entry`
   * uses), so the retry uses that. A second conflict is a real race with another
   * writer and becomes an error the exhibitor can act on.
   *
   * Typed, not cast (MYK9-583). `p_expected_version` is `number | null` because
   * NULL means "no OCC precondition" in the SQL; the generated type says
   * `number` only because `pg_proc` records no argument nullability, and
   * `src/types/database-overrides.ts` corrects it. Never coalesce the null to 0
   * to satisfy the generated type — 0 is a real version.
   */
  private async callWithdrawRpc(
    entryId: string,
    expectedVersion: number | null,
    kind: RemoveFromClassKind = 'withdraw',
    reason: WithdrawalReasonCode | null = null
  ): Promise<number | undefined> {
    const targetStatus = kind === 'pull' ? 'scratched' : 'withdrawn';
    const attempt = async (version: number | null) =>
      supabase.rpc(WITHDRAW_OWN_ENTRY_RPC, {
        p_entry_id: entryId,
        p_fields: { entry_status: targetStatus },
        p_expected_version: version,
        p_kind: kind,
        p_reason: reason,
      } as never);

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

    if (error) throw this.classifyWithdrawTransportError(error, kind);
    return typeof data === 'number' ? data : undefined;
  }

  /**
   * A fetch that never reached Postgres carries no SQLSTATE. Report that as
   * "you appear to be offline" rather than leaking a transport string into the
   * dialog — a warm cached row reaches the RPC without ever touching the
   * cold-cache path that would otherwise have caught this.
   */
  private classifyWithdrawTransportError(
    error: unknown,
    kind: RemoveFromClassKind = 'withdraw'
  ): unknown {
    const code = (error as { code?: string } | null)?.code;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline || !code) return new WithdrawUnavailableError(kind);
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
   * NEVER INSERTS (MYK9-573). The invariant: this table is SHOW-SCOPED, and an
   * account-scope read treats a non-empty store as complete —
   * `readWithReplicationFallback` falls through to PostgREST only while the
   * local result is empty, and an unscoped `getAll()` returns whatever the store
   * holds. Seeding one row into an otherwise empty replica made
   * /exhibitor/entries report that single row as the user's entire entry list,
   * across reloads, until the row was deleted by hand.
   *
   * BOTH withdrawal-path readers must therefore be non-caching — the Pull
   * affordance's `getWithdrawEligibility` (which runs for every class row when
   * the dialog opens, on the account-level page) and the withdrawal's own
   * `readEntryForWithdrawal`. Otherwise the eligibility check seeds the rows and
   * the gate below sees its own writes.
   *
   * TWO gates, in opposite directions, and BOTH must hold:
   *  - `wasCached`, probed BEFORE the RPC — a row that was absent then is never
   *    written, even if a sync lands mid-call. The ordering matters: probing
   *    afterwards would let exactly that sync re-open the seeding hole.
   *  - a FRESH `get` immediately before each write — a sign-out, scope change or
   *    store clear during the RPC (or its retry) would otherwise let the
   *    read-back INSERT the row straight back.
   *
   * A clean write also lands only while the row is not locally dirty — `setOnce`
   * refuses to overwrite a dirty row with a clean value. Withdrawal itself no
   * longer dirties it, and no other edit path in this dialog dirties a row that
   * is still ELIGIBLE to withdraw; if one is ever added, this write would be
   * skipped and the entry would keep showing its pre-withdrawal status.
   */
  /**
   * Move an entry up a class, as ONE server transaction (MYK9-639/MYK9-640).
   *
   * ONLINE-ONLY and NOT queued through the MutationManager, for exactly the
   * reason `withdrawOwnEntry` above is not, and the reason is worth restating
   * because the obvious alternative has already been tried and failed here:
   *
   *   an optimistic local write cannot be reverted. `setOnce` refuses to
   *   overwrite a locally-DIRTY row with a clean value — the guard that protects
   *   offline scoring — so the revert that would undo a rejected move-up can
   *   never fire, and the source stays `moved` on that device forever while the
   *   dog is really still in its old class. MYK9-535 hit this exact wall and
   *   the conclusion was "the fix is not a better revert: it is not writing
   *   optimistically at all."
   *
   * So the call awaits the server and then stores the CONFIRMED rows clean.
   * That is a real loss — a move-up now needs connectivity, where before it
   * queued — and it is the trade this operation has to make: the previous
   * queued shape is what let a source be marked `moved` with no destination
   * anywhere, which is the worse show-day failure by a wide margin. The RPC is
   * atomic, so the server state is always one or the other, never half.
   *
   * @returns the destination entry id the server committed.
   */
  async moveUpEntryViaRpc(input: {
    sourceEntryId: string;
    targetClassId: string;
    newEntryId: string;
    reason?: string | undefined;
  }): Promise<string> {
    const sourceWasCached = Boolean(await this.get(input.sourceEntryId));

    const { data, error } = await this.callMoveUpRpc(MOVE_UP_ENTRY_RPC, {
      p_entry_id: input.sourceEntryId,
      p_target_class_id: input.targetClassId,
      p_new_entry_id: input.newEntryId,
      p_reason: input.reason ?? null,
    });
    if (error) {
      throw classifyMoveUpRpcError(error, 'That entry could not be moved.');
    }

    const destinationId = data ? data : input.newEntryId;
    await this.hydrateMovedPair([input.sourceEntryId, destinationId], sourceWasCached);
    logger.log(
      `[${this.getTableName()}] Moved entry ${input.sourceEntryId} -> ${destinationId} via ${MOVE_UP_ENTRY_RPC}`
    );
    return destinationId;
  }

  /**
   * Put the dog back in the class they were moved out of — the same shape in
   * reverse, and online-only for the same reason.
   *
   * @returns the restored source entry id.
   */
  async reverseMoveUpEntryViaRpc(destinationEntryId: string): Promise<string> {
    const destinationWasCached = Boolean(await this.get(destinationEntryId));

    const { data, error } = await this.callMoveUpRpc(REVERSE_MOVE_UP_ENTRY_RPC, {
      p_destination_entry_id: destinationEntryId,
    });
    if (error) {
      throw classifyMoveUpRpcError(error, 'That move-up could not be reversed.');
    }

    const sourceId = data ? data : null;

    // Drop the destination from the LOCAL store before the read-back, because
    // the read-back structurally cannot deliver its removal:
    // `view_authenticated_entry_results` admits a soft-deleted row only for its
    // own exhibitor (`deleted_at IS NULL OR is_own_entry`), so for a secretary
    // the row is simply not returned and the stale clean copy would sit here
    // forever — the dog showing live in BOTH classes on the very device that
    // pressed Move back, with no sync able to remove it (this table sets no
    // `shouldCleanupStaleRows`, and an incremental fetch can never emit a row
    // the view hides). `origin/main`'s undo wrote a tombstone through
    // `updateEntry`; the RPC rewrite dropped it and replaced it with a read-back
    // that cannot see the row it needs.
    //
    // A local `delete` rather than a tombstone `set`, because
    // `getEntriesByClass` and `getEntriesByShow` filter nothing — a row left in
    // the store with `deleted_at` set would still be counted by the move-up
    // capacity guard. The server row keeps its tombstone; this store is a cache.
    if (destinationWasCached) {
      try {
        await this.delete(destinationEntryId);
      } catch (tombstoneError) {
        logger.warn(
          `[${this.getTableName()}] Local removal of the reversed move-up entry ${destinationEntryId} failed`,
          tombstoneError
        );
      }
    }

    // The SOURCE only. Asking the read-back to carry the destination's removal
    // was the bug twice over: the view hides a soft-deleted row from a
    // secretary (so nothing came back and the stale copy stayed), and RETURNS
    // it to a manager who owns or handles the dog (so the row this method had
    // just deleted locally went straight back in, live, with its `confirmed`
    // status intact and counting toward the target class's capacity).
    //
    // The destination is gone from this store by design; there is nothing to
    // hydrate. The server keeps its tombstone.
    await this.hydrateMovedPair(sourceId ? [sourceId] : [], destinationWasCached);
    logger.log(
      `[${this.getTableName()}] Reversed move-up ${destinationEntryId} via ${REVERSE_MOVE_UP_ENTRY_RPC}`
    );
    return sourceId ?? destinationEntryId;
  }

  /**
   * `supabase.rpc` with the try/catch the jump-height path documents: an rpc that
   * THROWS (a fetch that never reached Postgres) would otherwise skip SQLSTATE
   * classification and leak a transport string into the dialog.
   *
   * Both functions are in the generated types since migration 20260918193300,
   * so the name and the `Args` are checked against `pg_proc` here — including
   * `move_up_entry`'s `p_reason`, widened to accept NULL in
   * `src/types/database-overrides.ts`. `Returns` is the uuid the server
   * committed; it is `string | null` here because the catch below has no row
   * to report.
   */
  private async callMoveUpRpc<Fn extends MoveUpRpcName>(
    fn: Fn,
    args: MoveUpRpcArgs<Fn>
  ): Promise<{ data: MoveUpRpcReturns<Fn> | null; error: unknown }> {
    try {
      return await supabase.rpc(fn, args);
    } catch (thrown) {
      return { data: null, error: thrown ?? {} };
    }
  }

  /**
   * Refresh both halves of a move from the replication view, CLEAN.
   *
   * One read for the pair, because the server committed them together. The
   * show-scoped rule (MYK9-573) is respected through `anchorWasCached`: if the
   * row this operation started from was not in the replica, this show is not
   * loaded here and writing either row back would make an account-scope read
   * treat them as the user's whole entry list.
   */
  private async hydrateMovedPair(entryIds: string[], anchorWasCached: boolean): Promise<void> {
    if (entryIds.length === 0) return;
    if (!anchorWasCached) {
      logger.log(
        `[${this.getTableName()}] Move-up pair not written back — the show-scoped replica does not hold this show`
      );
      return;
    }

    try {
      const { data, error } = await supabase
        .from('view_authenticated_entry_results_replication')
        .select('*')
        .in('id', entryIds);
      if (error || !data) return;

      for (const raw of data as unknown as EntryRow[]) {
        const row = raw as EntryRow & Record<string, unknown>;
        // Never write a tombstone back into the cache. The view returns
        // soft-deleted rows to whoever OWNS or handles the dog
        // (`deleted_at IS NULL OR is_own_entry`), so a small-club secretary
        // moving their own dog up gets the removed row back — and `set`ting it
        // would undo the local delete this class performs by design, leaving
        // the dog live in two classes and inflating the target's capacity
        // count. `getEntriesByClass` filters nothing.
        if (row.deleted_at) {
          await this.delete(String(row.id));
          continue;
        }
        const serverVersion = row.version as number | undefined;
        this.reportSetResult(
          String(row.id),
          await this.set(String(row.id), rowToEntry(raw), false, undefined, serverVersion, {
            allowColdInsert: 'move-up pair confirmed by the server',
          })
        );
      }
    } catch (readBackError) {
      // The server change is COMMITTED; this is only a cache refresh. The next
      // incremental sync brings the pair in either way.
      logger.warn(`[${this.getTableName()}] Move-up read-back failed`, readBackError);
    }
  }

  private async hydrateConfirmedRow(
    entryId: string,
    wasCached: boolean,
    newVersion?: number,
    // MYK9-632: the status the server just committed. The read-back below is the
    // normal path, but when it fails this is the ONLY thing that keeps a pull
    // from being cached as a withdrawal.
    confirmedStatus: string = 'withdrawn'
  ): Promise<void> {
    if (!wasCached) {
      logger.log(
        `[${this.getTableName()}] Entry ${entryId} was not in the show-scoped replica; ` +
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
        // Re-checked HERE as well as before the RPC: an eviction DURING the
        // call would otherwise let this INSERT the row straight back.
        if (!(await this.get(entryId))) return;
        const row = data as unknown as EntryRow;
        const serverVersion =
          ((row as Record<string, unknown>).version as number | undefined) ?? newVersion;
        this.reportSetResult(
          entryId,
          await this.set(entryId, rowToEntry(row), false, undefined, serverVersion)
        );
        return;
      }
    } catch (readBackError) {
      logger.warn(
        `[${this.getTableName()}] Withdrawal read-back failed for ${entryId}`,
        readBackError
      );
    }

    const cached = await this.get(entryId);
    if (!cached) return;
    try {
      this.reportSetResult(
        entryId,
        await this.set(
          entryId,
          {
            ...cached,
            entryStatus: confirmedStatus,
            entry_status: confirmedStatus,
            status: confirmedStatus,
          },
          false,
          undefined,
          newVersion
        )
      );
    } catch (writeError) {
      // The server change is already COMMITTED; this is only a cache refresh.
      // An eviction between the `get` above and the transaction turns the write
      // into a cold INSERT, which the MYK9-575 guard refuses (loudly in dev) —
      // and refusing is correct here, so swallow it rather than fail a
      // withdrawal that succeeded.
      logger.warn(
        `[${this.getTableName()}] Post-withdrawal cache write skipped for ${entryId}`,
        writeError
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

        this.reportSetResult(entryId, await this.set(entryId, updated, true));
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

    this.reportSetResult(
      entry.id,
      await this.set(entry.id, newEntry, true, undefined, undefined, {
        allowColdInsert: 'local create of a new entry',
      })
    );
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
   * MYK9-561: change the jump height on an entry the caller owns.
   *
   * ONLINE-ONLY and NOT queued through the MutationManager, for the same reason
   * `withdrawOwnEntry` is not: the write is denied by `entries_update` for an
   * exhibitor, so an optimistic local write would display a height the server
   * refused and `setOnce` could never revert a locally-dirty row. The call
   * awaits the server, then patches the CONFIRMED value into the replica.
   *
   * The replica is SHOW-SCOPED (MYK9-573): a row that was not already cached is
   * never written back, so an account-scope read still falls through to
   * PostgREST instead of treating one seeded row as the user's whole entry list.
   */
  async updateOwnEntryJumpHeight(entryId: string, jumpHeight: string): Promise<void> {
    const cached = await this.get(entryId);
    // A cached row's OCC token lives in the replica; a cold row's has to be READ,
    // exactly as `readEntryForWithdrawal` does. The account-scoped
    // /exhibitor/entries surface — the exhibitor's PRIMARY one for this edit —
    // has no show-scoped replica, so without the cold read every save from it
    // would send `p_expected_version: null` (no precondition, last-write-wins):
    // a secretary's concurrent height change would be silently overwritten and
    // the retry-once-on-40001 contract would be unreachable precisely where it
    // is needed.
    const expectedVersion = cached
      ? await this.getServerVersion(entryId)
      : await this.readColdEntryVersion(entryId);
    const version = await this.callUpdateOwnEntryRpc(entryId, jumpHeight, expectedVersion);

    // Re-read at the moment of writing: a sign-out, scope change or store clear
    // during the RPC must not let this INSERT the row back.
    const stillCached = cached ? await this.get(entryId) : null;
    if (stillCached) {
      this.reportSetResult(
        entryId,
        await this.set(entryId, { ...stillCached, jumpHeight }, false, undefined, version)
      );
    }

    logger.log(
      `[${this.getTableName()}] Updated jump height for ${entryId} via ${UPDATE_OWN_ENTRY_JUMP_HEIGHT_RPC}`
    );
  }

  /**
   * The authoritative `version` for a row the show-scoped replica does not hold.
   *
   * Reads `view_authenticated_entry_results`, the same view the withdrawal path
   * reads its cold row from, and NEVER writes to the store (MYK9-573) — seeding
   * one row into an otherwise empty replica makes an account-scope read report
   * that single row as the user's whole entry list.
   *
   * Returns null only when the version is genuinely UNKNOWN: the read failed
   * (offline), the row is gone, or the view returned no `version` column. The
   * RPC treats null as "no precondition", so in those cases the save is
   * last-write-wins — but the two of those that are real (offline, deleted row)
   * are about to fail inside the RPC anyway.
   */
  private async readColdEntryVersion(entryId: string): Promise<number | null> {
    try {
      const { data, error } = await supabase
        .from('view_authenticated_entry_results')
        .select('id, version')
        .eq('id', entryId)
        .maybeSingle();
      if (error || !data) return null;
      const version = (data as unknown as Record<string, unknown>).version;
      return typeof version === 'number' ? version : null;
    } catch {
      return null;
    }
  }

  /**
   * The RPC call itself, with the retry-once-on-40001 contract the server's
   * `detail` payload exists for.
   *
   * Deliberately a SIBLING of `callWithdrawRpc` rather than a shared helper: its
   * argument shape is jsonb, not a scalar column. Typed, not cast (MYK9-611):
   * `src/types/database-overrides.ts` widens `p_expected_version` to
   * `number | null`, because `null` means "no precondition" and is never
   * coalesced to 0, which is a real version.
   */
  private async callUpdateOwnEntryRpc(
    entryId: string,
    jumpHeight: string,
    expectedVersion: number | null
  ): Promise<number | undefined> {
    // The try/catch matters: an `rpc` that THROWS (a fetch that never reached
    // Postgres) would otherwise skip the SQLSTATE classification below and leak
    // a transport string into the dialog. `callWithdrawRpc` has the same gap —
    // it is not shared code, so it is left to MYK9-535's owner rather than
    // edited from here.
    const attempt = async (version: number | null) => {
      try {
        return await supabase.rpc(UPDATE_OWN_ENTRY_JUMP_HEIGHT_RPC, {
          p_entry_id: entryId,
          p_jump_height: jumpHeight,
          p_expected_version: version,
        });
      } catch (thrown) {
        return { data: null, error: (thrown ?? {}) as { code?: string } };
      }
    };

    let { data, error } = await attempt(expectedVersion);

    if (error && (error as { code?: string }).code === '40001') {
      // `Number(null)` and `Number('')` are both 0, which is a perfectly valid
      // version — an EMPTY detail must be rejected BEFORE the conversion, or a
      // conflict with no version retries at version 0 forever.
      const detail = (error as { details?: string | null }).details;
      const serverVersion = detail == null || detail === '' ? Number.NaN : Number(detail);
      if (!Number.isFinite(serverVersion)) throw new JumpHeightConflictError();
      logger.warn(
        `[${this.getTableName()}] Jump-height save for ${entryId} hit a version conflict; retrying at ${serverVersion}`
      );
      ({ data, error } = await attempt(serverVersion));
      if (error && (error as { code?: string }).code === '40001') {
        throw new JumpHeightConflictError();
      }
    }

    if (error) {
      const code = (error as { code?: string } | null)?.code;
      // A fetch that never reached Postgres carries no SQLSTATE — report that as
      // "you appear to be offline" rather than leaking a transport string.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline || !code) throw new JumpHeightUnavailableError();
      if (code === 'P0002') throw new JumpHeightNotFoundError();
      throw error;
    }
    return typeof data === 'number' ? data : undefined;
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

function noop() {}
