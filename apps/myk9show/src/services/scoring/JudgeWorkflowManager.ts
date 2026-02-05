/**
 * Judge Workflow Manager
 *
 * Manages judge-specific scoring workflows, authentication, permissions,
 * and workflow orchestration for different competition formats.
 * Provides offline-first judge experience with role-based access control.
 *
 * Key Features:
 * - Judge authentication and session management
 * - Role-based permissions (judge, head judge, steward)
 * - Format-specific workflow orchestration
 * - Entry assignment and progress tracking
 * - Multi-judge coordination and conflict resolution
 * - Offline workflow state management
 * - Judge performance analytics
 * - Workflow templates and customization
 */

import { EventEmitter } from '../sync/eventEmitter';
import { logger } from '@/services/LoggingService';
import type { ScoringFormat, ScoringEvent, ConflictResolution } from '@/types/scoring-types';
import { offlineScoringService } from './OfflineScoringService';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import type { StateStorage } from 'zustand/middleware';
import { generateId } from '@/utils/idUtils';

// Import extracted modules
import type {
  JudgeRole,
  WorkflowStep,
  JudgeCredentials,
  JudgeSession,
  WorkflowAction,
  EntryAssignment,
  WorkflowTemplate,
  JudgePerformanceMetrics,
  JudgeWorkflowStatistics
} from './judge-workflow-types';
import {
  getAssignmentsByStrategy,
  filterAssignmentsForJudge,
  getEntryIdsFromAssignments
} from './entryAssignmentStrategies';
import {
  getAllDefaultWorkflowTemplates,
  getWorkflowTemplate,
  arePrerequisitesMet,
  getNextStep
} from './workflowTemplates';
import {
  loadPersistedData,
  persistSessions,
  persistCredentials,
  persistAssignments,
  persistMetrics
} from './judgeWorkflowPersistence';

// Re-export types for backward compatibility
export type {
  JudgeRole,
  WorkflowStep,
  AssignmentStrategy,
  JudgeCredentials,
  JudgeSession,
  WorkflowAction,
  EntryAssignment,
  WorkflowTemplate,
  WorkflowStepDefinition,
  JudgePerformanceMetrics
} from './judge-workflow-types';

// ============================================================================
// Judge Workflow Manager Implementation
// ============================================================================

export class JudgeWorkflowManager extends EventEmitter {
  private storage!: StateStorage;

  // Session and state management
  private activeSessions = new Map<string, JudgeSession>();
  private judgeCredentials = new Map<string, JudgeCredentials>();
  private entryAssignments = new Map<string, EntryAssignment[]>();
  private workflowTemplates = new Map<string, WorkflowTemplate>();

  // Performance tracking
  private performanceMetrics = new Map<string, JudgePerformanceMetrics>();
  private activityLog: WorkflowAction[] = [];

  constructor() {
    super();
    this.initializeService();
  }

  // ========================================================================
  // Initialization and Setup
  // ========================================================================

  private async initializeService(): Promise<void> {
    try {
      this.storage = getOptimalStorage('judge-workflow');

      // Load persisted data using extracted utility
      const data = await loadPersistedData(this.storage);
      this.activeSessions = data.sessions;
      this.judgeCredentials = data.credentials;
      this.entryAssignments = data.assignments;
      this.performanceMetrics = data.metrics;

      // Merge loaded templates with defaults
      this.workflowTemplates = getAllDefaultWorkflowTemplates();
      data.templates.forEach((template, id) => {
        this.workflowTemplates.set(id, template);
      });

      this.setupEventListeners();
      this.emit('service_initialized', {});
    } catch (error) {
      logger.error('Failed to initialize judge workflow manager:', 'scoring', {}, error as Error);
      this.emit('service_error', { error: (error as Error).message });
    }
  }

  private setupEventListeners(): void {
    offlineScoringService.on('score_submitted', (data: unknown) =>
      this.handleScoreSubmitted(data as ScoringEvent)
    );
    offlineScoringService.on('session_started', (data: unknown) =>
      this.handleScoringSessionStarted(data as ScoringEvent)
    );
    offlineScoringService.on('session_completed', (data: unknown) =>
      this.handleScoringSessionCompleted(data as ScoringEvent)
    );
    offlineScoringService.on('multi_judge_score_updated', (data: unknown) =>
      this.handleMultiJudgeScore(data as ScoringEvent)
    );
  }

