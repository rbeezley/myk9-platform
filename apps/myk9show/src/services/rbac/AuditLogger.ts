/**
 * Audit Logger
 *
 * Handles audit logging for RBAC operations.
 */

import { supabase } from '@/lib/supabase';
import { ActionType, AuditLogEntry, AuditLogFilter } from '@/types/rbac-types';

export class AuditLogger {
  /**
   * Log an audit event
   */
  async logAuditEvent(
    actionType: ActionType,
    details: {
      target_role_id?: string;
      target_permission_id?: string;
      target_user_id?: string;
      scope_type?: string;
      scope_id?: string;
      details?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      const user = (await supabase.auth.getUser()).data.user;

      await supabase
        .from('permission_audit_log')
        .insert({
          action_type: actionType,
          actor_id: user?.id || null,
          target_role_id: details.target_role_id || null,
          target_permission_id: details.target_permission_id || null,
          target_user_id: details.target_user_id || null,
          scope_type: details.scope_type || null,
          scope_id: details.scope_id || null,
          details: details.details ? JSON.stringify(details.details) as string : null
        });
    } catch (error) {
      console.error('Failed to log audit event:', error);
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

    return (data || []).map(item => ({
      ...item,
      details: typeof item.details === 'object' ? item.details as Record<string, unknown> : {}
    })) as AuditLogEntry[];
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

      // Apply filters
      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }
      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }
      if (filters.userId) {
        query = query.eq('actor_id', filters.userId);
      }
      if (filters.actionType) {
        query = query.eq('action_type', filters.actionType);
      }
      if (filters.targetRoleId) {
        query = query.eq('target_role_id', filters.targetRoleId);
      }
      if (filters.targetUserId) {
        query = query.eq('target_user_id', filters.targetUserId);
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
        entries: (data || []).map((row: Record<string, unknown>): AuditLogEntry => ({
          id: row.id as string,
          action_type: row.action_type as string,
          actor_id: row.actor_id as string,
          target_user_id: row.target_user_id as string,
          target_role_id: row.target_role_id as string,
          target_permission_id: row.target_permission_id as string,
          scope_type: row.scope_type as string,
          scope_id: row.scope_id as string,
          details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details || {},
          created_at: row.created_at as string
        })),
        totalCount: count || 0
      };
    } catch (error) {
      console.error('Failed to get audit log:', error);
      throw error;
    }
  }
}
