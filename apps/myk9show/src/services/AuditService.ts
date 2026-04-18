/**
 * Comprehensive audit service for tracking all system actions
 * Foundation Phase implementation supporting all roles
 */

import {
  AuditEntry,
  AuditEntryInput,
  AuditSearchFilters,
  AuditSearchResult,
  AuditAction,
  ImpersonationContext,
} from '@/types/audit-types';
import { logger } from '@/services/LoggingService';
import { supabase } from '@/services/database/supabaseClient';

export interface AuditServiceConfig {
  enableLocalStorage?: boolean;
  maxLocalEntries?: number;
  enableConsoleLogging?: boolean;
  enableRemoteLogging?: boolean;
  apiEndpoint?: string;
}

export class AuditService {
  private config: AuditServiceConfig;
  private localAuditEntries: AuditEntry[] = [];
  private impersonationContext: ImpersonationContext | null = null;

  constructor(config: AuditServiceConfig = {}) {
    this.config = {
      enableLocalStorage: true,
      maxLocalEntries: 1000,
      enableConsoleLogging: true,
      enableRemoteLogging: true, // Enable database logging
      apiEndpoint: '/api/audit', // Supabase endpoint
      ...config,
    };

    // Load existing entries from localStorage
    if (this.config.enableLocalStorage) {
      this.loadFromLocalStorage();
    }
  }

  /**
   * Log an audit entry
   */
  async log(input: AuditEntryInput): Promise<void> {
    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      userId: input.userId || this.getCurrentUserId(),
      userRole: input.userRole || this.getCurrentUserRole(),
      impersonatingUserId: this.impersonationContext?.originalUserId,
      sessionId: this.getCurrentSessionId(),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      changes: input.changes,
      ipAddress: this.getClientIP(),
      userAgent: this.getUserAgent(),
      requestId: this.getRequestId(),
      metadata: {
        ...input.metadata,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        referrer: document.referrer,
      },
    };

    // Store locally
    if (this.config.enableLocalStorage) {
      this.addToLocalStorage(entry);
    }

    // Console logging for development
    if (this.config.enableConsoleLogging && process.env.NODE_ENV === 'development') {
      logger.debug('Audit Log', 'audit', {
        action: entry.action,
        entity: `${entry.entityType}:${entry.entityId}`,
        user: entry.userId,
        impersonating: entry.impersonatingUserId,
        changes: entry.changes,
      });
    }

    // Remote logging (when implemented)
    if (this.config.enableRemoteLogging && this.config.apiEndpoint) {
      try {
        await this.sendToRemote(entry);
      } catch (error) {
        logger.error('Failed to send audit entry to remote', 'audit', {}, error as Error);
      }
    }

