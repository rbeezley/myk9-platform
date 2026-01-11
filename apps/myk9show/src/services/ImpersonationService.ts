/**
 * User Impersonation Framework for Admin troubleshooting
 * Foundation Phase implementation supporting all role workflows
 */

import { ImpersonationContext, ImpersonationSession, AuditAction, NotificationType } from '@/types/audit-types';
import { auditService } from './AuditService';
import { notificationService } from './NotificationService';
import { logger } from '@/services/LoggingService';

export interface ImpersonationConfig {
  maxSessionDuration?: number; // in milliseconds
  require2FA?: boolean;
  allowedRoles?: string[];
  sessionWarningTime?: number; // warn user X milliseconds before expiry
}

export interface ImpersonationRequest {
  adminUserId: string;
  targetUserId: string;
  reason: string;
  duration?: number; // in milliseconds, defaults to maxSessionDuration
  twoFactorCode?: string;
}

export class ImpersonationService {
  private config: Required<ImpersonationConfig>;
  private activeSessions = new Map<string, ImpersonationSession>();
  private sessionTimers = new Map<string, NodeJS.Timeout>();
  private warningTimers = new Map<string, NodeJS.Timeout>();

  constructor(config: ImpersonationConfig = {}) {
    this.config = {
      maxSessionDuration: 30 * 60 * 1000, // 30 minutes default
      require2FA: true,
      allowedRoles: ['site_admin', 'club_admin'],
      sessionWarningTime: 5 * 60 * 1000, // 5 minutes warning
      ...config
    };

    // Load active sessions from storage on initialization
    this.loadActiveSessions();
  }

  /**
   * Start impersonation session
   */
  async startImpersonation(request: ImpersonationRequest): Promise<ImpersonationContext> {
    // Validate admin permissions
    await this.validateAdminPermissions();

    // Validate 2FA if required
    if (this.config.require2FA) {
      await this.validate2FA(request.adminUserId, request.twoFactorCode);
    }

    // Validate target user exists
    await this.validateTargetUser();

    // Check for existing session
    const existingSession = this.findActiveSessionByAdmin(request.adminUserId);
    if (existingSession) {
      throw new Error('Admin user already has an active impersonation session');
    }

    // Create session
    const sessionId = this.generateSessionId();
    const duration = Math.min(
      request.duration || this.config.maxSessionDuration,
      this.config.maxSessionDuration
    );

    const session: ImpersonationSession = {
      id: sessionId,
      adminUserId: request.adminUserId,
      targetUserId: request.targetUserId,
      reason: request.reason,
      startedAt: new Date(),
      sessionToken: this.generateSessionToken(),
      metadata: {
        userAgent: navigator.userAgent,
        ipAddress: await this.getClientIP(),
        requestedDuration: duration
      }
    };

    const context: ImpersonationContext = {
      id: sessionId,
      originalUserId: request.adminUserId,
      targetUserId: request.targetUserId,
      sessionId: sessionId,
      startedAt: session.startedAt,
      expiresAt: new Date(session.startedAt.getTime() + duration),
      reason: request.reason,
      isActive: true
    };

    // Store session
    this.activeSessions.set(sessionId, session);
    this.saveActiveSessions();

    // Set expiry timer
    this.setSessionTimer(sessionId, duration);

    // Set warning timer
    this.setWarningTimer(sessionId, duration - this.config.sessionWarningTime);

    // Audit log
    await auditService.log({
      userId: request.adminUserId,
      action: AuditAction.IMPERSONATE_START,
      entityType: 'impersonation_session',
      entityId: sessionId,
      metadata: {
        targetUserId: request.targetUserId,
        reason: request.reason,
        duration,
        expiresAt: context.expiresAt.toISOString()
      }
    });

    // Set audit service context
    auditService.setImpersonationContext(context);

    // Notify target user (optional)
    await this.notifyTargetUser(request.targetUserId, context);

    return context;
  }

  /**
   * End impersonation session
   */
  async endImpersonation(sessionId: string, adminUserId?: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Impersonation session not found');
    }

    // Validate admin can end this session
    if (adminUserId && session.adminUserId !== adminUserId) {
      throw new Error('Admin user does not own this impersonation session');
    }

    // Update session
    session.endedAt = new Date();

    // Clean up timers
    this.clearSessionTimers(sessionId);

    // Remove from active sessions
    this.activeSessions.delete(sessionId);
    this.saveActiveSessions();

    // Clear audit service context
    auditService.setImpersonationContext(null);

    // Audit log
    await auditService.log({
      userId: session.adminUserId,
      action: AuditAction.IMPERSONATE_END,
      entityType: 'impersonation_session',
      entityId: sessionId,
      metadata: {
        targetUserId: session.targetUserId,
        duration: session.endedAt.getTime() - session.startedAt.getTime(),
        endedAt: session.endedAt.toISOString()
      }
    });

