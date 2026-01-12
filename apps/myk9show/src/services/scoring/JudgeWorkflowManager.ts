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
import type {
  ScoringFormat,
  ScoringEvent,
  ConflictResolution
} from '@/types/scoring-types';
import { DEFAULT_SCORING_CONFIGS } from '@/types/scoring-types';
import { offlineScoringService } from './OfflineScoringService';
// Services imported as needed
import { getOptimalStorage } from '@/services/database/storage-adapter';
import type { StateStorage } from 'zustand/middleware';
import { generateId } from '@/utils/idUtils';

// ============================================================================
// Types and Interfaces
// ============================================================================

export type JudgeRole = 'judge' | 'head_judge' | 'steward' | 'show_secretary';
export type WorkflowStep = 'setup' | 'entry_assignment' | 'scoring' | 'review' | 'finalization' | 'completed';
export type AssignmentStrategy = 'sequential' | 'random' | 'optimized' | 'manual';

export interface JudgeCredentials {
  judgeId: string;
  judgeName: string;
  role: JudgeRole;
  certifications: string[];
  authorizedFormats: ScoringFormat[];
  licenseNumber?: string;
  organization?: string; // AKC, UKC, etc.
}

export interface JudgeSession {
  id: string;
  judgeId: string;
  classId: string;
  format: ScoringFormat;
  role: JudgeRole;
  
  // Workflow state
  currentStep: WorkflowStep;
  startTime: Date;
  endTime?: Date;
  isActive: boolean;
  
  // Entry management
  assignedEntries: string[];
  completedEntries: string[];
  currentEntryId?: string;
  entryAssignmentStrategy: AssignmentStrategy;
  
  // Session configuration
  allowRetry: boolean;
  requireConfirmation: boolean;
  enableRealTimeSync: boolean;
  autoAdvance: boolean;
  
  // Performance tracking
  averageTimePerEntry?: number;
  totalEntriesScored: number;
  errorCount: number;
  lastActivity: Date;
  
  // Offline support
  isOffline: boolean;
  pendingActions: WorkflowAction[];
  syncStatus: 'synced' | 'pending' | 'error';
}

export interface WorkflowAction {
  id: string;
  type: 'score_entry' | 'entry_assignment' | 'workflow_step' | 'conflict_resolution';
  timestamp: Date;
  data: Record<string, unknown>;
  status: 'pending' | 'completed' | 'failed';
  attempts: number;
}

export interface EntryAssignment {
  entryId: string;
  judgeId: string;
  assignedAt: Date;
  priority: number;
  estimatedDuration?: number;
  specialRequirements?: string[];
  status: 'assigned' | 'in_progress' | 'completed' | 'skipped' | 'reassigned';
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  format: ScoringFormat;
  steps: WorkflowStepDefinition[];
  defaultSettings: Partial<JudgeSession>;
  isCustom: boolean;
}

export interface WorkflowStepDefinition {
  step: WorkflowStep;
  name: string;
  description: string;
  required: boolean;
  allowSkip: boolean;
  estimatedDuration?: number;
  prerequisites?: WorkflowStep[];
  actions: string[];
}

export interface JudgePerformanceMetrics {
  judgeId: string;
  period: 'day' | 'week' | 'month';
  
  // Scoring metrics
  totalEntriesScored: number;
  averageTimePerEntry: number;
  errorRate: number;
  revisionRate: number;
  
  // Quality metrics
  validationSuccessRate: number;
  conflictRate: number;
  consistencyScore: number;
  
  // Workflow metrics
  sessionCompletionRate: number;
  averageSessionDuration: number;
  stepSkipRate: number;
  
  // Period comparison
  periodStart: Date;
  periodEnd: Date;
  previousPeriodComparison?: {
    entriesChange: number;
    timeChange: number;
    errorChange: number;
  };
}

// ============================================================================
// Judge Workflow Manager Implementation
// ============================================================================