    // Notify admin in real-time for critical actions
    if (this.isCriticalAction(entry.action)) {
      await this.notifyAdmins(entry);
    }
  }

  /**
   * Search audit trail with filters - now queries database first, fallback to localStorage
   */
  async searchAuditTrail(filters: AuditSearchFilters): Promise<AuditSearchResult> {
    if (this.config.enableRemoteLogging) {
      try {
        return await this.searchRemoteAuditTrail(filters);
      } catch (error) {
        logger.warn(
          'Failed to search remote audit trail, falling back to localStorage',
          'audit',
          {},
          error as Error
        );
      }
    }

    // Fallback to localStorage
    let entries = [...this.localAuditEntries];

    // Apply filters
    if (filters.startDate) {
      entries = entries.filter(e => e.timestamp >= filters.startDate!);
    }

    if (filters.endDate) {
      entries = entries.filter(e => e.timestamp <= filters.endDate!);
    }

    if (filters.userId) {
      entries = entries.filter(e => e.userId === filters.userId);
    }

    if (filters.action) {
      entries = entries.filter(e => e.action === filters.action);
    }

    if (filters.entityType) {
      entries = entries.filter(e => e.entityType === filters.entityType);
    }

    if (filters.entityId) {
      entries = entries.filter(e => e.entityId === filters.entityId);
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Pagination
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    return {
      entries: entries.slice(startIndex, endIndex),
      totalCount: entries.length,
      page,
      pageSize,
    };
  }

  /**
   * Search audit trail in database
   */
  private async searchRemoteAuditTrail(filters: AuditSearchFilters): Promise<AuditSearchResult> {
    // `audit_entry` table not yet in generated Supabase types — cast to bypass.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (supabase as any)
      .from('audit_entry')
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
      query = query.eq('user_id', filters.userId);
    }

    if (filters.action) {
      query = query.eq('action', filters.action);
    }

    if (filters.entityType) {
      query = query.eq('entity_type', filters.entityType);
    }

    if (filters.entityId) {
      query = query.eq('entity_id', filters.entityId);
    }

    // Pagination
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const startIndex = (page - 1) * pageSize;

    const { data, error, count } = await query.range(startIndex, startIndex + pageSize - 1);

    if (error) {
      throw new Error(`Failed to search audit trail: ${error.message}`);
    }

    // Transform database results to AuditEntry format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: AuditEntry[] = ((data as any[]) || []).map((row: any) => ({
      id: row.id,
      timestamp: new Date(row.created_at),
      userId: row.user_id,
      userRole: row.metadata?.userRole || 'unknown',
      sessionId: row.metadata?.sessionId || '',
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      changes: {
        before: row.old_values,
        after: row.new_values,
      },
      ipAddress: row.metadata?.ipAddress || '',
      userAgent: row.metadata?.userAgent || '',
      requestId: row.metadata?.requestId || '',
      impersonatingUserId: row.metadata?.impersonatingUserId,
      metadata: row.metadata || {},
    }));

    return {
      entries,
      totalCount: count || 0,
      page,
      pageSize,
    };
  }

  /**
   * Set impersonation context for admin users
   */
  setImpersonationContext(context: ImpersonationContext | null): void {
    this.impersonationContext = context;

    if (context) {
      this.log({
        action: AuditAction.IMPERSONATE_START,
        entityType: 'user_session',
        entityId: context.id,
        metadata: {
          targetUserId: context.targetUserId,
          reason: context.reason,
          expiresAt: context.expiresAt.toISOString(),
        },
      });
    } else {
      this.log({
        action: AuditAction.IMPERSONATE_END,
        entityType: 'user_session',
        entityId: 'session_end',
        metadata: {
          endedAt: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * Track user login
   */
  async trackLogin(userId: string, userRole?: string): Promise<void> {
    await this.log({
      userId,
      userRole,
      action: AuditAction.LOGIN,
      entityType: 'user_session',
      entityId: userId,
      metadata: {
        loginTime: new Date().toISOString(),
        userAgent: this.getUserAgent(),
        ipAddress: this.getClientIP(),
      },
    });
  }

  /**
   * Track user logout
   */
  async trackLogout(userId: string): Promise<void> {
    await this.log({
      userId,
      action: AuditAction.LOGOUT,
      entityType: 'user_session',
      entityId: userId,
      metadata: {
        logoutTime: new Date().toISOString(),
      },
    });
  }

  /**
   * Track entity creation
   */
  async trackCreate(
    entityType: string,
    entityId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: AuditAction.CREATE,
      entityType,
      entityId,
      changes: {
        created: { from: null, to: data },
      },
      metadata: {
        operation: 'create',
        entityData: data,
      },
    });
  }

  /**
   * Track entity updates
   */
  async trackUpdate(
    entityType: string,
    entityId: string,
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>
  ): Promise<void> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    // Compare old and new data to identify changes
    Object.keys(newData).forEach(key => {
      if (oldData[key] !== newData[key]) {
        changes[key] = {
          from: oldData[key],
          to: newData[key],
        };
      }
    });

    if (Object.keys(changes).length > 0) {
      await this.log({
        action: AuditAction.UPDATE,
        entityType,
        entityId,
        changes,
        metadata: {
          operation: 'update',
          changedFields: Object.keys(changes),
        },
      });
    }
  }

  /**
   * Track entity deletion
   */
  async trackDelete(
    entityType: string,
    entityId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: AuditAction.DELETE,
      entityType,
      entityId,
      changes: {
        deleted: { from: data, to: null },
      },
      metadata: {
        operation: 'delete',
        deletedData: data,
      },
    });
  }

  /**
   * Export audit trail
   */
  async exportAuditTrail(filters?: AuditSearchFilters): Promise<string> {
    const result = await this.searchAuditTrail(filters || {});

    await this.log({
      action: AuditAction.EXPORT,
      entityType: 'audit_trail',
      entityId: 'export',
      metadata: {
        exportedCount: result.entries.length,
        filters,
        exportTime: new Date().toISOString(),
      },
    });

    // Convert to CSV format
    const headers = [
      'Timestamp',
      'User ID',
      'User Role',
      'Action',
      'Entity Type',
      'Entity ID',
      'Changes',
      'IP Address',
      'User Agent',
    ];

    const rows = result.entries.map(entry => [
      entry.timestamp.toISOString(),
      entry.userId || '',
      entry.userRole || '',
      entry.action,
      entry.entityType,
      entry.entityId,
      JSON.stringify(entry.changes || {}),
      entry.ipAddress || '',
      entry.userAgent || '',
    ]);

    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }

  /**
   * Get audit statistics
   */
  getAuditStatistics(): {
    totalEntries: number;
    entriesByAction: Record<AuditAction, number>;
    entriesByEntityType: Record<string, number>;
    recentActivity: AuditEntry[];
  } {
    const entriesByAction = {} as Record<AuditAction, number>;
    const entriesByEntityType = {} as Record<string, number>;

    this.localAuditEntries.forEach(entry => {
      entriesByAction[entry.action] = (entriesByAction[entry.action] || 0) + 1;
      entriesByEntityType[entry.entityType] = (entriesByEntityType[entry.entityType] || 0) + 1;
    });

    const recentActivity = [...this.localAuditEntries]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    return {
      totalEntries: this.localAuditEntries.length,
      entriesByAction,
      entriesByEntityType,
      recentActivity,
    };
  }

  /**
   * Clear local audit trail
   */
  clearLocalAuditTrail(): void {
    this.localAuditEntries = [];
    if (this.config.enableLocalStorage) {
      localStorage.removeItem('auditEntries');
    }
  }

  // Private helper methods

  private addToLocalStorage(entry: AuditEntry): void {
    this.localAuditEntries.push(entry);

    // Maintain max entries limit
    if (this.localAuditEntries.length > this.config.maxLocalEntries!) {
      this.localAuditEntries = this.localAuditEntries.slice(-this.config.maxLocalEntries!);
    }

    // Save to localStorage
    try {
      localStorage.setItem(
        'auditEntries',
        JSON.stringify(
          this.localAuditEntries.map(e => ({
            ...e,
            timestamp: e.timestamp.toISOString(),
          }))
        )
      );
    } catch (error) {
      logger.error('Failed to save audit entries to localStorage', 'audit', {}, error as Error);
    }
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('auditEntries');
      if (stored) {
        const entries = JSON.parse(stored);
        interface StoredEntry {
          timestamp: string;
          [key: string]: unknown;
        }
        this.localAuditEntries = entries.map((e: StoredEntry) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }));
      }
    } catch (error) {
      logger.error('Failed to load audit entries from localStorage', 'audit', {}, error as Error);
    }
  }

  private async sendToRemote(entry: AuditEntry): Promise<void> {
    if (!this.config.apiEndpoint) return;

    // Transform AuditEntry to database format
    const auditData = {
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      old_values: entry.changes?.before || null,
      new_values: entry.changes?.after || null,
      user_id: entry.userId,
      metadata: {
        ...entry.metadata,
        sessionId: entry.sessionId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        requestId: entry.requestId,
        impersonatingUserId: entry.impersonatingUserId,
      },
    };

    // `audit_entry` table not yet in generated Supabase types — cast to bypass.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('audit_entry').insert(auditData);

    if (error) {
      throw new Error(`Failed to send audit entry to database: ${error.message}`);
    }
  }

  private async notifyAdmins(entry: AuditEntry): Promise<void> {
    // This would integrate with the NotificationService
    // For now, just log critical actions
    logger.warn('Critical Audit Action', 'audit', { entry });
  }

  private isCriticalAction(action: AuditAction): boolean {
    return [
      AuditAction.DELETE,
      AuditAction.IMPERSONATE_START,
      AuditAction.IMPERSONATE_END,
    ].includes(action);
  }

  private getCurrentUserId(): string | undefined {
    // This would integrate with the auth system
    return 'current_user_id'; // Placeholder
  }

  private getCurrentUserRole(): string | undefined {
    // This would integrate with the auth system
    return 'current_user_role'; // Placeholder
  }

  private getCurrentSessionId(): string | undefined {
    return sessionStorage.getItem('sessionId') || undefined;
  }

  private getClientIP(): string | undefined {
    // This would be populated by the server or a client-side service
    return undefined;
  }

  private getUserAgent(): string {
    return navigator.userAgent;
  }

  private getRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Global singleton instance
