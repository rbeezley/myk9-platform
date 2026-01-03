/**
 * ReplicatedAnnouncementReadsTable
 *
 * Replicated announcement_reads table for offline tracking of which announcements
 * have been read by users.
 * Schema follows database table `announcement_reads` from migration 007.
 */

import { ReplicatedTable } from '../ReplicatedTable';
import { supabase } from '../../../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { SyncResult } from '../types';

/**
 * Database schema (snake_case) - matches `announcement_reads` table
 */
export interface AnnouncementRead {
  id: string;                          // BIGINT as string
  announcement_id: string;             // BIGINT as string (FK to announcements.id)
  user_identifier: string;             // Passcode (e.g., 'aa260', 'jf472', 'e4b6c')
  license_key: string;
  read_at: string;                     // ISO timestamp
}

/**
 * ReplicatedAnnouncementReadsTable
 *
 * Provides offline-first tracking of read announcements.
 */
export class ReplicatedAnnouncementReadsTable extends ReplicatedTable<AnnouncementRead> {
  constructor() {
    super('announcement_reads');
  }

  /**
   * Fetch all announcement reads from Supabase (for initial sync or refresh)
   */
  async fetchFromSupabase(licenseKey: string): Promise<AnnouncementRead[]> {
    const { data, error } = await supabase
      .from('announcement_reads')
      .select('*')
      .eq('license_key', licenseKey)
      .order('read_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch announcement reads: ${error.message}`);
    }

    return (data || []).map(row => ({
      id: row.id.toString(),
      announcement_id: row.announcement_id.toString(),
      user_identifier: row.user_identifier,
      license_key: row.license_key,
      read_at: row.read_at,
    }));
  }

  /**
   * Handle realtime updates from Supabase
   */
  async handleRealtimeEvent(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ): Promise<void> {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case 'INSERT':
      case 'UPDATE':
        if (newRecord && newRecord.id) {
          const read: AnnouncementRead = {
            id: String(newRecord.id),
            announcement_id: String(newRecord.announcement_id),
            user_identifier: newRecord.user_identifier as string,
            license_key: newRecord.license_key as string,
            read_at: newRecord.read_at as string,
          };
          await this.set(read.id, read);
        }
        break;

      case 'DELETE':
        if (oldRecord?.id) {
          await this.delete(oldRecord.id.toString());
        }
        break;
    }
  }

  /**
   * Get reads for a specific user
   */
  async getByUser(userIdentifier: string): Promise<AnnouncementRead[]> {
    const all = await this.getAll();
    return all.filter(read => read.user_identifier === userIdentifier);
  }

  /**
   * Get reads for a specific announcement
   */
  async getByAnnouncement(announcementId: string): Promise<AnnouncementRead[]> {
    const all = await this.getAll();
    return all.filter(read => read.announcement_id === announcementId);
  }

  /**
   * Check if announcement has been read by user
   */
  async hasRead(announcementId: string, userIdentifier: string): Promise<boolean> {
    const all = await this.getAll();
    return all.some(
      read => read.announcement_id === announcementId && read.user_identifier === userIdentifier
    );
  }

  /**
   * Get all announcement IDs that have been read by a user
   */
  async getReadAnnouncementIds(userIdentifier: string): Promise<Set<string>> {
    const reads = await this.getByUser(userIdentifier);
    return new Set(reads.map(read => read.announcement_id));
  }

  /**
   * Sync method - server-authoritative simple sync
   */
  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    try {
      const data = await this.fetchFromSupabase(licenseKey);
      await this.batchSet(data);
      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
      });
      return {
        tableName: this.tableName,
        success: true,
        operation: 'full-sync',
        rowsAffected: data.length,
        conflictsResolved: 0,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        tableName: this.tableName,
        success: false,
        operation: 'full-sync',
        rowsAffected: 0,
        conflictsResolved: 0,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Conflict resolution: Server-authoritative
   */
  protected resolveConflict(_local: AnnouncementRead, remote: AnnouncementRead): AnnouncementRead {
    return remote; // Server wins
  }
}

/**
 * Singleton instance for use throughout the application
 */
export const replicatedAnnouncementReadsTable = new ReplicatedAnnouncementReadsTable();
