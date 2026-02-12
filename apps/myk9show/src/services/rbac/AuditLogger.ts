/**
 * Audit Logger
 *
 * Handles audit logging for RBAC operations.
 * Maps to permission_audit_log table columns:
 *   action, user_id, target_id, target_type, old_value, new_value, ip_address, user_agent
 */

import { supabase } from '@/lib/supabase';
import { ActionType, AuditLogEntry, AuditLogFilter } from '@/types/rbac-types';
import { logger } from '@/services/LoggingService';

export class AuditLogger {
  /**
   * Log an audit event
   */
  async logAuditEvent(
    action: ActionType,
    details: {
      targetId?: string;
      targetType?: string;
      oldValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      const user = (await supabase.auth.getUser()).data.user;

      await supabase
        .from('permission_audit_log')
        .insert({
          action: action as string,
          user_id: user?.id ?? null,
          target_id: details.targetId ?? null,
          target_type: details.targetType ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          old_value: (details.oldValue ?? null) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new_value: (details.newValue ?? null) as any,
        });
    } catch (error) {
      logger.error('Failed to log audit event:', 'rbac', {}, error as Error);
      // Don't throw - audit logging should not break the main operation
    }
  }

  /**
   * Get audit logs with simple filter
   */
  async getAuditLogs(filter: { fromDate?: string; toDate?: string; limit?: number } = {}): Promise<AuditLogEntry[]> {
    let query = supabase
      .from('permission_audit_log')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter.fromDate) {
      query = query.gte('created_at', filter.fromDate);
    }
    if (filter.toDate) {
      query = query.lte('created_at', filter.toDate);
    }
    if (filter.limit) {
      query = query.limit(filter.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }

    return (data || []) as AuditLogEntry[];
  }

  /**
   * Get audit log with comprehensive filtering and pagination
   */
  async getAuditLog(filters: AuditLogFilter): Promise<{ entries: AuditLogEntry[]; totalCount: number }> {
    try {
      let query = supabase
        .from('permission_audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Apply filters (map service-layer names to actual DB columns)
      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }
      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }
      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters.actionType) {
        query = query.eq('action', filters.actionType);
      }
      if (filters.targetRoleId) {
        query = query.eq('target_id', filters.targetRoleId).eq('target_type', 'role');
      }
      if (filters.targetUserId) {
        query = query.eq('target_id', filters.targetUserId).eq('target_type', 'user');
      }
      if (filters.entityType) {
        query = query.eq('target_type', filters.entityType);
      }

      // Pagination
      const page = filters.page || 1;
      const pageSize = filters.pageSize || 50;
      const startIndex = (page - 1) * pageSize;

      query = query.range(startIndex, startIndex + pageSize - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`Failed to get audit log: ${error.message}`);
      }

      return {
        entries: (data || []) as AuditLogEntry[],
        totalCount: count || 0,
      };
    } catch (error) {
      logger.error('Failed to get audit log:', 'rbac', {}, error as Error);
      throw error;
    }
  }
}
