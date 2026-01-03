/**
 * ReplicatedShowsTable - Offline-first show data replication
 *
 * Manages show/event containers with offline support.
 *
 * Conflict Resolution:
 * - Server-authoritative: All show configuration comes from server
 * - Use case: Show secretaries modify shows, no client conflicts
 *
 * **Phase 3 Day 13** - Core table migration
 */

import { ReplicatedTable } from '../ReplicatedTable';
import type { SyncResult } from '../types';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

export interface Show {
  id: string;
  license_key: string;
  show_name: string;
  club_name: string;
  start_date: string;
  end_date: string;
  organization: string;
  show_type?: string;
  show_status?: string;

  // Site/Location info
  site_name?: string;
  site_address?: string;
  site_city?: string;
  site_state?: string;
  site_zip?: string;
  location?: string; // Legacy field

  // Trial Secretary
  secretary_name?: string;
  secretary_email?: string;
  secretary_phone?: string;
  // Legacy field names (for backward compatibility)
  show_secretary_name?: string;
  show_secretary_email?: string;
  show_secretary_phone?: string;

  // Chairman
  chairman_name?: string;
  chairman_email?: string;
  chairman_phone?: string;

  // URLs
  website?: string;
  event_url?: string;
  logo_url?: string;

  // Other
  notes?: string;
  app_version?: string;
  self_checkin_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

export class ReplicatedShowsTable extends ReplicatedTable<Show> {
  constructor() {
    super('shows'); // TTL managed by feature flags
  }

  /**
   * Sync shows from Supabase
   */
  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      // Get last sync timestamp
      const metadata = await this.getSyncMetadata();

      // Check if cache is empty - if so, force full sync from epoch
      const allCachedShows = await this.getAll();
      const isCacheEmpty = allCachedShows.length === 0;

      // If cache is empty but we have a lastSync timestamp, it means the cache was cleared
      // Reset to epoch (0) to fetch all data
      const lastSync = isCacheEmpty ? 0 : (metadata?.lastIncrementalSyncAt || 0);

      logger.log(
        `[${this.tableName}] Starting ${isCacheEmpty ? 'FULL (empty cache)' : 'incremental'} sync (since ${new Date(lastSync).toISOString()}), cache: ${allCachedShows.length} shows`
      );

      // Fetch shows updated since last sync
      const { data: remoteShows, error } = await supabase
        .from('shows')
        .select('*')
        .eq('license_key', licenseKey)
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      if (error) {
        errors.push(error.message);
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteShows || remoteShows.length === 0) {
        logger.log(`[${this.tableName}] No updates found`);

        await this.updateSyncMetadata({
          lastIncrementalSyncAt: Date.now(),
          syncStatus: 'idle',
          errorMessage: undefined,
        });

        return {
          tableName: this.tableName,
          success: true,
          operation: 'incremental-sync',
          rowsAffected: 0,
          conflictsResolved: 0,
          duration: Date.now() - startTime,
        };
      }

      // Process each show
      for (const remoteShow of remoteShows) {
        // Convert ID to string for consistent IndexedDB key format (bigserial returns as number)
        const showId = String(remoteShow.id);
        const localShow = await this.get(showId);

        if (localShow) {
          // Conflict resolution: server always wins for show config
          const resolved = this.resolveConflict(localShow, remoteShow);
          await this.set(showId, resolved);
          conflictsResolved++;
        } else {
          // New show
          await this.set(showId, remoteShow);
        }

        rowsSynced++;
      }

      // Update sync metadata
      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
        errorMessage: undefined,
        conflictCount: (metadata?.conflictCount || 0) + conflictsResolved,
      });

      const duration = Date.now() - startTime;
      logger.log(
        `[${this.tableName}] Sync complete: ${rowsSynced} rows, ${conflictsResolved} conflicts, ${duration}ms`
      );

      return {
        tableName: this.tableName,
        success: true,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      // Update sync metadata with error
      await this.updateSyncMetadata({
        syncStatus: 'error',
        errorMessage,
      });

      logger.error(`[${this.tableName}] Sync failed:`, error);

      return {
        tableName: this.tableName,
        success: false,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Conflict resolution: Server-authoritative
   * Show configuration always comes from server
   */
  protected resolveConflict(_local: Show, remote: Show): Show {
    // Server always wins for show configuration
    // Show secretaries modify on server, no client conflicts
    return remote;
  }

  /**
   * Get all shows
   */
  async getAllShows(): Promise<Show[]> {
    const allShows = await this.getAll();
    return allShows.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }

  /**
   * Get a single show by ID
   */
  async getShowById(showId: string): Promise<Show | null> {
    const show = await this.get(showId);
    return show || null;
  }

  /**
   * Get shows by organization (e.g., "AKC", "UKC")
   */
  async getByOrganization(organization: string): Promise<Show[]> {
    const allShows = await this.getAll();
    return allShows
      .filter((show) => show.organization === organization)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }

  /**
   * Get shows by date range
   */
  async getByDateRange(startDate: string, endDate: string): Promise<Show[]> {
    const allShows = await this.getAll();
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    return allShows
      .filter((show) => {
        const showStart = new Date(show.start_date).getTime();
        const showEnd = new Date(show.end_date).getTime();
        // Show overlaps with range if: show starts before range ends AND show ends after range starts
        return showStart <= end && showEnd >= start;
      })
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }

  /**
   * Get shows by status
   */
  async getByStatus(status: string): Promise<Show[]> {
    const allShows = await this.getAll();
    return allShows
      .filter((show) => show.show_status === status)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }

  /**
   * Get upcoming shows (start_date is in the future)
   */
  async getUpcomingShows(): Promise<Show[]> {
    const allShows = await this.getAll();
    const now = Date.now();

    return allShows
      .filter((show) => new Date(show.start_date).getTime() >= now)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }

  /**
   * Get active shows (currently ongoing)
   */
  async getActiveShows(): Promise<Show[]> {
    const allShows = await this.getAll();
    const now = Date.now();

    return allShows
      .filter((show) => {
        const start = new Date(show.start_date).getTime();
        const end = new Date(show.end_date).getTime();
        return start <= now && end >= now;
      })
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }

  /**
   * Update show status (e.g., "upcoming", "in-progress", "completed")
   * Queues mutation for offline support
   */
  async updateShowStatus(
    showId: string,
    status: string,
    additionalFields?: Partial<Show>
  ): Promise<void> {
    // Get current show
    const currentShow = await this.get(showId);
    if (!currentShow) {
      throw new Error(`Show ${showId} not found`);
    }

    // Update local cache optimistically
    const updatedShow: Show = {
      ...currentShow,
      show_status: status,
      ...additionalFields,
      updated_at: new Date().toISOString(),
    };

    await this.set(showId, updatedShow, true); // Mark as dirty

    logger.log(
      `[${this.tableName}] Updated show ${showId} status to "${status}"`
    );
  }
}

// Singleton export
export const replicatedShowsTable = new ReplicatedShowsTable();