export const auditService = new AuditService({
  enableLocalStorage: true,
  maxLocalEntries: 1000,
  enableConsoleLogging: process.env.NODE_ENV === 'development',
  enableRemoteLogging: false,
});

// Decorator for automatic audit logging
export const Audited = (entityType: string, action?: AuditAction) => {
  return (_target: unknown, propertyName: string, descriptor: PropertyDescriptor) => {
    const method = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const startTime = Date.now();
      const auditAction = action || inferActionFromMethod(propertyName);

      try {
        const result = await method.apply(this, args);

        // Log successful action
        await auditService.log({
          action: auditAction,
          entityType,
          entityId: extractEntityId(args, result),
          changes: extractChanges(args),
          metadata: {
            method: propertyName,
            duration: Date.now() - startTime,
            success: true,
          },
        });

        return result;
      } catch (error) {
        // Log failed action
        await auditService.log({
          action: auditAction,
          entityType,
          entityId: extractEntityId(args),
          metadata: {
            method: propertyName,
            duration: Date.now() - startTime,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        throw error;
      }
    };
  };
};

// Helper functions for decorator
function inferActionFromMethod(methodName: string): AuditAction {
  if (methodName.includes('create') || methodName.includes('add')) return AuditAction.CREATE;
  if (methodName.includes('update') || methodName.includes('edit')) return AuditAction.UPDATE;
  if (methodName.includes('delete') || methodName.includes('remove')) return AuditAction.DELETE;
  if (methodName.includes('get') || methodName.includes('find')) return AuditAction.READ;
  return AuditAction.SYSTEM_ACTION;
}

function extractEntityId(args: unknown[], result?: unknown): string {
  // Try to extract ID from first argument
  if (args.length > 0 && typeof args[0] === 'string') {
    return args[0];
  }

  // Try to extract ID from result
  if (
    result &&
    typeof result === 'object' &&
    'id' in result &&
    typeof (result as { id: unknown }).id === 'string'
  ) {
    return (result as { id: string }).id;
  }

  return 'unknown';
}

function extractChanges(
  args: unknown[]
): Record<string, { from: unknown; to: unknown }> | undefined {
  // For update operations, try to extract changes
  if (args.length >= 2 && typeof args[1] === 'object') {
    return { updated: { from: null, to: args[1] } };
  }

  return undefined;
}