  // ========================================================================
  // Judge Authentication and Session Management
  // ========================================================================

  async authenticateJudge(
    judgeId: string,
    judgeName: string,
    role: JudgeRole,
    certifications: string[],
    authorizedFormats: ScoringFormat[]
  ): Promise<JudgeCredentials> {
    const credentials: JudgeCredentials = {
      judgeId,
      judgeName,
      role,
      certifications,
      authorizedFormats
    };

    this.judgeCredentials.set(judgeId, credentials);
    await persistCredentials(this.storage, this.judgeCredentials);

    this.emit('judge_authenticated', { judgeId, role });
    return credentials;
  }

  async startJudgingSession(
    judgeId: string,
    classId: string,
    format: ScoringFormat,
    options: Partial<JudgeSession> = {}
  ): Promise<JudgeSession> {
    const credentials = this.judgeCredentials.get(judgeId);
    if (!credentials) {
      throw new Error(`Judge ${judgeId} not authenticated`);
    }

    if (!credentials.authorizedFormats.includes(format)) {
      throw new Error(`Judge ${judgeId} not authorized for format ${format}`);
    }

    const existingSession = this.getActiveSession(judgeId, classId);
    if (existingSession) {
      throw new Error(`Judge ${judgeId} already has active session for class ${classId}`);
    }

    const sessionId = generateId();
    const session: JudgeSession = {
      id: sessionId,
      judgeId,
      classId,
      format,
      role: credentials.role,
      currentStep: 'setup',
      startTime: new Date(),
      isActive: true,
      assignedEntries: [],
      completedEntries: [],
      entryAssignmentStrategy: 'sequential',
      allowRetry: true,
      requireConfirmation: true,
      enableRealTimeSync: true,
      autoAdvance: false,
      totalEntriesScored: 0,
      errorCount: 0,
      lastActivity: new Date(),
      isOffline: !navigator.onLine,
      pendingActions: [],
      syncStatus: 'synced',
      ...options
    };

    this.activeSessions.set(sessionId, session);
    await persistSessions(this.storage, this.activeSessions);
    await offlineScoringService.startSession(classId, judgeId, format, 0);

    this.emit('judging_session_started', {
      sessionId,
      judgeId,
      classId,
      format,
      role: credentials.role
    });

    return session;
  }

  async endJudgingSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.isActive = false;
    session.endTime = new Date();
    session.currentStep = 'completed';

    await this.updatePerformanceMetrics(session);
    await offlineScoringService.endSession(sessionId);
    await persistSessions(this.storage, this.activeSessions);