    // Notify target user
    await this.notifySessionEnd(session.targetUserId, sessionId);
  }

  /**
   * Get active impersonation context for current session
   */
  getCurrentImpersonationContext(): ImpersonationContext | null {
    // In a real implementation, this would check the current session
    // For now, return the first active session (if any)
    const activeSessions = Array.from(this.activeSessions.values());
    if (activeSessions.length > 0) {
      const session = activeSessions[0];
      return {
        id: session.id,
        originalUserId: session.adminUserId,
        targetUserId: session.targetUserId,
        sessionId: session.id,
        startedAt: session.startedAt,
        expiresAt: new Date(session.startedAt.getTime() + this.config.maxSessionDuration),
        reason: session.reason,
        isActive: !session.endedAt
      };
    }
    return null;
  }

  /**
   * Get all active sessions (for admin monitoring)
   */
  getActiveSessions(): ImpersonationSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get session history for user
   */
  async getSessionHistory(userId?: string): Promise<ImpersonationSession[]> {
    // In a real implementation, this would query the database
    logger.debug('Getting session history for user', 'impersonation', { userId });
    // For now, return empty array
    return [];
  }

  /**
   * Extend session duration
   */
  async extendSession(sessionId: string, additionalTime: number, adminUserId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Impersonation session not found');
    }

    if (session.adminUserId !== adminUserId) {
      throw new Error('Admin user does not own this impersonation session');
    }

    if (session.endedAt) {
      throw new Error('Cannot extend ended session');
    }

    // Clear existing timers
    this.clearSessionTimers(sessionId);

    // Set new timers with extended time
    const newDuration = additionalTime;
    this.setSessionTimer(sessionId, newDuration);
    this.setWarningTimer(sessionId, newDuration - this.config.sessionWarningTime);

    // Audit log
    await auditService.log({
      userId: adminUserId,
      action: AuditAction.UPDATE,
      entityType: 'impersonation_session',
      entityId: sessionId,
      metadata: {
        action: 'extend_session',
        additionalTime,
        newExpiryTime: new Date(Date.now() + newDuration).toISOString()
      }
    });
  }

  /**
   * Force end all sessions for a user (emergency)
   */
  async forceEndAllSessionsForUser(targetUserId: string, adminUserId: string): Promise<number> {
    const sessionsToEnd = Array.from(this.activeSessions.values())
      .filter(session => session.targetUserId === targetUserId && !session.endedAt);

    for (const session of sessionsToEnd) {
      await this.endImpersonation(session.id, adminUserId);
    }

    // Audit log
    await auditService.log({
      userId: adminUserId,
      action: AuditAction.SYSTEM_ACTION,
      entityType: 'impersonation_session',
      entityId: 'force_end_all',
      metadata: {
        targetUserId,
        endedSessionCount: sessionsToEnd.length,
        reason: 'emergency_termination'
      }
    });

    return sessionsToEnd.length;
  }

  // Private helper methods

  private async validateAdminPermissions(): Promise<void> {
    // In a real implementation, this would check user roles against allowed roles
    // For now, assume validation passes
    return;
  }

  private async validate2FA(adminUserId: string, code?: string): Promise<void> {
    if (!code) {
      throw new Error('2FA code required for impersonation');
    }

    logger.debug('Validating 2FA for admin', 'impersonation', { adminUserId });
    // In a real implementation, this would validate the 2FA code
    // For now, accept any 6-digit code
    if (!/^\d{6}$/.test(code)) {
      throw new Error('Invalid 2FA code format');
    }
  }

  private async validateTargetUser(targetUserId?: string): Promise<void> {
    // In a real implementation, this would check if target user exists
    logger.debug('Validating target user', 'impersonation', { targetUserId });
    // For now, assume validation passes
    return;
  }

  private findActiveSessionByAdmin(adminUserId: string): ImpersonationSession | undefined {
    return Array.from(this.activeSessions.values())
      .find(session => session.adminUserId === adminUserId && !session.endedAt);
  }

  private setSessionTimer(sessionId: string, duration: number): void {
    const timer = setTimeout(() => {
      this.handleSessionExpiry(sessionId);
    }, duration);

    this.sessionTimers.set(sessionId, timer);
  }

  private setWarningTimer(sessionId: string, duration: number): void {
    if (duration <= 0) return;

    const timer = setTimeout(() => {
      this.handleSessionWarning(sessionId);
    }, duration);

    this.warningTimers.set(sessionId, timer);
  }

  private clearSessionTimers(sessionId: string): void {
    const sessionTimer = this.sessionTimers.get(sessionId);
    if (sessionTimer) {
      clearTimeout(sessionTimer);
      this.sessionTimers.delete(sessionId);
    }

    const warningTimer = this.warningTimers.get(sessionId);
    if (warningTimer) {
      clearTimeout(warningTimer);
      this.warningTimers.delete(sessionId);
    }
  }

  private async handleSessionExpiry(sessionId: string): Promise<void> {
    logger.warn('Impersonation session expired', 'impersonation', { sessionId });
    
    const session = this.activeSessions.get(sessionId);
    if (session) {
      await this.endImpersonation(sessionId);
      
      // Notify about expiry
      await notificationService.publish({
        type: NotificationType.SYSTEM_ALERT,
        channel: `user:${session.adminUserId}`,
        sender: { id: 'system', name: 'System', role: 'system' },
        data: {
          type: 'impersonation_expired',
          sessionId,
          targetUserId: session.targetUserId
        }
      });
    }
  }

  private async handleSessionWarning(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      await notificationService.publish({
        type: NotificationType.SYSTEM_ALERT,
        channel: `user:${session.adminUserId}`,
        sender: { id: 'system', name: 'System', role: 'system' },
        data: {
          type: 'impersonation_warning',
          sessionId,
          targetUserId: session.targetUserId,
          expiresIn: this.config.sessionWarningTime
        }
      });
    }
  }

  private async notifyTargetUser(targetUserId: string, context: ImpersonationContext): Promise<void> {
    await notificationService.publish({
      type: NotificationType.SYSTEM_ALERT,
      channel: `user:${targetUserId}`,
      sender: { id: 'system', name: 'System', role: 'system' },
      data: {
        type: 'impersonation_started',
        sessionId: context.id,
        adminUserId: context.originalUserId,
        reason: context.reason,
        expiresAt: context.expiresAt.toISOString()
      }
    });
  }

  private async notifySessionEnd(targetUserId: string, sessionId: string): Promise<void> {
    await notificationService.publish({
      type: NotificationType.SYSTEM_ALERT,
      channel: `user:${targetUserId}`,
      sender: { id: 'system', name: 'System', role: 'system' },
      data: {
        type: 'impersonation_ended',
        sessionId
      }
    });
  }

  private saveActiveSessions(): void {
    try {
      const sessions = Array.from(this.activeSessions.entries()).map(([id, session]) => ({
        id,
        session: {
          ...session,
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endedAt?.toISOString()
        }
      }));

      localStorage.setItem('impersonationSessions', JSON.stringify(sessions));
    } catch (error) {
      logger.error('Failed to save impersonation sessions', 'impersonation', {}, error as Error);
    }
  }

  private loadActiveSessions(): void {
    try {
      const stored = localStorage.getItem('impersonationSessions');
      if (stored) {
        const sessions = JSON.parse(stored);
        
        interface StoredSession {
          id: string;
          adminUserId: string;
          targetUserId: string;
          reason: string;
          sessionToken: string;
          startedAt: string;
          endedAt?: string;
          metadata?: Record<string, unknown>;
        }
        
        sessions.forEach(({ id, session }: { id: string; session: unknown }) => {
          const sessionData = session as StoredSession;
          const restoredSession: ImpersonationSession = {
            id: sessionData.id || id,
            adminUserId: sessionData.adminUserId || '',
            targetUserId: sessionData.targetUserId || '',
            reason: sessionData.reason || '',
            sessionToken: sessionData.sessionToken || '',
            startedAt: new Date(sessionData.startedAt),
            endedAt: sessionData.endedAt ? new Date(sessionData.endedAt) : undefined,
            metadata: sessionData.metadata || {}
          };

          // Only restore active sessions that haven't expired
          const now = new Date();
          const expiryTime = new Date(restoredSession.startedAt.getTime() + this.config.maxSessionDuration);
          
          if (!restoredSession.endedAt && now < expiryTime) {
            this.activeSessions.set(id, restoredSession);
            
            // Restart timers for active sessions
            const remainingTime = expiryTime.getTime() - now.getTime();
            this.setSessionTimer(id, remainingTime);
            
            const warningTime = remainingTime - this.config.sessionWarningTime;
            if (warningTime > 0) {
              this.setWarningTimer(id, warningTime);
            }
          }
        });
      }
    } catch (error) {
      logger.error('Failed to load impersonation sessions', 'impersonation', {}, error as Error);
    }
  }

  private generateSessionId(): string {
    return `imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionToken(): string {
    return `token_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  private async getClientIP(): Promise<string> {
    // In a real implementation, this would get the client IP
    return 'unknown';
  }
}

