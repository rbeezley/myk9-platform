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
import type { PresenceTrackingData } from '../../types/realtime-types';

// Re-export all types for backward compatibility
export type {
  JudgeSession,
  CollaborativeScore,
  ScoringConflict,
  JudgeActivity,
  CollaborationMetrics,
  CollaborativeJudgingConfig,
} from './collaborative-judging-types';

import type {
  JudgeSession,
  CollaborativeScore,
  ScoringConflict,
  JudgeActivity,
  CollaborationMetrics,
  CollaborativeJudgingConfig,
} from './collaborative-judging-types';

import {
  mapToJudgeSession,
  mapToCollaborativeScore,
  mapPresenceToJudgeActivity,
  determinePrimaryJudge,
  computeOtherJudgeScores,
  detectScoreDiscrepancies,
  initializeMetrics,
} from './collaborative-judging-utils';

import {
  broadcastConflict,
  broadcastConflictResolution,
  broadcastConflictDiscussion,
  broadcastJudgeActivity,
  buildScoringConflict,
  notifyListeners,
  updateActivityStatus,
  cleanupInactiveSessions,
} from './collaborativeJudging.helpers';

/**
 * Service for managing multi-judge collaborative scoring
 */
export class CollaborativeJudging {
  private showId: string;
  private classId: string;
  private channelName: string;
  private isActive = false;
  private subscriptions = new Map<string, string>();

  private judgeSessions = new Map<string, JudgeSession>();
  private collaborativeScores = new Map<string, CollaborativeScore[]>();
  private activeConflicts = new Map<string, ScoringConflict>();
  private judgeActivities = new Map<string, JudgeActivity>();
  private metrics: CollaborationMetrics;

  private sessionListeners = new Set<(session: JudgeSession) => void>();
  private scoreListeners = new Set<(score: CollaborativeScore) => void>();
  private conflictListeners = new Set<(conflict: ScoringConflict) => void>();
  private activityListeners = new Set<(activity: JudgeActivity) => void>();

  private config: CollaborativeJudgingConfig = {
    scoreDiscrepancyThreshold: 5.0,
    simultaneousScoreTimeoutMs: 30000,
    autoResolveConflicts: false,
    enableRealTimeDiscussion: true,
    scoringSessionTimeoutMs: 5 * 60 * 1000,
    maxConflictDiscussionLength: 10,
  };

  private activityTimer?: NodeJS.Timeout;
  private sessionCleanupTimer?: NodeJS.Timeout;

  constructor(showId: string, classId: string) {
    this.showId = showId;
    this.classId = classId;
    this.channelName = `collaborative-judging-${showId}-${classId}`;
    this.metrics = initializeMetrics(showId, classId);
  }