export class JudgeWorkflowManager extends EventEmitter {
  private storage!: StateStorage;
  
  // Session and state management
  private activeSessions = new Map<string, JudgeSession>();
  private judgeCredentials = new Map<string, JudgeCredentials>();
  private entryAssignments = new Map<string, EntryAssignment[]>(); // classId -> assignments
  private workflowTemplates = new Map<string, WorkflowTemplate>();
  
  // Performance tracking
  private performanceMetrics = new Map<string, JudgePerformanceMetrics>();
  private activityLog: WorkflowAction[] = [];
  
  // Configuration
  private isInitialized = false;

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
      await this.loadPersistedData();
      await this.initializeDefaultTemplates();
      
      // Set up event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      this.emit('service_initialized', {});
    } catch (error) {
      logger.error('Failed to initialize judge workflow manager:', 'scoring', {}, error as Error);
      this.emit('service_error', { error: (error as Error).message });
    }
  }

  private async loadPersistedData(): Promise<void> {
    try {
      // Load active sessions
      const sessions = await this.storage.getItem('judge_sessions') || '{}';
      const sessionData = JSON.parse(sessions);
      Object.entries(sessionData).forEach(([id, data]: [string, unknown]) => {
        this.activeSessions.set(id, this.deserializeSession(data));
      });

      // Load judge credentials
      const credentials = await this.storage.getItem('judge_credentials') || '{}';
      const credData = JSON.parse(credentials);
      Object.entries(credData).forEach(([id, cred]: [string, unknown]) => {
        this.judgeCredentials.set(id, cred as JudgeCredentials);
      });

      // Load entry assignments
      const assignments = await this.storage.getItem('entry_assignments') || '{}';
      const assignData = JSON.parse(assignments);
      Object.entries(assignData).forEach(([classId, assigns]: [string, unknown]) => {
        this.entryAssignments.set(classId, assigns as EntryAssignment[]);
      });

      // Load workflow templates
      const templates = await this.storage.getItem('workflow_templates') || '{}';
      const templateData = JSON.parse(templates);
      Object.entries(templateData).forEach(([id, template]: [string, unknown]) => {
        this.workflowTemplates.set(id, template as WorkflowTemplate);
      });

      // Load performance metrics
      const metrics = await this.storage.getItem('judge_performance') || '{}';
      const metricsData = JSON.parse(metrics);
      Object.entries(metricsData).forEach(([judgeId, metric]: [string, unknown]) => {
        this.performanceMetrics.set(judgeId, {
          ...(metric as JudgePerformanceMetrics),
          periodStart: new Date((metric as JudgePerformanceMetrics).periodStart),
          periodEnd: new Date((metric as JudgePerformanceMetrics).periodEnd)
        });
      });

    } catch (error) {
      logger.error('Failed to load persisted workflow data:', 'scoring', {}, error as Error);
    }
  }

  private async initializeDefaultTemplates(): Promise<void> {
    // Create default workflow templates for each format
    const formats: ScoringFormat[] = Object.keys(DEFAULT_SCORING_CONFIGS) as ScoringFormat[];
    
    for (const format of formats) {
      const template = this.createDefaultWorkflowTemplate(format);
      this.workflowTemplates.set(template.id, template);
    }
  }

  private setupEventListeners(): void {
    // Listen to scoring service events
    offlineScoringService.on('score_submitted', (data: unknown) => this.handleScoreSubmitted(data as ScoringEvent));
    offlineScoringService.on('session_started', (data: unknown) => this.handleScoringSessionStarted(data as ScoringEvent));
    offlineScoringService.on('session_completed', (data: unknown) => this.handleScoringSessionCompleted(data as ScoringEvent));
    offlineScoringService.on('multi_judge_score_updated', (data: unknown) => this.handleMultiJudgeScore(data as ScoringEvent));

    // Listen to validation events
    // scoreValidatorService.on('validation_failed', this.handleValidationFailed.bind(this));
  }

  // ========================================================================
  // Judge Authentication and Session Management
  // ========================================================================

  /**
   * Authenticate a judge and create credentials
   */
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
    await this.persistCredentials();

    this.emit('judge_authenticated', { judgeId, role });
    return credentials;
  }

  /**
   * Start a judging session for a class
   */
  async startJudgingSession(
    judgeId: string,
    classId: string,
    format: ScoringFormat,
    options: Partial<JudgeSession> = {}
  ): Promise<JudgeSession> {
    // Validate judge authorization
    const credentials = this.judgeCredentials.get(judgeId);
    if (!credentials) {
      throw new Error(`Judge ${judgeId} not authenticated`);
    }

    if (!credentials.authorizedFormats.includes(format)) {
      throw new Error(`Judge ${judgeId} not authorized for format ${format}`);
    }

    // Check for existing active session
    const existingSession = this.getActiveSession(judgeId, classId);
    if (existingSession) {
      throw new Error(`Judge ${judgeId} already has active session for class ${classId}`);
    }

    // Create new session
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
    await this.persistSessions();

    // Initialize scoring service session
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

  /**
   * End a judging session
   */
  async endJudgingSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.isActive = false;
    session.endTime = new Date();
    session.currentStep = 'completed';

    // Update performance metrics
    await this.updatePerformanceMetrics(session);

    // End scoring service session
    await offlineScoringService.endSession(sessionId);

    await this.persistSessions();

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

  /**
   * Advance to the next workflow step
   */
  async advanceWorkflowStep(sessionId: string, targetStep?: WorkflowStep): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const template = this.getWorkflowTemplate(session.format);
    const currentStepIndex = template.steps.findIndex(s => s.step === session.currentStep);
    
    let nextStep: WorkflowStep;
    
    if (targetStep) {
      // Validate target step is valid
      const targetStepDef = template.steps.find(s => s.step === targetStep);
      if (!targetStepDef) {
        throw new Error(`Invalid target step: ${targetStep}`);
      }
      
      // Check prerequisites
      const hasPrerequisites = targetStepDef.prerequisites?.every(prereq => 
        this.isStepCompleted(session, prereq)
      ) ?? true;
      
      if (!hasPrerequisites) {
        throw new Error(`Prerequisites not met for step: ${targetStep}`);
      }
      
      nextStep = targetStep;
    } else {
      // Advance to next step in sequence
      if (currentStepIndex >= template.steps.length - 1) {
        throw new Error('Already at final workflow step');
      }
      nextStep = template.steps[currentStepIndex + 1].step;
    }

    const previousStep = session.currentStep;
    session.currentStep = nextStep;
    session.lastActivity = new Date();

    // Execute step-specific actions
    await this.executeStepActions(session, nextStep);

    await this.persistSessions();

    this.emit('workflow_step_advanced', {
      sessionId,
      judgeId: session.judgeId,
      previousStep,
      currentStep: nextStep
    });
  }

  /**
   * Execute actions for a workflow step
   */
  private async executeStepActions(session: JudgeSession, step: WorkflowStep): Promise<void> {
    switch (step) {
      case 'setup':
        await this.executeSetupActions(session);
        break;
      case 'entry_assignment':
        await this.executeEntryAssignmentActions(session);
        break;
      case 'scoring':
        await this.executeScoringActions(session);
        break;
      case 'review':
        await this.executeReviewActions(session);
        break;
      case 'finalization':
        await this.executeFinalizationActions(session);
        break;
    }
  }

  private async executeSetupActions(session: JudgeSession): Promise<void> {
    // Initialize session configuration
    // Validate judge permissions
    // Set up scoring interface
    this.logAction(session.id, 'workflow_step', { step: 'setup' });
  }

  private async executeEntryAssignmentActions(session: JudgeSession): Promise<void> {
    // Assign entries to judge based on strategy
    await this.assignEntriesToJudge(session);
    this.logAction(session.id, 'entry_assignment', { 
      strategy: session.entryAssignmentStrategy,
      entryCount: session.assignedEntries.length
    });
  }

  private async executeScoringActions(session: JudgeSession): Promise<void> {
    // Set up scoring interface
    // Enable real-time scoring
    this.logAction(session.id, 'workflow_step', { step: 'scoring' });
  }

  private async executeReviewActions(session: JudgeSession): Promise<void> {
    // Calculate placements
    // Check for conflicts
    // Generate review summary
    await this.generateReviewSummary(session);
    this.logAction(session.id, 'workflow_step', { step: 'review' });
  }

  private async executeFinalizationActions(session: JudgeSession): Promise<void> {
    // Finalize scores
    // Generate reports
    // Submit to show management
    await this.finalizeScores(session);
    this.logAction(session.id, 'workflow_step', { step: 'finalization' });
  }

  // ========================================================================
  // Entry Assignment Management
  // ========================================================================

  /**
   * Assign entries to judge based on strategy
   */
  async assignEntriesToJudge(session: JudgeSession): Promise<void> {
    // Get available entries for the class
    const availableEntries = await this.getAvailableEntries(session.classId);
    
    let assignments: EntryAssignment[];
    
    switch (session.entryAssignmentStrategy) {
      case 'sequential':
        assignments = this.createSequentialAssignments(availableEntries, session.judgeId);
        break;
      case 'random':
        assignments = this.createRandomAssignments(availableEntries, session.judgeId);
        break;
      case 'optimized':
        assignments = await this.createOptimizedAssignments(availableEntries, session);
        break;
      case 'manual':
        // Manual assignments would be set externally
        assignments = this.entryAssignments.get(session.classId) || [];
        break;
      default:
        assignments = this.createSequentialAssignments(availableEntries, session.judgeId);
    }

    // Filter assignments for this judge
    const judgeAssignments = assignments.filter(a => a.judgeId === session.judgeId);
    session.assignedEntries = judgeAssignments.map(a => a.entryId);

    // Store assignments
    this.entryAssignments.set(session.classId, assignments);
    await this.persistAssignments();

    this.emit('entries_assigned', {
      sessionId: session.id,
      judgeId: session.judgeId,
      classId: session.classId,
      entryCount: session.assignedEntries.length,
      strategy: session.entryAssignmentStrategy
    });
  }

  private createSequentialAssignments(entries: string[], judgeId: string): EntryAssignment[] {
    return entries.map((entryId, index) => ({
      entryId,
      judgeId,
      assignedAt: new Date(),
      priority: index + 1,
      status: 'assigned'
    }));
  }

  private createRandomAssignments(entries: string[], judgeId: string): EntryAssignment[] {
    const shuffled = [...entries].sort(() => Math.random() - 0.5);
    return this.createSequentialAssignments(shuffled, judgeId);
  }

  private async createOptimizedAssignments(
    entries: string[],
    session: JudgeSession
  ): Promise<EntryAssignment[]> {
    // Optimize based on judge performance, entry complexity, etc.
    // For now, use sequential assignment
    return this.createSequentialAssignments(entries, session.judgeId);
  }

  /**
   * Get next entry for judge to score
   */
  getNextEntry(sessionId: string): string | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    // Find next unscored entry
    const nextEntry = session.assignedEntries.find(entryId => 
      !session.completedEntries.includes(entryId)
    );

    if (nextEntry) {
      session.currentEntryId = nextEntry;
      session.lastActivity = new Date();
    }

    return nextEntry || null;
  }

  /**
   * Mark entry as completed
   */
  async markEntryCompleted(sessionId: string, entryId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.completedEntries.includes(entryId)) {
      session.completedEntries.push(entryId);
      session.totalEntriesScored++;
      session.lastActivity = new Date();

      // Update assignment status
      const assignments = this.entryAssignments.get(session.classId) || [];
      const assignment = assignments.find(a => a.entryId === entryId && a.judgeId === session.judgeId);
      if (assignment) {
        assignment.status = 'completed';
      }

      // Auto-advance to next entry if enabled
      if (session.autoAdvance) {
        session.currentEntryId = this.getNextEntry(sessionId) || undefined;
      }

      await this.persistSessions();
      await this.persistAssignments();

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
  // Conflict Resolution and Multi-Judge Support
  // ========================================================================

  /**
   * Handle multi-judge scoring conflicts
   */
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
  // Performance Tracking and Analytics
  // ========================================================================

  private async updatePerformanceMetrics(session: JudgeSession): Promise<void> {
    const judgeId = session.judgeId;
    const existing = this.performanceMetrics.get(judgeId);
    
    const sessionDuration = session.endTime!.getTime() - session.startTime.getTime();
    const avgTimePerEntry = session.totalEntriesScored > 0 ? 
      sessionDuration / session.totalEntriesScored : 0;

    const metrics: JudgePerformanceMetrics = {
      judgeId,
      period: 'day',
      totalEntriesScored: (existing?.totalEntriesScored || 0) + session.totalEntriesScored,
      averageTimePerEntry: avgTimePerEntry,
      errorRate: session.errorCount / Math.max(session.totalEntriesScored, 1),
      revisionRate: 0, // Would be calculated from revision history
      validationSuccessRate: 1 - (session.errorCount / Math.max(session.totalEntriesScored, 1)),
      conflictRate: 0, // Would be calculated from conflicts
      consistencyScore: 1, // Would be calculated from scoring patterns
      sessionCompletionRate: 1, // Session was completed
      averageSessionDuration: sessionDuration,
      stepSkipRate: 0, // Would track skipped steps
      periodStart: existing?.periodStart || session.startTime,
      periodEnd: session.endTime!
    };

    this.performanceMetrics.set(judgeId, metrics);
    await this.persistMetrics();
  }

  /**
   * Get performance metrics for a judge
   */
  getJudgePerformanceMetrics(judgeId: string): JudgePerformanceMetrics | null {
    return this.performanceMetrics.get(judgeId) || null;
  }

  // ========================================================================
  // Workflow Templates
  // ========================================================================

  private createDefaultWorkflowTemplate(format: ScoringFormat): WorkflowTemplate {
    const steps: WorkflowStepDefinition[] = [
      {
        step: 'setup',
        name: 'Setup',
        description: 'Initialize judging session and validate permissions',
        required: true,
        allowSkip: false,
        estimatedDuration: 300000, // 5 minutes
        actions: ['validate_judge', 'setup_interface']
      },
      {
        step: 'entry_assignment',
        name: 'Entry Assignment',
        description: 'Assign entries to judge for scoring',
        required: true,
        allowSkip: false,
        prerequisites: ['setup'],
        estimatedDuration: 180000, // 3 minutes
        actions: ['assign_entries', 'validate_assignments']
      },
      {
        step: 'scoring',
        name: 'Scoring',
        description: 'Score assigned entries',
        required: true,
        allowSkip: false,
        prerequisites: ['entry_assignment'],
        actions: ['enable_scoring', 'track_progress']
      },
      {
        step: 'review',
        name: 'Review',
        description: 'Review scores and calculate placements',
        required: true,
        allowSkip: false,
        prerequisites: ['scoring'],
        estimatedDuration: 600000, // 10 minutes
        actions: ['calculate_placements', 'check_conflicts', 'generate_summary']
      },
      {
        step: 'finalization',
        name: 'Finalization',
        description: 'Finalize scores and submit results',
        required: true,
        allowSkip: false,
        prerequisites: ['review'],
        estimatedDuration: 300000, // 5 minutes
        actions: ['finalize_scores', 'generate_reports', 'submit_results']
      }
    ];

    return {
      id: `default_${format}`,
      name: `Default ${format.replace('_', ' ')} Workflow`,
      format,
      steps,
      defaultSettings: {
        allowRetry: true,
        requireConfirmation: true,
        enableRealTimeSync: true,
        autoAdvance: false
      },
      isCustom: false
    };
  }

  private getWorkflowTemplate(format: ScoringFormat): WorkflowTemplate {
    return this.workflowTemplates.get(`default_${format}`) || 
           this.createDefaultWorkflowTemplate(format);
  }

  // ========================================================================
  // Event Handlers
  // ========================================================================

  private async handleScoreSubmitted(event: ScoringEvent): Promise<void> {
    if (!event.data) return;
    
    const eventData = event.data as Record<string, string>;
    const judgeId = eventData.judgeId;
    const entryId = eventData.entryId;
    const classId = eventData.classId;
    
    if (!judgeId || !entryId || !classId) return;
    
    // Find active session for this judge and class
    const session = Array.from(this.activeSessions.values()).find(s =>
      s.judgeId === judgeId && s.classId === classId && s.isActive
    );

    if (session) {
      await this.markEntryCompleted(session.id, entryId);
    }
  }

  private async handleScoringSessionStarted(event: ScoringEvent): Promise<void> {
    // Handle scoring service session start
    this.emit('scoring_service_session_started', event.data);
  }

  private async handleScoringSessionCompleted(event: ScoringEvent): Promise<void> {
    // Handle scoring service session completion
    this.emit('scoring_service_session_completed', event.data);
  }

  private async handleMultiJudgeScore(event: ScoringEvent): Promise<void> {
    // Handle multi-judge score updates
    if (event.data && (event.data as Record<string, unknown>).hasConflicts) {
      this.emit('judge_conflict_detected', event.data);
    }
  }

  private async handleValidationFailed(event: ScoringEvent): Promise<void> {
    // Update error count for session
    if (!event.data) return;
    
    const eventData = event.data as Record<string, string>;
    const judgeId = eventData.judgeId;
    const classId = eventData.classId;
    
    if (!judgeId || !classId) return;
    
    const session = Array.from(this.activeSessions.values()).find(s =>
      s.judgeId === judgeId && s.classId === classId && s.isActive
    );

    if (session) {
      session.errorCount++;
      session.lastActivity = new Date();
      await this.persistSessions();
    }
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  private getActiveSession(judgeId: string, classId: string): JudgeSession | null {
    return Array.from(this.activeSessions.values()).find(s =>
      s.judgeId === judgeId && s.classId === classId && s.isActive
    ) || null;
  }

  private async getAvailableEntries(classId: string): Promise<string[]> {
    // This would query the entry store for entries in this class
    // For now, return mock data
    return [`entry-${classId}-1`, `entry-${classId}-2`, `entry-${classId}-3`];
  }

  private isStepCompleted(session: JudgeSession, step: WorkflowStep): boolean {
    const template = this.getWorkflowTemplate(session.format);
    const stepIndex = template.steps.findIndex(s => s.step === step);
    const currentIndex = template.steps.findIndex(s => s.step === session.currentStep);
    
    return stepIndex < currentIndex;
  }

  private async generateReviewSummary(session: JudgeSession): Promise<void> {
    // Generate review summary for the session
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
    // Finalize all scores for the class
    this.emit('scores_finalized', {
      sessionId: session.id,
      judgeId: session.judgeId,
      classId: session.classId
    });
  }

  private logAction(sessionId: string, type: WorkflowAction['type'], data: Record<string, unknown>): void {
    const action: WorkflowAction = {
      id: generateId(),
      type,
      timestamp: new Date(),
      data,
      status: 'completed',
      attempts: 1
    };

    this.activityLog.push(action);

    // Limit activity log size
    if (this.activityLog.length > 1000) {
      this.activityLog.shift();
    }
  }

  // ========================================================================
  // Persistence Methods
  // ========================================================================

  private async persistSessions(): Promise<void> {
    const sessions = Object.fromEntries(
      Array.from(this.activeSessions.entries()).map(([id, session]) => [
        id,
        this.serializeSession(session)
      ])
    );
    await this.storage.setItem('judge_sessions', JSON.stringify(sessions));
  }

  private async persistCredentials(): Promise<void> {
    const credentials = Object.fromEntries(this.judgeCredentials);
    await this.storage.setItem('judge_credentials', JSON.stringify(credentials));
  }

  private async persistAssignments(): Promise<void> {
    const assignments = Object.fromEntries(this.entryAssignments);
    await this.storage.setItem('entry_assignments', JSON.stringify(assignments));
  }

  private async persistMetrics(): Promise<void> {
    const metrics = Object.fromEntries(
      Array.from(this.performanceMetrics.entries()).map(([judgeId, metric]) => [
        judgeId,
        {
          ...metric,
          periodStart: metric.periodStart.toISOString(),
          periodEnd: metric.periodEnd.toISOString()
        }
      ])
    );
    await this.storage.setItem('judge_performance', JSON.stringify(metrics));
  }

  private serializeSession(session: JudgeSession): Record<string, unknown> {
    return {
      ...session,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime?.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      pendingActions: session.pendingActions.map(action => ({
        ...action,
        timestamp: action.timestamp.toISOString()
      }))
    };
  }

  private deserializeSession(data: unknown): JudgeSession {
    const sessionData = data as Record<string, unknown>;
    return {
      ...sessionData,
      startTime: new Date(sessionData.startTime as string),
      endTime: sessionData.endTime ? new Date(sessionData.endTime as string) : undefined,
      lastActivity: new Date(sessionData.lastActivity as string),
      pendingActions: ((sessionData.pendingActions || []) as WorkflowAction[]).map((action) => ({
        ...action,
        timestamp: new Date(action.timestamp as string | Date)
      })) as WorkflowAction[]
    } as JudgeSession;
  }

  // ========================================================================
  // Public API Methods
  // ========================================================================

  /**
   * Get all active sessions
   */
  getActiveSessions(): JudgeSession[] {
    return Array.from(this.activeSessions.values()).filter(s => s.isActive);
  }

  /**
   * Get sessions for a specific judge
   */
  getJudgeSessions(judgeId: string): JudgeSession[] {
    return Array.from(this.activeSessions.values()).filter(s => s.judgeId === judgeId);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): JudgeSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get judge credentials
   */
  getJudgeCredentials(judgeId: string): JudgeCredentials | null {
    return this.judgeCredentials.get(judgeId) || null;
  }

  /**
   * Get service statistics
   */
  getStatistics(): {
    activeSessions: number;
    totalJudges: number;
    totalEntriesScored: number;
    averageSessionDuration: number;
  } {
    const activeSessions = this.getActiveSessions();
    const totalEntriesScored = Array.from(this.activeSessions.values())
      .reduce((sum, session) => sum + session.totalEntriesScored, 0);
    
    const completedSessions = Array.from(this.activeSessions.values())
      .filter(s => !s.isActive && s.endTime);
    
    const avgDuration = completedSessions.length > 0 ?
      completedSessions.reduce((sum, session) => {
        return sum + (session.endTime!.getTime() - session.startTime.getTime());
      }, 0) / completedSessions.length : 0;

    return {
      activeSessions: activeSessions.length,
      totalJudges: this.judgeCredentials.size,
      totalEntriesScored,
      averageSessionDuration: avgDuration
    };
  }

  /**
   * Cleanup completed sessions and old data
   */
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    // Remove old completed sessions
    for (const [id, session] of this.activeSessions.entries()) {
      if (!session.isActive && session.endTime && session.endTime < cutoff) {
        this.activeSessions.delete(id);
      }
    }

    // Cleanup activity log
    this.activityLog = this.activityLog.filter(action => action.timestamp > cutoff);

    await this.persistSessions();
  }
}

// Singleton instance
export const judgeWorkflowManager = new JudgeWorkflowManager();