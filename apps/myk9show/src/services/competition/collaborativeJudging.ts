/**
 * Collaborative Judging Service
 * Phase 6.2: Live Competition Features
 * 
 * Multi-judge coordination service for competitions with multiple judges,
 * providing real-time scoring synchronization and conflict resolution.
 */

import { subscriptionManager } from '../realtime/subscriptionManager';
import { errorMonitor } from '../../lib/errorMonitoring';
import { logger } from '../../services/LoggingService';
import type {
  PresenceTrackingData
} from '../../types/realtime-types';

export interface JudgeSession {
  sessionId: string;
  judgeId: string;
  judgeName: string;
  classId: string;
  className: string;
  showId: string;
  role: 'primary' | 'secondary' | 'trainee' | 'observer';
  status: 'active' | 'paused' | 'disconnected' | 'completed';
  startedAt: Date;
  lastActivity: Date;
  scoreCount: number;
  averageScoreTime: number;
  conflictCount: number;
  permissions: {
    canScore: boolean;
    canModifyResults: boolean;
    canFinalizeResults: boolean;
    canViewOtherScores: boolean;
  };
}

export interface CollaborativeScore {
  id: string;
  entryId: string;
  dogId: string;
  armband: string;
  sessionId: string;
  judgeId: string;
  judgeName: string;
  scoreData: {
    points: number;
    time: number;
    faults: number;
    notes?: string;
  };
  isTemporary: boolean;
  isPreliminary: boolean;
  submittedAt: Date;
  lastModified: Date;
  version: number;
  conflictStatus?: 'none' | 'detected' | 'resolved';
  otherJudgeScores?: Array<{
    judgeId: string;
    judgeName: string;
    score: number;
    difference: number;
  }>;
}