  async start(): Promise<void> {
    if (this.isActive) {
      logger.warn('Collaborative judging already active', 'judging');
      return;
    }

    try {
      logger.debug('Starting collaborative judging', 'judging', { classId: this.classId });

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

      const scoresSubscriptionId = await subscriptionManager.subscribe(
        `collaborative-scores-${this.classId}`,
        {
          table: 'collaborative_scores',
          filter: `class_id=eq.${this.classId}`,
          events: ['INSERT', 'UPDATE'],
          priority: 'critical',
          batchUpdates: false,
          enableBroadcast: true,
        },
        this.handleScoreUpdate.bind(this)
      );
      this.subscriptions.set('scores', scoresSubscriptionId);

      const presenceSubscriptionId = await subscriptionManager.subscribeToPresence(
        this.channelName,
        this.handlePresenceChange.bind(this)
      );
      this.subscriptions.set('presence', presenceSubscriptionId);

      this.startActivityMonitoring();
      this.startSessionCleanup();

      this.isActive = true;
      logger.info('Collaborative judging started successfully', 'judging', {
        showId: this.showId,
        classId: this.classId,
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId, classId: this.classId },
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isActive) return;

    try {
      logger.debug('Stopping collaborative judging', 'judging');
      await this.resolveOpenConflicts();

      for (const [, subscriptionId] of this.subscriptions) {
        await subscriptionManager.unsubscribe(subscriptionId);
      }

      if (this.activityTimer) clearTimeout(this.activityTimer);
      if (this.sessionCleanupTimer) clearTimeout(this.sessionCleanupTimer);

      this.judgeSessions.clear();
      this.collaborativeScores.clear();
      this.activeConflicts.clear();
      this.judgeActivities.clear();
      this.subscriptions.clear();

      this.isActive = false;
      logger.info('Collaborative judging stopped', 'judging');
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId, classId: this.classId },
      });
    }
  }

  private handleSessionUpdate(event: {
    payload?: { new?: Record<string, unknown>; old?: Record<string, unknown> };
    data?: Record<string, unknown>;
  }): void {
    try {
      const sessionData = event.payload?.new || event.data;
      if (!sessionData) return;

      const session = mapToJudgeSession(sessionData as Record<string, unknown>);
      this.judgeSessions.set(session.judgeId, session);

      this.sessionListeners.forEach(listener => {
        try {
          listener(session);
        } catch (error) {
          logger.error('Error in session listener', 'judging', {}, error as Error);
        }
      });

      this.updateSessionMetrics();
      logger.debug('Judge session updated', 'judging', {
        judgeName: session.judgeName,
        status: session.status,
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.showId, classId: this.classId },
      });
    }
  }

  private handleScoreUpdate(event: {
    payload?: { new?: Record<string, unknown>; old?: Record<string, unknown> };
    data?: Record<string, unknown>;
  }): void {
    try {
      const scoreData = event.payload?.new || event.data;
      if (!scoreData) return;

      const score = mapToCollaborativeScore(scoreData as Record<string, unknown>);

      const entryScores = this.collaborativeScores.get(score.entryId) || [];
      const existingIndex = entryScores.findIndex(s => s.judgeId === score.judgeId);

      if (existingIndex >= 0) {
        entryScores[existingIndex] = score;
      } else {
        entryScores.push(score);
      }

      this.collaborativeScores.set(score.entryId, entryScores);
      this.detectScoringConflicts(score.entryId);

      score.otherJudgeScores = computeOtherJudgeScores(
        score,
        this.collaborativeScores.get(score.entryId) || []
      );

      this.scoreListeners.forEach(listener => {
        try {
          listener(score);
        } catch (error) {
          logger.error('Error in score listener', 'judging', {}, error as Error);
        }
      });

      this.updateScoreMetrics();
      logger.debug('Collaborative score', 'judging', {
        armband: score.armband,
        judgeName: score.judgeName,
        points: score.scoreData.points,
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.showId, classId: this.classId },
      });
    }
  }

  private handlePresenceChange(presences: PresenceTrackingData[]): void {
    try {
      presences.forEach(presence => {
        if (presence.role === 'judge') {
          const activity = mapPresenceToJudgeActivity(presence);
          this.judgeActivities.set(presence.user_id, activity);
        }
      });

      logger.debug('Judge presence updated', 'judging', {
        judgesOnline: presences.filter(p => p.role === 'judge').length,
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: {
          presenceCount: presences.length,
          showId: this.showId,
          classId: this.classId,
        },
      });
    }
  }

  private detectScoringConflicts(entryId: string): void {
    try {
      const entryScores = this.collaborativeScores.get(entryId) || [];
      if (entryScores.length < 2) return;

      const discrepancies = detectScoreDiscrepancies(
        entryScores,
        this.config.scoreDiscrepancyThreshold
      );

      discrepancies.forEach(comparison => {
        this.createScoringConflict(entryId, comparison);
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, showId: this.showId, classId: this.classId },
      });
    }
  }

  private createScoringConflict(
    entryId: string,
    comparison: { judge1: CollaborativeScore; judge2: CollaborativeScore; difference: number }
  ): void {
    try {
      const conflict = buildScoringConflict(
        entryId,
        this.classId,
        comparison,
        determinePrimaryJudge(this.judgeSessions)
      );

      this.activeConflicts.set(conflict.id, conflict);
      broadcastConflict(this.channelName, conflict, this.showId, this.classId);
      notifyListeners(this.conflictListeners, conflict, 'conflict');

      this.metrics.conflictsDetected++;
      logger.warn('Scoring conflict detected', 'judging', {
        armband: conflict.armband,
        pointDifference: comparison.difference,
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, comparison, showId: this.showId, classId: this.classId },
      });
    }
  }

  async resolveConflict(
    conflictId: string,
    resolution: ScoringConflict['resolution'],
    resolvedBy: string
  ): Promise<void> {
    try {
      const conflict = this.activeConflicts.get(conflictId);
      if (!conflict) throw new Error(`Conflict not found: ${conflictId}`);

      conflict.resolvedAt = new Date();
      conflict.resolvedBy = resolvedBy;
      conflict.resolution = resolution;
      conflict.status = 'resolved';

      await broadcastConflictResolution(this.channelName, conflict, this.showId, this.classId);

      this.metrics.conflictsResolved++;
      const resolutionTime =
        (conflict.resolvedAt.getTime() - conflict.detectedAt.getTime()) / (1000 * 60);
      this.metrics.averageResolutionTime =
        (this.metrics.averageResolutionTime + resolutionTime) / 2;

      logger.info('Conflict resolved', 'judging', { conflictId, resolvedBy });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: {
          conflictId,
          resolution,
          resolvedBy,
          showId: this.showId,
          classId: this.classId,
        },
      });
      throw error;
    }
  }

  async addConflictDiscussion(conflictId: string, judgeId: string, note: string): Promise<void> {
    try {
      const conflict = this.activeConflicts.get(conflictId);
      if (!conflict) throw new Error(`Conflict not found: ${conflictId}`);

      const judge = this.judgeSessions.get(judgeId);
      if (!judge) throw new Error(`Judge session not found: ${judgeId}`);

      const discussionNote = {
        judgeId,
        judgeName: judge.judgeName,
        note,
        timestamp: new Date(),
      };

      conflict.discussionNotes.push(discussionNote);
      if (conflict.discussionNotes.length > this.config.maxConflictDiscussionLength) {
        conflict.discussionNotes.shift();
      }

      await broadcastConflictDiscussion(
        this.channelName,
        conflictId,
        discussionNote,
        this.showId,
        this.classId
      );

      logger.debug('Conflict discussion added', 'judging', {
        conflictId,
        judgeName: judge.judgeName,
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: {
          conflictId,
          judgeId,
          note,
          showId: this.showId,
          classId: this.classId,
        },
      });
      throw error;
    }
  }

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
        activityStarted:
          existingActivity?.activity === activity ? existingActivity.activityStarted : new Date(),
        lastUpdate: new Date(),
        typing: metadata?.typing,
        focusedElement: metadata?.focusedElement,
      };

      this.judgeActivities.set(judgeId, judgeActivity);
      await broadcastJudgeActivity(this.channelName, judgeActivity, this.showId, this.classId);

      this.activityListeners.forEach(listener => {
        try {
          listener(judgeActivity);
        } catch (error) {
          logger.error('Error in activity listener', 'judging', {}, error as Error);
        }
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: {
          judgeId,
          activity,
          metadata,
          showId: this.showId,
          classId: this.classId,
        },
      });
    }
  }

  // --- Event listener management ---

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

  // --- Data access methods ---

  getJudgeSessions(): JudgeSession[] {
    return Array.from(this.judgeSessions.values());
  }

  getActiveConflicts(): ScoringConflict[] {
    return Array.from(this.activeConflicts.values()).filter(
      c => c.status === 'open' || c.status === 'under-review'
    );
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

  isServiceActive(): boolean {
    return this.isActive;
  }

  updateConfig(updates: Partial<CollaborativeJudgingConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // --- Internal utility methods ---

  private async resolveOpenConflicts(): Promise<void> {
    const openConflicts = Array.from(this.activeConflicts.values()).filter(
      c => c.status === 'open'
    );

    for (const conflict of openConflicts) {
      if (this.config.autoResolveConflicts && conflict.primaryJudge) {
        const primaryScore = conflict.judges.find(j => j.judgeId === conflict.primaryJudge)?.score;

        if (primaryScore) {
          await this.resolveConflict(
            conflict.id,
            {
              method: 'primary-judge-decision',
              finalScore: primaryScore,
              notes: 'Auto-resolved using primary judge decision',
            },
            'system'
          );
        }
      }
    }
  }

  private startActivityMonitoring(): void {
    this.activityTimer = setInterval(() => {
      updateActivityStatus(this.judgeActivities);
    }, 5000);
  }

  private startSessionCleanup(): void {
    this.sessionCleanupTimer = setInterval(() => {
      cleanupInactiveSessions(this.judgeSessions, this.config.scoringSessionTimeoutMs);
    }, 60000);
  }

  private updateSessionMetrics(): void {
    this.metrics.activeSessions = Array.from(this.judgeSessions.values()).filter(
      s => s.status === 'active'
    ).length;
  }

  private updateScoreMetrics(): void {
    this.metrics.totalScores++;
    this.metrics.lastUpdated = new Date();
  }
}

export default CollaborativeJudging;
