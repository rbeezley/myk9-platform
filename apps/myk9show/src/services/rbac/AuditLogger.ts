/**
 * Audit Logger
 *
 * Handles audit logging for RBAC operations.
 * Maps to permission_audit_log table columns:
 *   action, user_id, target_id, target_type, old_value, new_value, ip_address, user_agent
 */

import { supabase } from '@/lib/supabase';
import type { Json } from '@myk9/supabase';
import { ActionType, AuditLogEntry, AuditLogFilter } from '@/types/rbac-types';
import { logger } from '@/services/LoggingService';
import { formatPersonLabel, type PersonLabelRow } from './personLabels';

async function enrichAuditPeople(entries: AuditLogEntry[]): Promise<AuditLogEntry[]> {
  const personIds = Array.from(
    new Set(
      entries
        .flatMap(entry => [entry.user_id, entry.target_type === 'user' ? entry.target_id : null])
        .filter((id): id is string => Boolean(id))
    )
  );

  if (personIds.length === 0) return entries;

  const { data, error } = await supabase
    .from('people')
    .select('id, first_name, last_name, email')
    .in('id', personIds);

  if (error) {
    logger.warn('Failed to enrich RBAC audit people', 'rbac', { personIds }, error);
    return entries;
  }

  const people = new Map(
    ((data ?? []) as PersonLabelRow[]).map(person => [person.id, person] as const)
  );

  return entries.map(entry => {
    const actor = entry.user_id ? people.get(entry.user_id) : undefined;
    const target =
      entry.target_type === 'user' && entry.target_id
        ? people.get(entry.target_id)
        : undefined;
    const targetDisplay = formatPersonLabel(target);
    return {
      ...entry,
      ...(actor?.email ? { actor_email: actor.email } : {}),
      ...(targetDisplay ? { target_display: targetDisplay } : {}),
    };
  });
}

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

      // permission_audit_log.user_id references people.id, not auth.users.id
      // (see supabase/migrations/005_myk9show_specific.sql:268 and
      // 001_core_entities.sql:47/:70 — they are distinct identifiers, and
      // people.id is never equal to the auth uid). Resolve the acting user's
      // people row the same way RoleManager.assignRole resolves granted_by.
      // If no people row matches (e.g. an auth user with no profile yet),
      // insert null: user_id is nullable and FK-constrained, so a guessed
      // value would either violate the FK or silently misattribute the event.
      let actorPeopleId: string | null = null;
      if (user?.id) {
        const { data: personRow } = await supabase
          .from('people')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        actorPeopleId = personRow?.id ?? null;
      }

      const { error } = await supabase.from('permission_audit_log').insert({
        action: action as string,
        user_id: actorPeopleId,
        target_id: details.targetId ?? null,
        target_type: details.targetType ?? null,
        old_value: (details.oldValue ?? null) as Json,
        new_value: (details.newValue ?? null) as Json,
      });

      if (error) {
        // This insert has a history of failing silently on the FK mismatch
        // above (2 rows total in permission_audit_log before this fix, vs.
        // hundreds of role/permission mutations). Log loudly — never let a
        // failed audit write disappear without a trace.
        logger.error(
          'Audit log insert failed',
          'rbac',
          { action: action as string, targetId: details.targetId, targetType: details.targetType },
          new Error(error.message)
        );
      }
    } catch (error) {
      logger.error('Failed to log audit event:', 'rbac', {}, error as Error);
      // Don't throw - audit logging should not break the main operation
    }
  }

  /**
   * Get audit logs with simple filter
   */
  async getAuditLogs(
    filter: { fromDate?: string; toDate?: string; limit?: number; targetType?: string } = {}
  ): Promise<AuditLogEntry[]> {
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
    if (filter.targetType) {
      query = query.eq('target_type', filter.targetType);
    }
    if (filter.limit) {
      query = query.limit(filter.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }

    return enrichAuditPeople((data || []) as AuditLogEntry[]);
  }

  /**
   * Get audit log with comprehensive filtering and pagination
   */
  async getAuditLog(
    filters: AuditLogFilter
  ): Promise<{ entries: AuditLogEntry[]; totalCount: number }> {
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
