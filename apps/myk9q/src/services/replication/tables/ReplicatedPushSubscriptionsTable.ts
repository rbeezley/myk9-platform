/**
 * ReplicatedPushSubscriptionsTable
 *
 * Replicated push_subscriptions table for offline access to push notification settings.
 * Schema follows database table `push_subscriptions` from migration 017.
 */

import { ReplicatedTable } from '../ReplicatedTable';
import { supabase } from '../../../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { SyncResult } from '../types';

/**
 * Notification preferences structure
 */
export interface NotificationPreferences {
  announcements: boolean;
  up_soon: boolean;
  results: boolean;
  spam_limit: number;
  favorite_armbands: number[];
}

/**
 * Database schema (snake_case) - matches `push_subscriptions` table
 */
export interface PushSubscription {
  id: string;                                    // UUID as string
  license_key: string;
  user_id: string;                               // Passcode (e.g., 'aa260', 'jf472', 'e4b6c')
  user_role: 'admin' | 'judge' | 'steward' | 'exhibitor';
  endpoint: string;                              // Push service endpoint URL
  p256dh: string;                                // Public key for encryption
  auth: string;                                  // Authentication secret
  notification_preferences: NotificationPreferences;
  user_agent: string | null;                     // Browser/device info
  created_at: string;                            // ISO timestamp
  updated_at: string;                            // ISO timestamp
  last_used_at: string;                          // ISO timestamp
  is_active: boolean;
}

/**
 * ReplicatedPushSubscriptionsTable
 *
 * Provides offline-first access to push notification subscriptions.
 */
export class ReplicatedPushSubscriptionsTable extends ReplicatedTable<PushSubscription> {
  constructor() {
    super('push_subscriptions');
  }

  /**
   * Fetch all push subscriptions from Supabase (for initial sync or refresh)
   */
  async fetchFromSupabase(licenseKey: string): Promise<PushSubscription[]> {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('license_key', licenseKey)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch push subscriptions: ${error.message}`);
    }

    return (data || []).map(row => ({
      id: row.id,
      license_key: row.license_key,
      user_id: row.user_id,
      user_role: row.user_role as 'admin' | 'judge' | 'steward' | 'exhibitor',
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      notification_preferences: row.notification_preferences as NotificationPreferences,
      user_agent: row.user_agent,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_used_at: row.last_used_at,
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
        if (newRecord) {
          const subscription: PushSubscription = {
            id: newRecord.id as string,
            license_key: newRecord.license_key as string,
            user_id: newRecord.user_id as string,
            user_role: newRecord.user_role as 'admin' | 'judge' | 'steward' | 'exhibitor',
            endpoint: newRecord.endpoint as string,
            p256dh: newRecord.p256dh as string,
            auth: newRecord.auth as string,
            notification_preferences: newRecord.notification_preferences as NotificationPreferences,
            user_agent: newRecord.user_agent as string | null,
            created_at: newRecord.created_at as string,
            updated_at: newRecord.updated_at as string,
            last_used_at: newRecord.last_used_at as string,
            is_active: newRecord.is_active as boolean,
          };
          await this.set(subscription.id, subscription);
        }
        break;

      case 'DELETE':
        if (oldRecord?.id) {
          await this.delete(oldRecord.id as string);
        }
        break;
    }
  }

  /**
   * Get subscriptions for a specific user
   */
  async getByUser(userId: string): Promise<PushSubscription[]> {
    const all = await this.getAll();
    return all.filter(sub => sub.user_id === userId && sub.is_active);
  }

  /**
   * Get subscription by endpoint (useful for updating existing subscriptions)
   */
  async getByEndpoint(endpoint: string): Promise<PushSubscription | undefined> {
    const all = await this.getAll();
    return all.find(sub => sub.endpoint === endpoint && sub.is_active);
  }

  /**
   * Get active subscriptions only
   */
  async getActive(): Promise<PushSubscription[]> {
    const all = await this.getAll();
    return all.filter(sub => sub.is_active);
  }

  /**
   * Get subscriptions with specific notification type enabled
   */
  async getWithNotificationEnabled(
    notificationType: keyof NotificationPreferences
  ): Promise<PushSubscription[]> {
    const all = await this.getAll();
    return all.filter(
      sub => sub.is_active && sub.notification_preferences[notificationType]
    );
  }

  /**
   * Get subscriptions that have favorited a specific armband
   */
  async getWithFavoriteArmband(armband: number): Promise<PushSubscription[]> {
    const all = await this.getAll();
    return all.filter(
      sub =>
        sub.is_active &&
        sub.notification_preferences.favorite_armbands.includes(armband)
    );
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
  protected resolveConflict(_local: PushSubscription, remote: PushSubscription): PushSubscription {
    return remote; // Server wins
  }
}

/**
 * Singleton instance for use throughout the application
 */
export const replicatedPushSubscriptionsTable = new ReplicatedPushSubscriptionsTable();
