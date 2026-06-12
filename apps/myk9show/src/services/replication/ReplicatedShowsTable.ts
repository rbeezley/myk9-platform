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
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import type { ShowExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import type { Database } from '@/types/supabase';

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
  venueName?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  status?: string | undefined;
  entryOpenDate?: string | undefined;
  entryCloseDate?: string | undefined;
  preEntryFee?: number | undefined;
  dayOfShowFee?: number | undefined;
  clubId?: string | undefined;
  maxEntriesPerDog?: number | undefined;
  maxTotalEntries?: number | undefined;
  allowsNonOwnerHandlers?: boolean | undefined;
  acceptCheckPayments?: boolean | undefined;
  acceptCashPayments?: boolean | undefined;
  logoUrl?: string | undefined;
  coverImageUrl?: string | undefined;
  accentColor?: string | undefined;
  style?: string | undefined;
  experienceIsPublished?: boolean | undefined;
  experiencePublishedAt?: string | null | undefined;
  experiencePublishedStyle?: string | null | undefined;
  experiencePublishedContent?: ShowExperienceSnapshot | null | undefined;
  /** `shows.unified_ringside_enabled` (Phase 1e) — gates the `/at-show` surface. */
  unifiedRingsideEnabled?: boolean | undefined;
  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

/**
 * Convert database row to app Show type
 */
function rowToShow(row: ShowRow): ReplicatedShow {
  const publishedFields = row as Record<string, unknown>;

  return {
    id: String(row.id),
    name: row.name,
    organization: row.organization,
    startDate: row.start_date,
    endDate: row.end_date,
    location: row.location ?? undefined,
    venueName: row.venue_name ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    status: row.status ?? undefined,
    entryOpenDate: row.entry_open_date ?? undefined,
    entryCloseDate: row.entry_close_date ?? undefined,
    preEntryFee: row.pre_entry_fee ?? undefined,
    dayOfShowFee: row.day_of_show_fee ?? undefined,
    clubId: row.club_id ?? undefined,
    maxEntriesPerDog: row.max_entries_per_dog ?? undefined,
    maxTotalEntries: row.max_total_entries ?? undefined,
    allowsNonOwnerHandlers: row.allow_non_owner_handlers ?? undefined,
    acceptCheckPayments: row.accept_check_payments ?? undefined,
    acceptCashPayments: row.accept_cash_payments ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    accentColor: row.accent_color ?? undefined,
    style: ((row as Record<string, unknown>).style as string | undefined) ?? undefined,
    experienceIsPublished:
      (publishedFields.experience_is_published as boolean | null | undefined) ?? undefined,
    experiencePublishedAt:
      (publishedFields.experience_published_at as string | null | undefined) ?? null,
    experiencePublishedStyle:
      (publishedFields.experience_published_style as string | null | undefined) ?? null,
    experiencePublishedContent:
      (publishedFields.experience_published_content as ShowExperienceSnapshot | null | undefined) ??
      null,
    unifiedRingsideEnabled:
      (publishedFields.unified_ringside_enabled as boolean | null | undefined) ?? undefined,
  };
}

export class ReplicatedShowsTable extends ReplicatedTable<ReplicatedShow> {
  /** Most recent mutation ID from a create/update operation */
  private _lastMutationId: string | null = null;

  constructor() {
    super('shows', undefined, { logger });
  }

  /** Get the mutation ID from the last create/update operation */
  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  /** Map UI show status to DB CHECK constraint values */
  private mapShowStatusToDb(uiStatus: string | undefined): string {
    switch (uiStatus) {
      case 'published':
        return 'published';
      case 'accepting_entries':
        return 'accepting_entries';
      case 'closed':
        return 'closed';
      case 'in_progress':
      case 'In Progress':
        return 'in_progress';
      case 'completed':
      case 'Completed':
        return 'completed';
      case 'cancelled':
      case 'Cancelled':
        return 'cancelled';
      case 'unpublished':
      case 'draft':
      default:
        return 'draft';
    }
  }

  /**
   * Convert app-level Show to Supabase row format (snake_case).
   * Strips sync metadata fields (_version, _lastModified, etc.)
   */
  private toSupabaseRow(show: ReplicatedShow): Record<string, unknown> {
    return {
      id: show.id,
      name: show.name,
      organization: show.organization,
      start_date: show.startDate,
      end_date: show.endDate,
      location: show.location ?? null,
      status: this.mapShowStatusToDb(show.status),
      entry_open_date: show.entryOpenDate || null,
      entry_close_date: show.entryCloseDate || null,
      pre_entry_fee: show.preEntryFee ?? null,
      day_of_show_fee: show.dayOfShowFee ?? null,
      club_id: show.clubId ?? null,
      max_entries_per_dog: show.maxEntriesPerDog ?? null,
      max_total_entries: show.maxTotalEntries ?? null,
      allow_non_owner_handlers: show.allowsNonOwnerHandlers ?? null,
      accept_check_payments: show.acceptCheckPayments ?? null,
      accept_cash_payments: show.acceptCashPayments ?? null,
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
   * Sync shows from Supabase
   */
  async sync(licenseKey: string): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<ShowRow, ReplicatedShow> = {
      fetchRemoteRows: async ({ scope, since }) => {
        let query = supabase
          .from('shows')
          .select('*')
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
      getRemoteId: remote => String(remote.id),
      getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
      toLocalRow: rowToShow,
      filterLocalRows: (rows, scope) =>
        scope.value ? rows.filter(r => r.clubId === scope.value) : rows,
      resolveConflict: (_local, remote) => remote,
    };

    const result = await syncReplicatedTable(this, adapter, { value: licenseKey }, {
      incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
    });

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
    const allShows = await this.getAll();
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
    const allShows = await this.getAll();
    return allShows
      .filter(show => show.clubId === clubId)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  /**
   * Get upcoming shows
   */
  async getUpcomingShows(): Promise<ReplicatedShow[]> {
    const allShows = await this.getAll();
    const now = Date.now();

    return allShows
      .filter(show => new Date(show.startDate).getTime() >= now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  /**
   * Get active shows (currently ongoing)
   */
  async getActiveShows(): Promise<ReplicatedShow[]> {
    const allShows = await this.getAll();
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

    const updatedShow: ReplicatedShow = {
      ...currentShow,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(showId, updatedShow, true); // Mark as dirty
    const updatePayload = this.toSupabaseRow(updatedShow);
    if (!('experienceIsPublished' in updates)) delete updatePayload.experience_is_published;
    if (!('experiencePublishedAt' in updates)) delete updatePayload.experience_published_at;
    if (!('experiencePublishedStyle' in updates)) delete updatePayload.experience_published_style;
    if (!('experiencePublishedContent' in updates)) delete updatePayload.experience_published_content;

    const mutationId = await this.queueMutation('UPDATE', showId, updatePayload);
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated show ${showId}`);
    return mutationId;
  }

  /**
   * Create a new show locally (queued for sync)
   * The mutation ID is available via `lastMutationId` for dependency tracking.
   */
  async createShow(show: Omit<ReplicatedShow, 'id'>): Promise<ReplicatedShow> {
    const id = crypto.randomUUID();
    const newShow: ReplicatedShow = {
      ...show,
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
