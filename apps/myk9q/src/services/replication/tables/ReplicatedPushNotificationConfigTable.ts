/**
 * ReplicatedPushNotificationConfigTable
 *
 * Replicated push_notification_config table for offline access to push notification
 * configuration settings (secrets, API keys).
 * Schema follows database table `push_notification_config` from migration 028.
 *
 * NOTE: This table typically has only ONE row (id=1) with singleton constraint.
 * It stores sensitive configuration that should be treated carefully.
 */

import { ReplicatedTable } from '../ReplicatedTable';
import { supabase } from '../../../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { SyncResult } from '../types';

/**
 * Database schema (snake_case) - matches `push_notification_config` table
 * Note: ID stored as string for IndexedDB compatibility (original DB has id as number)
 */
export interface PushNotificationConfig {
  id: string;                          // Always '1' (singleton) - stored as string for IndexedDB
  trigger_secret: string;              // Shared secret for authenticating triggers
  anon_key: string;                    // Supabase anon key
  updated_at: string;                  // ISO timestamp
  updated_by: string | null;           // Who last updated the config
}

/**
 * ReplicatedPushNotificationConfigTable
 *
 * Provides offline-first access to push notification configuration.
 * This is a singleton table (always exactly 1 row).
 */
export class ReplicatedPushNotificationConfigTable extends ReplicatedTable<PushNotificationConfig> {
  constructor() {
    super('push_notification_config');
  }

  /**
   * Fetch push notification config from Supabase (for initial sync or refresh)
   * NOTE: This table is NOT multi-tenant - it has a single global config row
   */
  async fetchFromSupabase(_licenseKey: string): Promise<PushNotificationConfig[]> {
    const { data, error } = await supabase
      .from('push_notification_config')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      // Config might not exist yet - return empty array
      // PGRST116: No rows returned
      // 406: Not Acceptable (table might not exist or RLS blocking)
      // 42P01: Undefined table
      if (error.code === 'PGRST116' || error.code === '406' || error.code === '42P01') {
        return [];
      }
      // Also handle HTTP status 406 (Not Acceptable) - table may not exist
      if (error.message?.includes('406') || error.message?.includes('Not Acceptable')) {
        return [];
      }
      throw new Error(`Failed to fetch push notification config: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    return [{
      id: data.id.toString(),  // Convert number to string for IndexedDB
      trigger_secret: data.trigger_secret,
      anon_key: data.anon_key,
      updated_at: data.updated_at,
      updated_by: data.updated_by,
    }];
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
        if (newRecord) {
          const config: PushNotificationConfig = {
            id: (newRecord.id as number).toString(),  // Convert number to string
            trigger_secret: newRecord.trigger_secret as string,
            anon_key: newRecord.anon_key as string,
            updated_at: newRecord.updated_at as string,
            updated_by: newRecord.updated_by as string | null,
          };
          await this.set(config.id, config);  // Use set() instead of put()
        }
        break;

      case 'DELETE':
        if (oldRecord?.id) {
          await this.delete((oldRecord.id as number).toString());
        }
        break;
    }
  }

  /**
   * Get the singleton config record
   */
  async getConfig(): Promise<PushNotificationConfig | undefined> {
    const result = await this.get('1'); // Config always has id='1' (string)
    return result || undefined;  // Convert null to undefined
  }

  /**
   * Override getAll to return singleton config as array
   */
  async getAll(): Promise<PushNotificationConfig[]> {
    const config = await this.getConfig();
    return config ? [config] : [];
  }

  /**
   * Sync method - singleton config sync
   */
  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    try {
      const data = await this.fetchFromSupabase(licenseKey);
      if (data.length > 0) {
        await this.set(data[0].id, data[0]);
      }
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
  protected resolveConflict(_local: PushNotificationConfig, remote: PushNotificationConfig): PushNotificationConfig {
    return remote; // Server wins
  }
}

/**
 * Singleton instance for use throughout the application
 */
export const replicatedPushNotificationConfigTable = new ReplicatedPushNotificationConfigTable();
