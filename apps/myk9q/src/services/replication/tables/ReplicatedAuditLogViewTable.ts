/**
 * ReplicatedAuditLogViewTable.ts
 *
 * Replicated table for `view_audit_log` - a unified view of all competition admin changes
 * (visibility and self-checkin settings) across show, trial, and class levels.
 *
 * Unlike regular tables, this is read-only (no writes to IndexedDB from client).
 * The view is regenerated when visibility settings are changed.
 *
 * **Phase 4 Day 20** - Audit Log View (Cached Materialized View)
 */

import { ReplicatedTable } from '../ReplicatedTable';
import { supabase } from '../../../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { SyncResult } from '../types';
import { logger } from '@/utils/logger';

/**
 * Raw row from Supabase view (without generated id)
 */
interface AuditLogRow {
  change_type: 'show_visibility' | 'trial_visibility' | 'class_visibility';
  scope: 'Show Level' | 'Trial Level' | 'Class Level';
  license_key: string;
  show_name: string;
  trial_id: string | null;
  trial_number: number | null;
  class_id: string | null;
  element: string | null;
  level: string | null;
  section: string | null;
  setting_category: 'visibility';
  setting_value: string;
  updated_by: string;
  updated_at: string;
}

/**
 * Database schema (snake_case) - matches `view_audit_log`
 * This is a computed view combining multiple tables.
 * We'll use a composite key for IndexedDB: `${change_type}_${updated_at}_${scope}`
 */
export interface AuditLog extends AuditLogRow {
  // Composite id for IndexedDB (generated from change_type + updated_at + scope)
  id: string;
}

/**
 * ReplicatedAuditLogViewTable
 *
 * Provides offline-first access to audit log view.
 * This is a read-only cache - no client-side writes.
 */
export class ReplicatedAuditLogViewTable extends ReplicatedTable<AuditLog> {
  constructor() {
    super('view_audit_log');
  }

  /**
   * Generate a unique composite ID for IndexedDB storage
   * Views don't have a natural id column, so we create one
   */
  private generateId(row: AuditLogRow): string {
    // Use change_type + updated_at + scope to create unique id
    // Also include trial_id or class_id if available for better uniqueness
    const parts = [
      row.change_type,
      row.updated_at,
      row.scope,
    ];

    if (row.trial_id) {
      parts.push(row.trial_id.toString());
    }
    if (row.class_id) {
      parts.push(row.class_id.toString());
    }

    return parts.join('_');
  }

  /**
   * Fetch all audit log entries from Supabase (for initial sync or refresh)
   */
  async fetchFromSupabase(licenseKey: string): Promise<AuditLog[]> {
    const { data, error } = await supabase
      .from('view_audit_log')
      .select('*')
      .eq('license_key', licenseKey)
      .order('updated_at', { ascending: false }); // Newest first

    if (error) {
      throw new Error(`Failed to fetch audit log: ${error.message}`);
    }

    // Transform to AuditLog type
    return (data || []).map(row => ({
      id: this.generateId(row),
      change_type: row.change_type as 'show_visibility' | 'trial_visibility' | 'class_visibility',
      scope: row.scope as 'Show Level' | 'Trial Level' | 'Class Level',
      license_key: row.license_key,
      show_name: row.show_name,
      trial_id: row.trial_id ? row.trial_id.toString() : null,
      trial_number: row.trial_number,
      class_id: row.class_id ? row.class_id.toString() : null,
      element: row.element,
      level: row.level,
      section: row.section,
      setting_category: row.setting_category as 'visibility',
      setting_value: row.setting_value,
      updated_by: row.updated_by,
      updated_at: row.updated_at,
    }));
  }

  /**
   * Handle real-time updates from visibility tables
   * Since view_audit_log is a view, we watch the underlying tables for changes
   * and invalidate the cache when they're updated.
   */
  async handleRealtimeEvent(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ): Promise<void> {
    const { eventType } = payload;

    // For views, we typically just invalidate the cache on any change
    // and let the next sync refresh the data
    if (eventType === 'UPDATE' || eventType === 'INSERT') {
      // Mark sync as stale so next read triggers a refresh
      await this.updateSyncMetadata({
        syncStatus: 'idle',
        lastIncrementalSyncAt: 0, // Force refresh on next read
      });

}
  }

  /**
   * Get audit logs for a specific show
   */
  async getByShow(showName: string): Promise<AuditLog[]> {
    const all = await this.getAll();
    return all.filter(log => log.show_name === showName);
  }

  /**
   * Get audit logs for a specific trial
   */
  async getByTrial(trialId: string): Promise<AuditLog[]> {
    const all = await this.getAll();
    return all.filter(log => log.trial_id === trialId);
  }

  /**
   * Get audit logs for a specific class
   */
  async getByClass(classId: string): Promise<AuditLog[]> {
    const all = await this.getAll();
    return all.filter(log => log.class_id === classId);
  }

  /**
   * Get audit logs by change type
   */
  async getByChangeType(changeType: 'show_visibility' | 'trial_visibility' | 'class_visibility'): Promise<AuditLog[]> {
    const all = await this.getAll();
    return all.filter(log => log.change_type === changeType);
  }

  /**
   * Get audit logs by scope level
   */
  async getByScope(scope: 'Show Level' | 'Trial Level' | 'Class Level'): Promise<AuditLog[]> {
    const all = await this.getAll();
    return all.filter(log => log.scope === scope);
  }

  /**
   * Get audit logs made by a specific user
   */
  async getByUser(updatedBy: string): Promise<AuditLog[]> {
    const all = await this.getAll();
    return all.filter(log => log.updated_by === updatedBy);
  }

  /**
   * Get recent audit logs (limit to N most recent)
   */
  async getRecent(limit: number = 50): Promise<AuditLog[]> {
    const all = await this.getAll();
    // Already sorted by updated_at DESC from fetchFromSupabase
    return all.slice(0, limit);
  }

  /**
   * Get audit logs within a date range
   */
  async getByDateRange(startDate: string, endDate: string): Promise<AuditLog[]> {
    const all = await this.getAll();
    return all.filter(log => {
      const logDate = new Date(log.updated_at);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return logDate >= start && logDate <= end;
    });
  }

  /**
   * Sync method - full sync (views don't support incremental sync)
   */
  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    try {
const data = await this.fetchFromSupabase(licenseKey);

      // Clear old data first (full replacement for views)
      await this.clearTable();

      // Insert fresh data
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
      logger.error('[ReplicatedAuditLogViewTable] ❌ Sync failed:', errorMessage);

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
   * Conflict resolution: Server-authoritative (views are always read-only)
   */
  protected resolveConflict(_local: AuditLog, remote: AuditLog): AuditLog {
    return remote; // Server wins (always)
  }

  /**
   * Helper to clear all data for the table (for full replacement sync)
   */
  private async clearTable(): Promise<void> {
    const all = await this.getAll();
    const ids = all.map(item => item.id);
    if (ids.length > 0) {
      await this.batchDelete(ids);
    }
  }
}

/**
 * Singleton instance for use throughout the application
 */
export const replicatedAuditLogViewTable = new ReplicatedAuditLogViewTable();