export interface ScoringConflict {
  id: string;
  entryId: string;
  dogId: string;
  armband: string;
  classId: string;
  conflictType: 'score-difference' | 'timing-conflict' | 'simultaneous-update' | 'eligibility-dispute';
  severity: 'low' | 'medium' | 'high' | 'critical';
  judges: Array<{
    judgeId: string;
    judgeName: string;
    score: CollaborativeScore;
    position: string; // position/opinion on the conflict
  }>;
  primaryJudge?: string; // Who has final say
  detectedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: {
    method: 'primary-judge-decision' | 'consensus' | 'average' | 'manual-override';
    finalScore: CollaborativeScore;
    notes: string;
  };
  status: 'open' | 'under-review' | 'resolved' | 'escalated';
  discussionNotes: Array<{
    judgeId: string;
    judgeName: string;
    note: string;
    timestamp: Date;
  }>;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface JudgeActivity {
  judgeId: string;
  activity: 'scoring' | 'reviewing' | 'discussing' | 'idle';
  currentEntry?: string;
  targetEntry?: string; // Entry they're about to score
  activityStarted: Date;
  lastUpdate: Date;
  typing?: boolean;
  focusedElement?: string;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface CollaborationMetrics {
  showId: string;
  classId: string;
  activeSessions: number;
  totalScores: number;
  consensusRate: number; // Percentage of scores with no conflicts
  averageScoreDiscrepancy: number;
  conflictsDetected: number;
  conflictsResolved: number;
  averageResolutionTime: number; // minutes
  judgeProductivity: Map<string, {
    judgeId: string;
    scoresSubmitted: number;
    averageScoreTime: number;
    conflictRate: number;
  }>;
  lastUpdated: Date;
}

/**
 * Service for managing multi-judge collaborative scoring
 */
export class CollaborativeJudging {
  private showId: string;
  private classId: string;
  private channelName: string;
  private isActive = false;
  private subscriptions = new Map<string, string>();

  // Session and score management
  private judgeSessions = new Map<string, JudgeSession>();
  private collaborativeScores = new Map<string, CollaborativeScore[]>();
  private activeConflicts = new Map<string, ScoringConflict>();
  private judgeActivities = new Map<string, JudgeActivity>();
  private metrics: CollaborationMetrics;

  // Event listeners
  private sessionListeners = new Set<(session: JudgeSession) => void>();
  private scoreListeners = new Set<(score: CollaborativeScore) => void>();
  private conflictListeners = new Set<(conflict: ScoringConflict) => void>();
  private activityListeners = new Set<(activity: JudgeActivity) => void>();

  // Configuration
  private config = {
    scoreDiscrepancyThreshold: 5.0, // Points difference to trigger conflict
    simultaneousScoreTimeoutMs: 30000, // 30 seconds
    autoResolveConflicts: false,
    enableRealTimeDiscussion: true,
    scoringSessionTimeoutMs: 5 * 60 * 1000, // 5 minutes
    maxConflictDiscussionLength: 10, // Maximum discussion entries
  };

  // Timers and intervals
  private activityTimer?: NodeJS.Timeout;
  private sessionCleanupTimer?: NodeJS.Timeout;

  constructor(showId: string, classId: string) {
    this.showId = showId;
    this.classId = classId;
    this.channelName = `collaborative-judging-${showId}-${classId}`;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Start collaborative judging service
   */
  async start(): Promise<void> {
    if (this.isActive) {
      logger.warn('Collaborative judging already active', 'judging');
      return;
    }

    try {
      logger.debug('Starting collaborative judging', 'judging', { classId: this.classId });

      // Subscribe to scoring sessions
      const sessionsSubscriptionId = await subscriptionManager.subscribe(
        `judging-sessions-${this.classId}`,
        {
          table: 'live_scoring_sessions',
          filter: `class_id=eq.${this.classId}`,
          events: ['INSERT', 'UPDATE', 'DELETE'],
          priority: 'critical',
          enablePresence: true,
          enableBroadcast: true,
        },
        this.handleSessionUpdate.bind(this)
      );

      this.subscriptions.set('sessions', sessionsSubscriptionId);

      // Subscribe to collaborative scores
      const scoresSubscriptionId = await subscriptionManager.subscribe(
        `collaborative-scores-${this.classId}`,
        {
          table: 'collaborative_scores',
          filter: `class_id=eq.${this.classId}`,
          events: ['INSERT', 'UPDATE'],
          priority: 'critical',
          batchUpdates: false, // Real-time for scoring
          enableBroadcast: true,
        },
        this.handleScoreUpdate.bind(this)
      );

      this.subscriptions.set('scores', scoresSubscriptionId);

      // Subscribe to presence for judge activity
      const presenceSubscriptionId = await subscriptionManager.subscribeToPresence(
        this.channelName,
        this.handlePresenceChange.bind(this)
      );

      this.subscriptions.set('presence', presenceSubscriptionId);

      // Start activity monitoring
      this.startActivityMonitoring();

      // Start session cleanup
      this.startSessionCleanup();

      this.isActive = true;
      logger.info('Collaborative judging started successfully', 'judging', { showId: this.showId, classId: this.classId });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId, classId: this.classId }
      });
      throw error;
    }
  }