    this.emit('judging_session_ended', {
      sessionId,
      judgeId: session.judgeId,
      classId: session.classId,
      duration: session.endTime.getTime() - session.startTime.getTime(),
      totalScored: session.totalEntriesScored
    });
  }

  // ========================================================================
  // Workflow Step Management
  // ========================================================================

  async advanceWorkflowStep(sessionId: string, targetStep?: WorkflowStep): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const template = getWorkflowTemplate(session.format, this.workflowTemplates);
    let nextStep: WorkflowStep;

    if (targetStep) {
      if (!arePrerequisitesMet(targetStep, session, template)) {
        throw new Error(`Prerequisites not met for step: ${targetStep}`);
      }
      nextStep = targetStep;
    } else {
      const next = getNextStep(session.currentStep, template);
      if (!next) {
        throw new Error('Already at final workflow step');
      }
      nextStep = next;
    }

    const previousStep = session.currentStep;
    session.currentStep = nextStep;
    session.lastActivity = new Date();

    await this.executeStepActions(session, nextStep);
    await persistSessions(this.storage, this.activeSessions);

    this.emit('workflow_step_advanced', {
      sessionId,
      judgeId: session.judgeId,
      previousStep,
      currentStep: nextStep
    });
  }

  private async executeStepActions(session: JudgeSession, step: WorkflowStep): Promise<void> {
    switch (step) {
      case 'setup':
        this.logAction(session.id, 'workflow_step', { step: 'setup' });
        break;
      case 'entry_assignment':
        await this.assignEntriesToJudge(session);
        this.logAction(session.id, 'entry_assignment', {
          strategy: session.entryAssignmentStrategy,
          entryCount: session.assignedEntries.length
        });
        break;
      case 'scoring':
        this.logAction(session.id, 'workflow_step', { step: 'scoring' });
        break;
      case 'review':
        await this.generateReviewSummary(session);
        this.logAction(session.id, 'workflow_step', { step: 'review' });
        break;
      case 'finalization':
        await this.finalizeScores(session);
        this.logAction(session.id, 'workflow_step', { step: 'finalization' });
        break;
    }
  }

  // ========================================================================
  // Entry Assignment Management
  // ========================================================================

  async assignEntriesToJudge(session: JudgeSession): Promise<void> {
    const availableEntries = await this.getAvailableEntries(session.classId);
    const existingAssignments = this.entryAssignments.get(session.classId);

    const assignments = await getAssignmentsByStrategy(
      availableEntries,
      session.entryAssignmentStrategy,
      session,
      existingAssignments
    );

    const judgeAssignments = filterAssignmentsForJudge(assignments, session.judgeId);
    session.assignedEntries = getEntryIdsFromAssignments(judgeAssignments);

    this.entryAssignments.set(session.classId, assignments);
    await persistAssignments(this.storage, this.entryAssignments);

    this.emit('entries_assigned', {
      sessionId: session.id,
      judgeId: session.judgeId,
      classId: session.classId,
      entryCount: session.assignedEntries.length,
      strategy: session.entryAssignmentStrategy
    });
  }

  getNextEntry(sessionId: string): string | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    const nextEntry = session.assignedEntries.find(
      entryId => !session.completedEntries.includes(entryId)
    );

    if (nextEntry) {
      session.currentEntryId = nextEntry;
      session.lastActivity = new Date();
    }

    return nextEntry || null;
  }

  async markEntryCompleted(sessionId: string, entryId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.completedEntries.includes(entryId)) {
      session.completedEntries.push(entryId);
      session.totalEntriesScored++;
      session.lastActivity = new Date();

      const assignments = this.entryAssignments.get(session.classId) || [];
      const assignment = assignments.find(
        a => a.entryId === entryId && a.judgeId === session.judgeId
      );
      if (assignment) {
        assignment.status = 'completed';
      }

      if (session.autoAdvance) {
        const nextEntry = this.getNextEntry(sessionId);
        session.currentEntryId = nextEntry ?? undefined;
      }

      await persistSessions(this.storage, this.activeSessions);
      await persistAssignments(this.storage, this.entryAssignments);

      this.emit('entry_completed', {
        sessionId,
        judgeId: session.judgeId,
        entryId,
        completedCount: session.completedEntries.length,
        totalAssigned: session.assignedEntries.length
      });
    }
  }

  // ========================================================================
  // Conflict Resolution
  // ========================================================================

  async resolveConflict(
    classId: string,
    entryId: string,
    resolution: ConflictResolution
  ): Promise<void> {
    const action: WorkflowAction = {
      id: generateId(),
      type: 'conflict_resolution',
      timestamp: new Date(),
      data: { classId, entryId, resolution },
      status: 'completed',
      attempts: 1
    };

    this.logAction(`conflict-${classId}-${entryId}`, 'conflict_resolution', action.data);

    this.emit('conflict_resolved', {
      classId,
      entryId,
      resolution: resolution.strategy,
      resolvedBy: resolution.resolvedBy
    });
  }

  // ========================================================================
  // Performance Tracking
  // ========================================================================

  private async updatePerformanceMetrics(session: JudgeSession): Promise<void> {
    const judgeId = session.judgeId;
    const existing = this.performanceMetrics.get(judgeId);

    const sessionDuration = session.endTime!.getTime() - session.startTime.getTime();
    const avgTimePerEntry =
      session.totalEntriesScored > 0 ? sessionDuration / session.totalEntriesScored : 0;

    const metrics: JudgePerformanceMetrics = {
      judgeId,
      period: 'day',
      totalEntriesScored: (existing?.totalEntriesScored || 0) + session.totalEntriesScored,
      averageTimePerEntry: avgTimePerEntry,
      errorRate: session.errorCount / Math.max(session.totalEntriesScored, 1),
      revisionRate: 0,
      validationSuccessRate: 1 - session.errorCount / Math.max(session.totalEntriesScored, 1),
      conflictRate: 0,
      consistencyScore: 1,
      sessionCompletionRate: 1,
      averageSessionDuration: sessionDuration,
      stepSkipRate: 0,
      periodStart: existing?.periodStart || session.startTime,
      periodEnd: session.endTime!
    };

    this.performanceMetrics.set(judgeId, metrics);
    await persistMetrics(this.storage, this.performanceMetrics);
  }

  getJudgePerformanceMetrics(judgeId: string): JudgePerformanceMetrics | null {
    return this.performanceMetrics.get(judgeId) || null;
  }

  // ========================================================================
  // Event Handlers
  // ========================================================================

  private async handleScoreSubmitted(event: ScoringEvent): Promise<void> {
    if (!event.data) return;

    const eventData = event.data as Record<string, string>;
    const { judgeId, entryId, classId } = eventData;

    if (!judgeId || !entryId || !classId) return;

    const session = Array.from(this.activeSessions.values()).find(
      s => s.judgeId === judgeId && s.classId === classId && s.isActive
    );

    if (session) {
      await this.markEntryCompleted(session.id, entryId);
    }
  }

  private async handleScoringSessionStarted(event: ScoringEvent): Promise<void> {
    this.emit('scoring_service_session_started', event.data);
  }

  private async handleScoringSessionCompleted(event: ScoringEvent): Promise<void> {
    this.emit('scoring_service_session_completed', event.data);
  }

  private async handleMultiJudgeScore(event: ScoringEvent): Promise<void> {
    if (event.data && (event.data as Record<string, unknown>).hasConflicts) {
      this.emit('judge_conflict_detected', event.data);
    }
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  private getActiveSession(judgeId: string, classId: string): JudgeSession | null {
    return (
      Array.from(this.activeSessions.values()).find(
        s => s.judgeId === judgeId && s.classId === classId && s.isActive
      ) || null
    );
  }

  private async getAvailableEntries(classId: string): Promise<string[]> {
    // This would query the entry store for entries in this class
    return [`entry-${classId}-1`, `entry-${classId}-2`, `entry-${classId}-3`];
  }

  private async generateReviewSummary(session: JudgeSession): Promise<void> {
    const scores = offlineScoringService.getClassScores(session.classId);

    this.emit('review_summary_generated', {
      sessionId: session.id,
      judgeId: session.judgeId,
      classId: session.classId,
      totalScores: scores.length,
      summary: 'Review summary generated'
    });
  }

  private async finalizeScores(session: JudgeSession): Promise<void> {
    this.emit('scores_finalized', {
      sessionId: session.id,
      judgeId: session.judgeId,
      classId: session.classId
    });
  }

  private logAction(
    _sessionId: string,
    type: WorkflowAction['type'],
    data: Record<string, unknown>
  ): void {
    const action: WorkflowAction = {
      id: generateId(),
      type,
      timestamp: new Date(),
      data,
      status: 'completed',
      attempts: 1
    };

    this.activityLog.push(action);

    if (this.activityLog.length > 1000) {
      this.activityLog.shift();
    }
  }

  // ========================================================================
  // Public API Methods
  // ========================================================================

  getActiveSessions(): JudgeSession[] {
    return Array.from(this.activeSessions.values()).filter(s => s.isActive);
  }

  getJudgeSessions(judgeId: string): JudgeSession[] {
    return Array.from(this.activeSessions.values()).filter(s => s.judgeId === judgeId);
  }

  getSession(sessionId: string): JudgeSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  getJudgeCredentials(judgeId: string): JudgeCredentials | null {
    return this.judgeCredentials.get(judgeId) || null;
  }

  getStatistics(): JudgeWorkflowStatistics {
    const activeSessions = this.getActiveSessions();
    const totalEntriesScored = Array.from(this.activeSessions.values()).reduce(
      (sum, session) => sum + session.totalEntriesScored,
      0
    );

    const completedSessions = Array.from(this.activeSessions.values()).filter(
      s => !s.isActive && s.endTime
    );

    const avgDuration =
      completedSessions.length > 0
        ? completedSessions.reduce((sum, session) => {
            return sum + (session.endTime!.getTime() - session.startTime.getTime());
          }, 0) / completedSessions.length
        : 0;

    return {
      activeSessions: activeSessions.length,
      totalJudges: this.judgeCredentials.size,
      totalEntriesScored,
      averageSessionDuration: avgDuration
    };
  }

  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const [id, session] of this.activeSessions.entries()) {
      if (!session.isActive && session.endTime && session.endTime < cutoff) {
        this.activeSessions.delete(id);
      }
    }

    this.activityLog = this.activityLog.filter(action => action.timestamp > cutoff);

    await persistSessions(this.storage, this.activeSessions);
  }
}

// Singleton instance
export const judgeWorkflowManager = new JudgeWorkflowManager();
