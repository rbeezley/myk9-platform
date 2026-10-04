/**
 * ReplicatedShowsTable - Offline-first show data replication for myK9Show
 *
 * Manages show/event containers with offline support using @myk9/replication.
 *
 * Conflict Resolution:
 * - Server-authoritative: Show configuration comes from server
 * - Local edits queue as mutations for later sync
 */

import {
  ReplicatedTable,
  syncReplicatedTable,
  parseUpdatedAtMs,
  REPLICATION_INCREMENTAL_BUFFER_MS,
  type MutationManager,
  type RowRefetchAdapter,
  type SyncReplicatedTableAdapter,
  type SyncOptions,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getLiveShowCount } from './liveShowCount';
import { verifyShowsGone } from './showScopeProof';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import type { ShowExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import { invalidateVenuePinIfLocationChanged } from '@/features/maps/invalidateVenuePin';
import type { Database } from '@/types/supabase';
import { withStoredDays, withTypedDays } from './showCalendarDays';
import { rowToShow } from './showRowMapping';
import { mapShowStatusToDb } from './showStatusMapping';

/**
 * Database row type from Supabase schema
 */
type ShowRow = Database['public']['Tables']['shows']['Row'];

/**
 * App-level Show type with camelCase fields and sync metadata
 */
export interface ReplicatedShow {
  id: string;
  name: string;
  organization: string;
  startDate: string;
  endDate: string;
  location?: string | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  venueName?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  status?: string | undefined;
  deletedAt?: string | null | undefined;
  entryOpenDate?: string | undefined;
  entryCloseDate?: string | undefined;
  preEntryFee?: number | undefined;
  dayOfShowFee?: number | undefined;
  juniorHandlerFee?: number | null | undefined;
  startingArmbandNumber?: number | undefined;
  clubId?: string | undefined;
  maxEntriesPerDog?: number | undefined;
  maxTotalEntries?: number | undefined;
  defaultJudgeDayCapacity?: number | undefined;
  allowsNonOwnerHandlers?: boolean | undefined;
  isNationals?: boolean | undefined;
  acceptCheckPayments?: boolean | undefined;
  acceptCashPayments?: boolean | undefined;
  onlineEntriesEnabled?: boolean | undefined;
  /** shows.version as last read from the server (read-only; never written). */
  serverVersion?: number | undefined;
  logoUrl?: string | undefined;
  coverImageUrl?: string | undefined;
  accentColor?: string | undefined;
  style?: string | undefined;
  experienceIsPublished?: boolean | undefined;
  experiencePublishedAt?: string | null | undefined;
  experiencePublishedStyle?: string | null | undefined;
  experiencePublishedContent?: ShowExperienceSnapshot | null | undefined;
  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

export { rowToShow };

export class ReplicatedShowsTable extends ReplicatedTable<ReplicatedShow> {
  /** Most recent mutation ID from a create/update operation */
  private _lastMutationId: string | null = null;

  private showMutationManager: MutationManager | null = null;

  constructor() {
    super('shows', { logger });
  }

  override setMutationManager(manager: MutationManager): void {
    super.setMutationManager(manager);
    this.showMutationManager = manager;
  }

  /** Get the mutation ID from the last create/update operation */
  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  /**
   * Convert app-level Show to Supabase row format (snake_case).
   * Strips sync metadata fields (_version, _lastModified, etc.)
   */
  private toSupabaseRow(rawShow: ReplicatedShow): Record<string, unknown> {
    // Every date here is already a calendar day or a stored value: typed
    // dates were normalized when they entered the row (updateShow/createShow).
    const show = withStoredDays(rawShow);
    return {
      id: show.id,
      name: show.name,
      organization: show.organization,
      start_date: show.startDate,
      end_date: show.endDate,
      location: show.location ?? null,
      latitude: show.latitude ?? null,
      longitude: show.longitude ?? null,
      status: mapShowStatusToDb(show.status),
      entry_open_date: show.entryOpenDate || null,
      entry_close_date: show.entryCloseDate || null,
      pre_entry_fee: show.preEntryFee ?? null,
      day_of_show_fee: show.dayOfShowFee ?? null,
      ...(show.juniorHandlerFee !== undefined ? { junior_handler_fee: show.juniorHandlerFee } : {}),
      starting_armband_number: show.startingArmbandNumber ?? 100,
      club_id: show.clubId ?? null,
      max_entries_per_dog: show.maxEntriesPerDog ?? null,
      max_total_entries: show.maxTotalEntries ?? null,
      allow_non_owner_handlers: show.allowsNonOwnerHandlers ?? null,
      is_nationals: show.isNationals ?? null,
      accept_check_payments: show.acceptCheckPayments ?? null,
      accept_cash_payments: show.acceptCashPayments ?? null,
      // NOT NULL column: never send null; omitted, the row keeps its value.
      ...(show.onlineEntriesEnabled !== undefined
        ? { online_entries_enabled: show.onlineEntriesEnabled }
        : {}),
      logo_url: show.logoUrl ?? null,
      cover_image_url: show.coverImageUrl ?? null,
      accent_color: show.accentColor ?? null,
      style: show.style ?? null,
      experience_is_published: show.experienceIsPublished ?? false,
      experience_published_at: show.experiencePublishedAt ?? null,
      experience_published_style: show.experiencePublishedStyle ?? null,
      experience_published_content: show.experiencePublishedContent ?? {},
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Conflict rebuilds replay a local row over the server's, so they must omit
   * the RPC-owned publication fields exactly as updateShow does: the local
   * copy may predate a publish from another device, and
   * guard_premium_publication_state rejects any non-RPC change to them
   * (MYK9-694), which would leave the edit unable to sync.
   */
  protected override rebuildUpdatePayload(show: ReplicatedShow): Record<string, unknown> {
    // A status the CHECK would reject must not abort the sync loop or become
    // 'draft': omit it so the UPDATE leaves the server's value alone (MYK9-983).
    let statusKnown = true;
    try {
      mapShowStatusToDb(show.status);
    } catch (error) {
      statusKnown = false;
      logger.error(`[${this.getTableName()}] Omitting status from rebuilt payload`, error);
    }
    const payload = this.toSupabaseRow(statusKnown ? show : { ...show, status: undefined });
    if (!statusKnown) delete payload.status;
    delete payload.experience_is_published;
    delete payload.experience_published_at;
    delete payload.experience_published_style;
    delete payload.experience_published_content;
    // MYK9-979: RPC-owned (set_show_online_entries). A rebuilt full row must
    // never carry a cached copy of it back over the server's value.
    delete payload.online_entries_enabled;
    return payload;
  }

  /**
   * Sync shows from Supabase
   */
  /**
   * Reads rows by id the way `sync` does, so a full-row UPDATE rejected for a
   * stale OCC token can re-fetch its row and rebase or surface (MYK9-771).
   */
  protected override getRowRefetchAdapter(): RowRefetchAdapter<ShowRow, ReplicatedShow> {
    return {
      fetchRowsById: async ids => {
        const { data, error } = await supabase
          .from('shows')
          .select('*')
          .is('deleted_at', null)
          .in('id', ids);
        if (error) throw new Error(`Supabase query failed: ${error.message}`);
        return (data ?? []) as unknown as ShowRow[];
      },
      getRemoteId: remote => String(remote.id),
      toLocalRow: rowToShow,
      rebuildUpdatePayload: show => this.rebuildUpdatePayload(show),
    };
  }

  async sync(syncScopeId: string, options?: Partial<SyncOptions>): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<ShowRow, ReplicatedShow> = {
      ...this.getRowRefetchAdapter(),
      getRemoteRowCount: ({ scope }) => getLiveShowCount(scope.value),
      // A soft-deleted show is filtered out of every fetch, so it is never
      // overwritten or removed here. Once a full fetch proves complete against
      // the count above, rows the server no longer returns leave the replica.
      cleanupStaleRowsOnFullSync: true,
      // The last show of a scope deleted elsewhere reads 0 of 0, the same as an
      // RLS gap (MYK9-880). Only a per-id server answer that none of the shows
      // this device holds still exists lets the replica clear (MYK9-913).
      verifyScopeEmpty: async ({ scope }) => {
        const held = (await this.getAllOrThrow()).filter(
          row => (row as { _localOnly?: unknown })._localOnly !== true
        );
        const inScope = scope.value ? held.filter(row => row.clubId === scope.value) : held;
        return verifyShowsGone(inScope.map(row => row.id));
      },
      fetchRemoteRows: async ({ scope, since }) => {
        let query = supabase
          .from('shows')
          // Explicit, not inherited. Soft-deleted shows were kept out of the
          // replica only because shows_select hid them from everyone; MYK9-233
          // lifted the site-admin arm out of that gate, so an admin's device
          // would otherwise start syncing deleted shows into IndexedDB and
          // every offline surface reading the replica would show them. A
          // deleted show has no show-day use, so the replica stays live-only
          // for every role. Behaviour is unchanged — the invariant is just
          // stated here now instead of being an accident of the policy.
          .select('*')
          .is('deleted_at', null)
          .gt('updated_at', new Date(since).toISOString())
          .order('updated_at', { ascending: true });

        if (scope.value) {
          query = query.eq('club_id', scope.value);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Supabase query failed: ${error.message}`);
        }

        return (data ?? []) as unknown as ShowRow[];
      },
      getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
      filterLocalRows: (rows, scope) =>
        scope.value ? rows.filter(r => r.clubId === scope.value) : rows,
      resolveConflict: (_local, remote) => remote,
    };

    const result = await syncReplicatedTable(
      this,
      adapter,
      { value: syncScopeId },
      {
        forceFullSync: options?.forceFullSync === true,
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
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
   * Show configuration always comes from server
   */
  protected resolveConflict(_local: ReplicatedShow, remote: ReplicatedShow): ReplicatedShow {
    return remote;
  }

  /**
   * Get all shows sorted by start date
   */
  async getAllShows(): Promise<ReplicatedShow[]> {
    const allShows = await this.getAllOrThrow();
    return allShows.sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
  }

  /**
   * Get show by ID
   */
  async getShowById(showId: string): Promise<ReplicatedShow | null> {
    return this.get(showId);
  }

  /**
   * Get shows by club
   */
  async getShowsByClub(clubId: string): Promise<ReplicatedShow[]> {
    const allShows = await this.getAllOrThrow();
    return allShows
      .filter(show => show.clubId === clubId)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  /**
   * Get upcoming shows
   */
  async getUpcomingShows(): Promise<ReplicatedShow[]> {
    const allShows = await this.getAllOrThrow();
    const now = Date.now();

    return allShows
      .filter(show => new Date(show.startDate).getTime() >= now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  /**
   * Get active shows (currently ongoing)
   */
  async getActiveShows(): Promise<ReplicatedShow[]> {
    const allShows = await this.getAllOrThrow();
    const now = Date.now();

    return allShows
      .filter(show => {
        const start = new Date(show.startDate).getTime();
        const end = new Date(show.endDate).getTime();
        return start <= now && end >= now;
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  /**
   * Update show (marks as dirty for later sync)
   * @returns mutation ID if queued, null if no MutationManager
   */
  async updateShow(showId: string, updates: Partial<ReplicatedShow>): Promise<string | null> {
    const currentShow = await this.get(showId);
    if (!currentShow) {
      throw new Error(`Show ${showId} not found`);
    }

    const safeUpdates = { ...updates };
    delete safeUpdates.experienceIsPublished;
    delete safeUpdates.experiencePublishedAt;
    delete safeUpdates.experiencePublishedStyle;
    delete safeUpdates.experiencePublishedContent;
    // MYK9-979: online entries change only through set_show_online_entries
    // (an online RPC), never through a generic show write, local or queued.
    delete safeUpdates.onlineEntriesEnabled;
    const resolvedUpdates = invalidateVenuePinIfLocationChanged(currentShow.location, safeUpdates);
    // Style is an RPC-owned field. Never let a stale generic Show edit carry it
    // back to Supabase or overwrite a newer Preview save.
    delete resolvedUpdates.style;
    const updatedShow: ReplicatedShow = {
      ...currentShow,
      ...withTypedDays(resolvedUpdates, currentShow),
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(showId, updatedShow, true); // Mark as dirty
    const updatePayload = this.toSupabaseRow(updatedShow);
    // Style is owned exclusively by update_show_style. Omitting it from the
    // generic payload prevents a stale row from clobbering a concurrent style
    // mutation, even when the local row already contains a style value.
    delete updatePayload.style;
    if (!('experienceIsPublished' in resolvedUpdates)) delete updatePayload.experience_is_published;
    if (!('experiencePublishedAt' in resolvedUpdates)) delete updatePayload.experience_published_at;
    if (!('experiencePublishedStyle' in resolvedUpdates))
      delete updatePayload.experience_published_style;
    if (!('experiencePublishedContent' in resolvedUpdates))
      delete updatePayload.experience_published_content;
    // Same stale-replica clobber guard: a client whose cached show predates the
    // coordinate columns would otherwise null out a pin saved elsewhere.
    if (!('latitude' in resolvedUpdates)) delete updatePayload.latitude;
    if (!('longitude' in resolvedUpdates)) delete updatePayload.longitude;
    delete updatePayload.online_entries_enabled; // MYK9-979: RPC-owned, see above.

    const mutationId = await this.queueMutation('UPDATE', showId, updatePayload);
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated show ${showId}`);
    return mutationId;
  }

  /**
   * True while this show has work the server has not confirmed: created here
   * (`_localOnly`) or any mutation still queued for it, which may be mid-upload
   * or committed with the response lost. A server delete then cannot tell
   * "not found" from "not uploaded yet", so callers must wait. Reads only;
   * never touches the queue. Throws if the queue cannot be read.
   */
  async hasUnsyncedWork(showId: string): Promise<boolean> {
    const row = await this.get(showId);
    if ((row as { _localOnly?: boolean } | null)?._localOnly === true) return true;
    const manager = this.showMutationManager;
    if (!manager) return false;
    const pending = await manager.getPendingMutationsForRow(this.getTableName(), showId);
    return pending.length > 0;
  }

  /**
   * Create a new show locally (queued for sync)
   * The mutation ID is available via `lastMutationId` for dependency tracking.
   */
  async createShow(show: Omit<ReplicatedShow, 'id'>): Promise<ReplicatedShow> {
    const id = crypto.randomUUID();
    const newShow: ReplicatedShow = {
      ...withTypedDays(show),
      id,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(id, newShow, true); // Mark as dirty
    const mutationId = await this.queueMutation('INSERT', id, this.toSupabaseRow(newShow));
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Created new show ${id}`);
    return newShow;
  }
}

// Singleton export
export const replicatedShowsTable = new ReplicatedShowsTable();