  /**
   * Stop collaborative judging service
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    try {
      logger.debug('Stopping collaborative judging', 'judging');

      // Resolve any open conflicts
      await this.resolveOpenConflicts();

      // Unsubscribe from all updates
      for (const [, subscriptionId] of this.subscriptions) {
        await subscriptionManager.unsubscribe(subscriptionId);
      }

      // Clear timers
      if (this.activityTimer) {
        clearTimeout(this.activityTimer);
      }
      if (this.sessionCleanupTimer) {
        clearTimeout(this.sessionCleanupTimer);
      }

      // Clear data
      this.judgeSessions.clear();
      this.collaborativeScores.clear();
      this.activeConflicts.clear();
      this.judgeActivities.clear();
      this.subscriptions.clear();

      this.isActive = false;
      logger.info('Collaborative judging stopped', 'judging');

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId, classId: this.classId }
      });
    }
  }

  /**
   * Handle judge session updates
   */
  private handleSessionUpdate(event: {
    payload?: {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    };
    data?: Record<string, unknown>;
  }): void {
    try {
      const sessionData = event.payload?.new || event.data;
      if (!sessionData) return;

      const data = sessionData as Record<string, unknown>;
      const session: JudgeSession = {
        sessionId: data.session_id as string,
        judgeId: data.judge_id as string,
        judgeName: (data.judge_name as string) || 'Unknown Judge',
        classId: data.class_id as string,
        className: (data.class_name as string) || 'Unknown Class',
        showId: data.show_id as string,
        role: (data.role as JudgeSession['role']) || 'primary',
        status: (data.status as JudgeSession['status']) || 'active',
        startedAt: new Date(data.started_at as string),
        lastActivity: new Date((data.last_activity as string) || (data.updated_at as string)),
        scoreCount: (data.score_count as number) || 0,
        averageScoreTime: (data.average_score_time as number) || 0,
        conflictCount: (data.conflict_count as number) || 0,
        permissions: {
          canScore: (data.can_score as boolean) !== false,
          canModifyResults: (data.can_modify_results as boolean) || false,
          canFinalizeResults: (data.can_finalize_results as boolean) || false,
          canViewOtherScores: (data.can_view_other_scores as boolean) !== false,
        },
      };

      // Store session
      this.judgeSessions.set(session.judgeId, session);

      // Trigger listeners
      this.sessionListeners.forEach(listener => {
        try {
          listener(session);
        } catch (error) {
          logger.error('Error in session listener', 'judging', {}, error as Error);
        }
      });

      // Update metrics
      this.updateSessionMetrics();

      logger.debug('Judge session updated', 'judging', { judgeName: session.judgeName, status: session.status });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.showId, classId: this.classId }
      });
    }
  }

  /**
   * Handle collaborative score updates
   */
  private handleScoreUpdate(event: {
    payload?: {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    };
    data?: Record<string, unknown>;
  }): void {
    try {
      const scoreData = event.payload?.new || event.data;
      if (!scoreData) return;

      const data = scoreData as Record<string, unknown>;
      const score: CollaborativeScore = {
        id: data.id as string,
        entryId: data.entry_id as string,
        dogId: data.dog_id as string,
        armband: (data.armband as string) || '',
        sessionId: data.session_id as string,
        judgeId: data.judge_id as string,
        judgeName: (data.judge_name as string) || 'Unknown Judge',
        scoreData: {
          points: (data.points as number) || 0,
          time: (data.time as number) || 0,
          faults: (data.faults as number) || 0,
          notes: data.notes as string,
        },
        isTemporary: (data.is_temporary as boolean) || false,
        isPreliminary: (data.is_preliminary as boolean) !== false,
        submittedAt: new Date((data.submitted_at as string) || (data.created_at as string)),
        lastModified: new Date(data.updated_at as string),
        version: (data.version as number) || 1,
        conflictStatus: (data.conflict_status as CollaborativeScore['conflictStatus']) || 'none',
      };

      // Store score
      const entryScores = this.collaborativeScores.get(score.entryId) || [];
      const existingIndex = entryScores.findIndex(s => s.judgeId === score.judgeId);
      
      if (existingIndex >= 0) {
        entryScores[existingIndex] = score;
      } else {
        entryScores.push(score);
      }
      
      this.collaborativeScores.set(score.entryId, entryScores);

      // Check for conflicts
      this.detectScoringConflicts(score.entryId);

      // Add comparison data
      score.otherJudgeScores = this.getOtherJudgeScores(score);

      // Trigger listeners
      this.scoreListeners.forEach(listener => {
        try {
          listener(score);
        } catch (error) {
          logger.error('Error in score listener', 'judging', {}, error as Error);
        }
      });

      // Update metrics
      this.updateScoreMetrics();

      logger.debug('Collaborative score', 'judging', { armband: score.armband, judgeName: score.judgeName, points: score.scoreData.points });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.showId, classId: this.classId }
      });
    }
  }

  /**
   * Handle presence changes for judge activity
   */
  private handlePresenceChange(presences: PresenceTrackingData[]): void {
    try {
      presences.forEach(presence => {
        if (presence.role === 'judge') {
          const activity: JudgeActivity = {
            judgeId: presence.user_id,
            activity: 'idle',
            activityStarted: new Date(),
            lastUpdate: new Date(presence.last_seen),
          };

          this.judgeActivities.set(presence.user_id, activity);
        }
      });

      logger.debug('Judge presence updated', 'judging', { judgesOnline: presences.filter(p => p.role === 'judge').length });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { presenceCount: presences.length, showId: this.showId, classId: this.classId }
      });
    }
  }

  /**
   * Detect scoring conflicts between judges
   */
  private detectScoringConflicts(entryId: string): void {
    try {
      const entryScores = this.collaborativeScores.get(entryId) || [];
      if (entryScores.length < 2) return;

      // Calculate score differences
      const scoreComparisons: Array<{
        judge1: CollaborativeScore;
        judge2: CollaborativeScore;
        difference: number;
      }> = [];

      for (let i = 0; i < entryScores.length; i++) {
        for (let j = i + 1; j < entryScores.length; j++) {
          const score1 = entryScores[i];
          const score2 = entryScores[j];
          const difference = Math.abs(score1.scoreData.points - score2.scoreData.points);

          if (difference > this.config.scoreDiscrepancyThreshold) {
            scoreComparisons.push({ judge1: score1, judge2: score2, difference });
          }
        }
      }

      // Create conflicts for significant differences
      scoreComparisons.forEach(comparison => {
        this.createScoringConflict(entryId, comparison);
      });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, showId: this.showId, classId: this.classId }
      });
    }
  }

  /**
   * Create a scoring conflict
   */
  private createScoringConflict(
    entryId: string,
    comparison: { judge1: CollaborativeScore; judge2: CollaborativeScore; difference: number }
  ): void {
    try {
      const conflictId = `conflict-${entryId}-${Date.now()}`;
      
      const conflict: ScoringConflict = {
        id: conflictId,
        entryId,
        dogId: comparison.judge1.dogId,
        armband: comparison.judge1.armband,
        classId: this.classId,
        conflictType: 'score-difference',
        severity: this.getSeverityLevel(comparison.difference),
        judges: [
          {
            judgeId: comparison.judge1.judgeId,
            judgeName: comparison.judge1.judgeName,
            score: comparison.judge1,
            position: `Score: ${comparison.judge1.scoreData.points}`,
          },
          {
            judgeId: comparison.judge2.judgeId,
            judgeName: comparison.judge2.judgeName,
            score: comparison.judge2,
            position: `Score: ${comparison.judge2.scoreData.points}`,
          },
        ],
        primaryJudge: this.determinePrimaryJudge(),
        detectedAt: new Date(),
        status: 'open',
        discussionNotes: [],
      };

      this.activeConflicts.set(conflictId, conflict);

      // Broadcast conflict
      this.broadcastConflict(conflict);

      // Trigger listeners
      this.conflictListeners.forEach(listener => {
        try {
          listener(conflict);
        } catch (error) {
          logger.error('Error in conflict listener', 'judging', {}, error as Error);
        }
      });

      // Update metrics
      this.metrics.conflictsDetected++;

      logger.warn('Scoring conflict detected', 'judging', { armband: conflict.armband, pointDifference: comparison.difference });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, comparison, showId: this.showId, classId: this.classId }
      });
    }
  }

  /**
   * Resolve a scoring conflict
   */
  async resolveConflict(
    conflictId: string,
    resolution: ScoringConflict['resolution'],
    resolvedBy: string
  ): Promise<void> {
    try {
      const conflict = this.activeConflicts.get(conflictId);
      if (!conflict) {
        throw new Error(`Conflict not found: ${conflictId}`);
      }

      conflict.resolvedAt = new Date();
      conflict.resolvedBy = resolvedBy;
      conflict.resolution = resolution;
      conflict.status = 'resolved';

      // Broadcast resolution
      await this.broadcastConflictResolution(conflict);

      // Update metrics
      this.metrics.conflictsResolved++;
      const resolutionTime = (conflict.resolvedAt.getTime() - conflict.detectedAt.getTime()) / (1000 * 60);
      this.metrics.averageResolutionTime =
        (this.metrics.averageResolutionTime + resolutionTime) / 2;

      logger.info('Conflict resolved', 'judging', { conflictId, resolvedBy });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { conflictId, resolution, resolvedBy, showId: this.showId, classId: this.classId }
      });
      throw error;
    }
  }

  /**
   * Add discussion note to conflict
   */
  async addConflictDiscussion(
    conflictId: string,
    judgeId: string,
    note: string
  ): Promise<void> {
    try {
      const conflict = this.activeConflicts.get(conflictId);
      if (!conflict) {
        throw new Error(`Conflict not found: ${conflictId}`);
      }

      const judge = this.judgeSessions.get(judgeId);
      if (!judge) {
        throw new Error(`Judge session not found: ${judgeId}`);
      }

      const discussionNote = {
        judgeId,
        judgeName: judge.judgeName,
        note,
        timestamp: new Date(),
      };

      conflict.discussionNotes.push(discussionNote);

      // Limit discussion length
      if (conflict.discussionNotes.length > this.config.maxConflictDiscussionLength) {
        conflict.discussionNotes.shift();
      }

      // Broadcast discussion update
      await this.broadcastConflictDiscussion(conflictId, discussionNote);

      logger.debug('Conflict discussion added', 'judging', { conflictId, judgeName: judge.judgeName });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { conflictId, judgeId, note, showId: this.showId, classId: this.classId }
      });
      throw error;
    }
  }

  /**
   * Track judge activity
   */
  async trackJudgeActivity(
    judgeId: string,
    activity: JudgeActivity['activity'],
    metadata?: {
      currentEntry?: string;
      targetEntry?: string;
      typing?: boolean;
      focusedElement?: string;
    }
  ): Promise<void> {
    try {
      const existingActivity = this.judgeActivities.get(judgeId);
      
      const judgeActivity: JudgeActivity = {
        judgeId,
        activity,
        currentEntry: metadata?.currentEntry,
        targetEntry: metadata?.targetEntry,
        activityStarted: existingActivity?.activity === activity ? 
          existingActivity.activityStarted : new Date(),
        lastUpdate: new Date(),
        typing: metadata?.typing,
        focusedElement: metadata?.focusedElement,
      };

      this.judgeActivities.set(judgeId, judgeActivity);

      // Broadcast activity update
      await this.broadcastJudgeActivity(judgeActivity);

      // Trigger listeners
      this.activityListeners.forEach(listener => {
        try {
          listener(judgeActivity);
        } catch (error) {
          logger.error('Error in activity listener', 'judging', {}, error as Error);
        }
      });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { judgeId, activity, metadata, showId: this.showId, classId: this.classId }
      });
    }
  }

  /**
   * Broadcasting methods
   */
  private async broadcastConflict(conflict: ScoringConflict): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'scoring-conflict',
        payload: conflict,
        metadata: {
          priority: 'critical',
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { conflict, showId: this.showId, classId: this.classId }
      });
    }
  }

  private async broadcastConflictResolution(conflict: ScoringConflict): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'conflict-resolved',
        payload: conflict,
        metadata: {
          priority: 'high',
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { conflict, showId: this.showId, classId: this.classId }
      });
    }
  }

  private async broadcastConflictDiscussion(
    conflictId: string,
    discussionNote: ScoringConflict['discussionNotes'][0]
  ): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'conflict-discussion',
        payload: { conflictId, discussionNote },
        metadata: {
          priority: 'medium',
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { conflictId, discussionNote, showId: this.showId, classId: this.classId }
      });
    }
  }

  private async broadcastJudgeActivity(activity: JudgeActivity): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'judge-activity',
        payload: activity,
        metadata: {
          priority: 'low',
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { activity, showId: this.showId, classId: this.classId }
      });
    }
  }

  /**
   * Event listener management
   */
  onSessionUpdate(listener: (session: JudgeSession) => void): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  onScoreUpdate(listener: (score: CollaborativeScore) => void): () => void {
    this.scoreListeners.add(listener);
    return () => this.scoreListeners.delete(listener);
  }

  onConflictDetected(listener: (conflict: ScoringConflict) => void): () => void {
    this.conflictListeners.add(listener);
    return () => this.conflictListeners.delete(listener);
  }

  onJudgeActivity(listener: (activity: JudgeActivity) => void): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  /**
   * Data access methods
   */
  getJudgeSessions(): JudgeSession[] {
    return Array.from(this.judgeSessions.values());
  }

  getActiveConflicts(): ScoringConflict[] {
    return Array.from(this.activeConflicts.values())
      .filter(c => c.status === 'open' || c.status === 'under-review');
  }

  getEntryScores(entryId: string): CollaborativeScore[] {
    return this.collaborativeScores.get(entryId) || [];
  }

  getJudgeActivities(): JudgeActivity[] {
    return Array.from(this.judgeActivities.values());
  }

  getMetrics(): CollaborationMetrics {
    return { ...this.metrics };
  }

  /**
   * Utility methods
   */
  private getOtherJudgeScores(score: CollaborativeScore): CollaborativeScore['otherJudgeScores'] {
    const entryScores = this.collaborativeScores.get(score.entryId) || [];
    return entryScores
      .filter(s => s.judgeId !== score.judgeId)
      .map(s => ({
        judgeId: s.judgeId,
        judgeName: s.judgeName,
        score: s.scoreData.points,
        difference: Math.abs(s.scoreData.points - score.scoreData.points),
      }));
  }

  private getSeverityLevel(difference: number): ScoringConflict['severity'] {
    if (difference >= 15) return 'critical';
    if (difference >= 10) return 'high';
    if (difference >= 7) return 'medium';
    return 'low';
  }

  private determinePrimaryJudge(): string {
    // Find the primary judge (highest role)
    const primaryJudge = Array.from(this.judgeSessions.values())
      .find(session => session.role === 'primary');
    
    return primaryJudge?.judgeId || Array.from(this.judgeSessions.keys())[0] || '';
  }

  private async resolveOpenConflicts(): Promise<void> {
    const openConflicts = Array.from(this.activeConflicts.values())
      .filter(c => c.status === 'open');

    for (const conflict of openConflicts) {
      if (this.config.autoResolveConflicts && conflict.primaryJudge) {
        const primaryScore = conflict.judges.find(j => j.judgeId === conflict.primaryJudge)?.score;
        
        if (primaryScore) {
          await this.resolveConflict(conflict.id, {
            method: 'primary-judge-decision',
            finalScore: primaryScore,
            notes: 'Auto-resolved using primary judge decision',
          }, 'system');
        }
      }
    }
  }

  private startActivityMonitoring(): void {
    this.activityTimer = setInterval(() => {
      this.updateActivityStatus();
    }, 5000); // Update every 5 seconds
  }

  private startSessionCleanup(): void {
    this.sessionCleanupTimer = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 60000); // Clean up every minute
  }

  private updateActivityStatus(): void {
    const now = new Date();
    
    this.judgeActivities.forEach(activity => {
      const timeSinceUpdate = now.getTime() - activity.lastUpdate.getTime();
      
      if (timeSinceUpdate > 30000) { // 30 seconds
        activity.activity = 'idle';
        activity.typing = false;
      }
    });
  }

  private cleanupInactiveSessions(): void {
    const cutoff = new Date(Date.now() - this.config.scoringSessionTimeoutMs);
    
    this.judgeSessions.forEach((session) => {
      if (session.lastActivity < cutoff && session.status === 'active') {
        session.status = 'disconnected';
        logger.debug('Judge session marked as disconnected', 'judging', { judgeName: session.judgeName });
      }
    });
  }

  private updateSessionMetrics(): void {
    this.metrics.activeSessions = Array.from(this.judgeSessions.values())
      .filter(s => s.status === 'active').length;
  }

  private updateScoreMetrics(): void {
    this.metrics.totalScores++;
    this.metrics.lastUpdated = new Date();
  }

  private initializeMetrics(): CollaborationMetrics {
    return {
      showId: this.showId,
      classId: this.classId,
      activeSessions: 0,
      totalScores: 0,
      consensusRate: 100,
      averageScoreDiscrepancy: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      averageResolutionTime: 0,
      judgeProductivity: new Map(),
      lastUpdated: new Date(),
    };
  }

  /**
   * Check if service is active
   */
  isServiceActive(): boolean {
    return this.isActive;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...updates };
  }
}

export default CollaborativeJudging;