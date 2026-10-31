/**
 * ReplicatedArmbandsTable - Offline-first armband data replication for myK9Show
 *
 * Manages armband assignment data with offline support using @myk9/replication.
 *
 * Conflict Resolution:
 * - Server-authoritative: Armbands are assigned via RPC (assign_armband),
 *   so the server is always the source of truth.
 *
 * Sync Strategy:
 * - Incremental on armbands.updated_at (bumped by a BEFORE UPDATE trigger), so a
 *   steady-state pass downloads nothing (MYK9-1300). A release sets
 *   is_available = true, so the delta is NOT filtered on it: those rows are
 *   tombstones that remove the clean local copy and are never cached.
 * - A full sync reads only assigned rows. The remote count (assigned rows) still
 *   detects a hard delete and forces a full sync with stale cleanup (MYK9-775).
 * - One mode only: every sync covers all shows the account can read. The engine's
 *   table-level watermark, ownership stamp and cleanup assume a table syncs in one
 *   mode; per-show passes lifted the watermark the all-shows pass read.
 */

import { POSTGREST_MAX_ROWS } from './postgrestMaxRows';
import {
  ReplicatedTable,
  syncReplicatedTable,
  parseUpdatedAtMs,
  REPLICATION_INCREMENTAL_BUFFER_MS,
  type RowRefetchAdapter,
  type SyncOptions,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';

/**
 * Database row type for armbands table
 */
interface ArmbandRow {
  id: string;
  show_id: string;
  trial_id: string | null;
  dog_id: string | null;
  entry_id: string | null;
  armband_number: string;
  assigned_at: string | null;
  is_available: boolean | null;
  created_at: string | null;
  /** Bumped by the armbands BEFORE UPDATE trigger; the incremental watermark. */
  updated_at: string;
  /** Server OCC version; a tombstone older than the local copy must not delete it. */
  version: number;
}

/**
 * App-level Armband type with camelCase fields and sync metadata
 */
export interface ReplicatedArmband {
  id: string;
  showId: string;
  trialId?: string | undefined;
  dogId?: string | undefined;
  entryId?: string | undefined;
  armbandNumber: string;
  assignedAt?: string | undefined;
  isAvailable?: boolean | undefined;
  createdAt?: string | undefined;
  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

export interface AssignedArmbandInput {
  showId: string;
  dogId: string;
  armbandNumber: string;
  dependsOn?: string[] | undefined;
}

/**
 * Convert database row to app Armband type
 */
export function rowToArmband(row: ArmbandRow): ReplicatedArmband {
  return {
    id: String(row.id),
    showId: String(row.show_id),
    trialId: row.trial_id ? String(row.trial_id) : undefined,
    dogId: row.dog_id ? String(row.dog_id) : undefined,
    entryId: row.entry_id ? String(row.entry_id) : undefined,
    armbandNumber: String(row.armband_number),
    assignedAt: row.assigned_at ?? undefined,
    isAvailable: row.is_available ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
}

export class ReplicatedArmbandsTable extends ReplicatedTable<ReplicatedArmband> {
  /** Rows are kept per signed-in account: another account's cache is invisible (MYK9-1133). */
  override usesAccountOwnedRows(): boolean {
    return true;
  }

  constructor() {
    super('armbands', { logger });
  }

  private toSupabaseRow(armband: ReplicatedArmband): Record<string, unknown> {
    return {
      id: armband.id,
      show_id: armband.showId,
      dog_id: armband.dogId ?? null,
      armband_number: armband.armbandNumber,
      assigned_at: armband.assignedAt ?? null,
      is_available: armband.isAvailable ?? false,
    };
  }

  protected override rebuildUpdatePayload(armband: ReplicatedArmband): Record<string, unknown> {
    return this.toSupabaseRow(armband);
  }

  private createLocalId(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }

    return `armband-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private shouldRefreshBeforeInsert(): boolean {
    return typeof globalThis.navigator !== 'undefined' && globalThis.navigator.onLine !== false;
  }

  private async refreshBeforeInsert(showId: string): Promise<ReplicatedArmband[]> {
    const result = await this.sync();
    if (!result.success) {
      throw new Error(result.error ?? `Unable to refresh armbands for show ${showId}`);
    }

    return this.getByShow(showId);
  }

  /**
   * Reads rows by id the way `sync` does, so a full-row UPDATE rejected for a
   * stale OCC token can re-fetch its row and rebase or surface (MYK9-771).
   */
  protected override getRowRefetchAdapter(): RowRefetchAdapter<ArmbandRow, ReplicatedArmband> {
    return {
      fetchRowsById: async ids => {
        const { data, error } = await supabase
          .from('armbands')
          .select('*')
          .eq('is_available', false)
          .in('id', ids);
        if (error) throw new Error(`Supabase query failed: ${error.message}`);
        return (data ?? []) as unknown as ArmbandRow[];
      },
      getRemoteId: remote => String(remote.id),
      toLocalRow: rowToArmband,
      rebuildUpdatePayload: armband => this.toSupabaseRow(armband),
    };
  }

  /**
   * Sync every show's armbands from Supabase on `updated_at`. An incremental
   * pass reads every changed row, assigned or released; a full sync reads only
   * assigned rows, so cleanup removes whatever was released.
   *
   * The scope argument is ignored: armbands always sync every show.
   */
  async sync(_syncScopeId?: string, options?: Partial<SyncOptions>): Promise<SyncResult> {
    return this.runSync(options?.forceFullSync === true, options?.signal);
  }

  private async runSync(forceFullSync: boolean, signal?: AbortSignal): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    // Rows a multi-page full sync read after its first page. The full read skips
    // released rows, so a release committed during paging would otherwise sit
    // below a watermark lifted by a later page and never reach a delta.
    const unwatermarkedIds = new Set<string>();

    const adapter: SyncReplicatedTableAdapter<ArmbandRow, ReplicatedArmband> = {
      ...this.getRowRefetchAdapter(),
      // Coverage and getRemoteRowCount count assigned rows only.
      countsTowardRemoteCoverage: remote => remote.is_available === false,
      // No remotePageSize: the fetch below pages to completion, so a full page
      // never means a truncated answer.
      fetchRemoteRows: async ({ since, forceFullSync }) => {
        unwatermarkedIds.clear();
        // Paged by keyset on (updated_at, id), as judge assignments are: every
        // show's armbands can pass PostgREST's max_rows, and stale cleanup only
        // runs after a fetch that returned the whole server count (MYK9-775).
        const rows: ArmbandRow[] = [];
        let cursorUpdatedAt: string | null = null;
        let cursorId: string | null = null;
        for (;;) {
          let query = supabase.from('armbands').select('*');
          if (forceFullSync) query = query.eq('is_available', false);
          if (cursorUpdatedAt && cursorId) {
            query = query.or(
              `updated_at.gt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.gt.${cursorId})`
            );
          } else if (!forceFullSync) {
            query = query.gt('updated_at', new Date(since).toISOString());
          }
          const { data, error } = await query
            .order('updated_at', { ascending: true })
            .order('id', { ascending: true })
            .range(0, POSTGREST_MAX_ROWS - 1);

          if (error) {
            throw new Error(`Supabase query failed: ${error.message}`);
          }

          const page = (data ?? []) as unknown as ArmbandRow[];
          if (forceFullSync && cursorId) {
            for (const row of page) unwatermarkedIds.add(String(row.id));
          }
          rows.push(...page);
          const last = page[page.length - 1];
          if (page.length < POSTGREST_MAX_ROWS || !last?.updated_at || !last.id) break;
          cursorUpdatedAt = String(last.updated_at);
          cursorId = String(last.id);
        }

        // A row changed while the loop ran shows up again on a later page: keep
        // only its newest copy, or an earlier "assigned" copy would be cached
        // over the release that followed it.
        const newest = new Map<string, ArmbandRow>();
        for (const row of rows) newest.set(String(row.id), row);
        const latest = [...newest.values()];

        // A release is positive server evidence: remove the clean local copy.
        // The atomic engine helper keeps rows with unsent work or a newer server
        // version, so a local assignment is never deleted here.
        const tombstones = latest.filter(row => row.is_available !== false);
        await this.deleteRowsIfClean(
          tombstones.map(row => String(row.id)),
          new Map(
            tombstones
              .filter(row => typeof row.version === 'number')
              .map(row => [String(row.id), row.version])
          )
        );
        return latest;
      },
      // A released row is never cached, and never reconciled against a local
      // copy with unsent work: the full read never returned released rows, so
      // such a copy keeps the behaviour it had before the delta (MYK9-1300).
      shouldSkipRemoteRow: remote => remote.is_available !== false,
      getRemoteUpdatedAt: remote =>
        unwatermarkedIds.has(String(remote.id)) ? null : parseUpdatedAtMs(remote.updated_at),
      resolveConflict: (_local, remote) => remote,
      getRemoteRowCount: async () => {
        try {
          const { count, error } = await supabase
            .from('armbands')
            .select('id', { count: 'exact', head: true })
            .eq('is_available', false);
          return error ? undefined : (count ?? undefined);
        } catch {
          return undefined;
        }
      },
      // A count below the local rows proves a hard delete (MYK9-775); the full
      // sync it forces cleans up. A zero-row answer over a warm replica is not
      // proof (MYK9-880): when an account's LAST visible armband is hard-deleted,
      // its copy stays until a later full sync returns at least one row.
      cleanupStaleRowsOnFullSync: true,
    };

    const result = await syncReplicatedTable(
      this,
      adapter,
      {},
      {
        forceFullSync,
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
        ...(signal ? { signal } : {}),
      }
    );

    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }

    return result;
  }

  /**
   * Conflict resolution: Server-authoritative
   * Armbands are assigned via RPC, server always wins.
   */
  protected resolveConflict(
    _local: ReplicatedArmband,
    remote: ReplicatedArmband
  ): ReplicatedArmband {
    return remote;
  }

  /**
   * Get all armbands for a specific show, through the show index (MYK9-792)
   */
  async getByShow(showId: string): Promise<ReplicatedArmband[]> {
    return this.getByShowOrThrow(showId);
  }

  /**
   * Get all armbands for a specific dog
   */
  async getByDog(dogId: string): Promise<ReplicatedArmband[]> {
    const all = await this.getAllOrThrow();
    return all.filter(a => a.dogId === dogId);
  }

  /**
   * Look up an armband by number within a show
   */
  async lookupByArmbandNumber(
    showId: string,
    armbandNumber: string
  ): Promise<ReplicatedArmband | null> {
    const showArmbands = await this.getByShow(showId);
    return showArmbands.find(a => a.armbandNumber === armbandNumber) ?? null;
  }

  async upsertAssignedArmband(input: AssignedArmbandInput): Promise<string | null> {
    let showArmbands = await this.getByShow(input.showId);
    const duplicateNumber = showArmbands.find(
      a => a.armbandNumber === input.armbandNumber && a.dogId !== input.dogId
    );
    if (duplicateNumber) {
      throw new Error(
        `Armband ${input.armbandNumber} is already assigned to another dog in this show.`
      );
    }

    let existing = showArmbands.find(a => a.dogId === input.dogId);
    if (!existing && this.shouldRefreshBeforeInsert()) {
      showArmbands = await this.refreshBeforeInsert(input.showId);
      const refreshedDuplicateNumber = showArmbands.find(
        a => a.armbandNumber === input.armbandNumber && a.dogId !== input.dogId
      );
      if (refreshedDuplicateNumber) {
        throw new Error(
          `Armband ${input.armbandNumber} is already assigned to another dog in this show.`
        );
      }
      existing = showArmbands.find(a => a.dogId === input.dogId);
    }

    const assignedAt = new Date().toISOString();
    const id = existing?.id ?? this.createLocalId();
    const updated: ReplicatedArmband = {
      ...existing,
      id,
      showId: input.showId,
      dogId: input.dogId,
      armbandNumber: input.armbandNumber,
      assignedAt,
      isAvailable: false,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      ...(existing ? {} : { _localOnly: true }),
    };

    const { mutationId } = await this.writeAndQueue(id, updated, {
      operation: existing ? 'UPDATE' : 'INSERT',
      payload: this.toSupabaseRow(updated),
      dependsOn: input.dependsOn,
    });
    return mutationId;
  }
}

// Singleton export
export const replicatedArmbandsTable = new ReplicatedArmbandsTable();