// Global singleton instance
export const impersonationService = new ImpersonationService({
  maxSessionDuration: 30 * 60 * 1000, // 30 minutes
  require2FA: true,
  allowedRoles: ['site_admin', 'club_admin'],
  sessionWarningTime: 5 * 60 * 1000 // 5 minutes warning
});

// React hook for impersonation context
import { useEffect, useState } from 'react';

export const useImpersonationContext = () => {
  const [context, setContext] = useState<ImpersonationContext | null>(null);

  useEffect(() => {
    const updateContext = () => {
      setContext(impersonationService.getCurrentImpersonationContext());
    };

    // Initial load
    updateContext();

    // Update every second to handle expiry
    const interval = setInterval(updateContext, 1000);

    return () => clearInterval(interval);
  }, []);

  const startImpersonation = async (request: Omit<ImpersonationRequest, 'adminUserId'>) => {
    // In a real implementation, this would get the current admin user ID
    const adminUserId = 'current_admin_user';
    
    const newContext = await impersonationService.startImpersonation({
      ...request,
      adminUserId
    });
    
    setContext(newContext);
    return newContext;
  };

  const endImpersonation = async () => {
    if (context) {
      await impersonationService.endImpersonation(context.id);
      setContext(null);
    }
  };

  return {
    context,
    isImpersonating: !!context?.isActive,
    startImpersonation,
    endImpersonation
  };
};