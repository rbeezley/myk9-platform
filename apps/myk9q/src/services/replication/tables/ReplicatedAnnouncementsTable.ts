/**
 * ReplicatedAnnouncementsTable
 *
 * Replicated announcements table for offline access to show announcements.
 * Schema follows database table `announcements` from migration 007.
 */

import { ReplicatedTable } from '../ReplicatedTable';
import { supabase } from '../../../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { SyncResult } from '../types';

/**
 * Database schema (snake_case) - matches `announcements` table
 */
export interface Announcement {
  id: string;                          // BIGINT as string
  license_key: string;
  title: string;
  content: string;
  priority: 'normal' | 'high' | 'urgent';
  author_role: 'admin' | 'judge' | 'steward';
  author_name: string | null;
  created_at: string;                  // ISO timestamp
  updated_at: string;                  // ISO timestamp
  expires_at: string | null;           // ISO timestamp
  is_active: boolean;
}

/**
 * ReplicatedAnnouncementsTable
 *
 * Provides offline-first access to show announcements.
 */
export class ReplicatedAnnouncementsTable extends ReplicatedTable<Announcement> {
  constructor() {
    super('announcements');
  }

  /**
   * Fetch all announcements from Supabase (for initial sync or refresh)
   */
  async fetchFromSupabase(licenseKey: string): Promise<Announcement[]> {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('license_key', licenseKey)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch announcements: ${error.message}`);
    }

    return (data || []).map(row => ({
      id: row.id.toString(),
      license_key: row.license_key,
      title: row.title,
      content: row.content,
      priority: row.priority as 'normal' | 'high' | 'urgent',
      author_role: row.author_role as 'admin' | 'judge' | 'steward',
      author_name: row.author_name,
      created_at: row.created_at,
      updated_at: row.updated_at,
      expires_at: row.expires_at,
      is_active: row.is_active,
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
          const announcement: Announcement = {
            id: String(newRecord.id),
            license_key: newRecord.license_key as string,
            title: newRecord.title as string,
            content: newRecord.content as string,
            priority: newRecord.priority as 'normal' | 'high' | 'urgent',
            author_role: newRecord.author_role as 'admin' | 'judge' | 'steward',
            author_name: newRecord.author_name as string | null,
            created_at: newRecord.created_at as string,
            updated_at: newRecord.updated_at as string,
            expires_at: newRecord.expires_at as string | null,
            is_active: newRecord.is_active as boolean,
          };
          await this.set(announcement.id, announcement);
        }
        break;

      case 'DELETE':
        if (oldRecord?.id) {
          await this.delete(String(oldRecord.id));
        }
        break;
    }
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
   * Announcements always come from server (admins create them)
   */
  protected resolveConflict(_local: Announcement, remote: Announcement): Announcement {
    return remote; // Server wins
  }

  /**
   * Get active announcements (not expired, is_active=true)
   */
  async getActive(): Promise<Announcement[]> {
    const all = await this.getAll();
    const now = new Date().toISOString();

    return all.filter(announcement =>
      announcement.is_active &&
      (!announcement.expires_at || announcement.expires_at > now)
    );
  }

  /**
   * Get announcements by priority
   */
  async getByPriority(priority: 'normal' | 'high' | 'urgent'): Promise<Announcement[]> {
    const all = await this.getAll();
    return all.filter(announcement => announcement.priority === priority);
  }

  /**
   * Get announcements created after a specific date
   */
  async getSince(since: string): Promise<Announcement[]> {
    const all = await this.getAll();
    return all.filter(announcement => announcement.created_at > since);
  }
}

/**
 * Singleton instance for use throughout the application
 */
export const replicatedAnnouncementsTable = new ReplicatedAnnouncementsTable();
