/**
 * Results Broadcaster Service
 * Phase 6.2: Live Competition Features
 * 
 * Real-time broadcasting service for competition results, providing immediate
 * updates on scores, placements, and awards as they happen.
 */

import { subscriptionManager } from '../realtime/subscriptionManager';
import { errorMonitor } from '../../lib/errorMonitoring';
import { logger } from '@/services/LoggingService';
import type { Priority } from '../../types/realtime-types';

export interface ScoreResult {
  id: string;
  entryId: string;
  dogId: string;
  dogName: string;
  ownerName: string;
  armband: string;
  classId: string;
  className: string;
  showId: string;
  judgeId: string;
  judgeName: string;
  score: {
    points: number;
    time: number;
    faults: number;
    totalScore: number;
    qualifying: boolean;
    qualified: boolean;
  };
  placement?: {
    position: number;
    total: number;
    qualified: boolean;
    title?: string; // "1st Place", "Winner", etc.
  };
  status: 'preliminary' | 'official' | 'final';
  timestamp: Date;
  submittedAt: Date;
  notes?: string;
  videoUrl?: string;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface PlacementResult {
  classId: string;
  className: string;
  showId: string;
  judgeId: string;
  judgeName: string;
  placements: Array<{
    position: number;
    entryId: string;
    dogId: string;
    dogName: string;
    ownerName: string;
    armband: string;
    finalScore: number;
    qualified: boolean;
    award?: string;
    specialAward?: string;
  }>;
  totalEntries: number;
  qualifyingEntries: number;
  calculatedAt: Date;
  isComplete: boolean;
  isOfficial: boolean;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface AwardResult {
  id: string;
  type: 'placement' | 'special' | 'qualification' | 'championship';
  title: string;
  description: string;
  recipient: {
    entryId: string;
    dogId: string;
    dogName: string;
    ownerName: string;
    armband: string;
  };
  classId?: string;
  className?: string;
  showId: string;
  value?: number; // Championship points, etc.
  criteria: string;
  awardedAt: Date;
  awardedBy: string;
  certificate?: {
    templateId: string;
    generatedUrl?: string;
  };
}

export interface ResultsNotification {
  id: string;
  type: 'score-posted' | 'placement-updated' | 'award-announced' | 'results-finalized';
  priority: Priority;
  title: string;
  message: string;
  targetAudience: 'all' | 'exhibitors' | 'class-participants' | 'specific';
  targetIds?: string[]; // Entry IDs or User IDs
  data: ScoreResult | PlacementResult | AwardResult;
  showId: string;
  classId?: string;
  timestamp: Date;
  expiresAt?: Date;
  displayDuration?: number; // seconds to display on screen
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface ResultsMetrics {
  showId: string;
  scoresPosted: number;
  placementsCalculated: number;
  awardsAnnounced: number;
  notificationsSent: number;
  averageScorePostingTime: number; // ms from submission to broadcast
  peakResultsRate: number; // results per minute
  lastActivity: Date;
  judgeActivity: Map<string, {
    judgeId: string;
    judgeName: string;
    scoresSubmitted: number;
    averageSubmissionTime: number;
    lastActivity: Date;
  }>;
}

/**
 * Service for broadcasting competition results in real-time
 */
export class ResultsBroadcaster {
  private showId: string;
  private channelName: string;
  private isActive = false;
  private subscriptions = new Map<string, string>();

  // Results storage
  private recentScores = new Map<string, ScoreResult>();
  private placementResults = new Map<string, PlacementResult>();
  private awardResults = new Map<string, AwardResult>();
  private pendingNotifications = new Map<string, ResultsNotification>();
  private metrics: ResultsMetrics;

  // Event listeners
  private scoreListeners = new Set<(result: ScoreResult) => void>();
  private placementListeners = new Set<(result: PlacementResult) => void>();
  private awardListeners = new Set<(result: AwardResult) => void>();
  private notificationListeners = new Set<(notification: ResultsNotification) => void>();

  // Configuration
  private config = {
    batchResultsMs: 2000, // 2 seconds batching for placement calculations
    scoreDelayMs: 500, // Delay before broadcasting scores
    autoCalculatePlacements: true,
    notificationRetentionMs: 60 * 60 * 1000, // 1 hour
    enableVideoIntegration: false,
    qualifyingScoreThreshold: 85, // Default qualifying score
  };

  // Timers
  private batchTimer?: NodeJS.Timeout;
  private notificationTimer?: NodeJS.Timeout;

  constructor(showId: string) {
    this.showId = showId;
    this.channelName = `results-${showId}`;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Start results broadcasting service
   */
  async start(): Promise<void> {
    if (this.isActive) {
      logger.warn('Results broadcaster already active', 'results');
      return;
    }

    try {
      logger.info('Starting results broadcaster', 'results', { showId: this.showId });

      // Subscribe to score updates
      const scoresSubscriptionId = await subscriptionManager.subscribe(
        `scores-${this.showId}`,
        {
          table: 'scores',
          filter: `show_id=eq.${this.showId}`,
          events: ['INSERT', 'UPDATE'],
          priority: 'critical',
          batchUpdates: false, // Real-time for scores
          enableBroadcast: true,
        },
        this.handleScoreUpdate.bind(this)
      );

      this.subscriptions.set('scores', scoresSubscriptionId);

      // Subscribe to placement updates
      const placementsSubscriptionId = await subscriptionManager.subscribe(
        `placements-${this.showId}`,
        {
          table: 'class_results',
          filter: `show_id=eq.${this.showId}`,
          events: ['INSERT', 'UPDATE'],
          priority: 'high',
          batchUpdates: true,
          bufferTime: this.config.batchResultsMs,
          enableBroadcast: true,
        },
        this.handlePlacementUpdate.bind(this)
      );

      this.subscriptions.set('placements', placementsSubscriptionId);

      // Subscribe to award announcements
      const awardsSubscriptionId = await subscriptionManager.subscribe(
        `awards-${this.showId}`,
        {
          table: 'awards',
          filter: `show_id=eq.${this.showId}`,
          events: ['INSERT', 'UPDATE'],
          priority: 'high',
          batchUpdates: false,
          enableBroadcast: true,
        },
        this.handleAwardUpdate.bind(this)
      );

      this.subscriptions.set('awards', awardsSubscriptionId);

      // Start notification processing
      this.startNotificationProcessing();

      this.isActive = true;
      logger.info('Results broadcaster started successfully', 'results');

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId }
      });
      throw error;
    }
  }

  /**
   * Stop results broadcasting service
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    try {
      logger.info('Stopping results broadcaster', 'results');

      // Unsubscribe from all updates
      for (const [, subscriptionId] of this.subscriptions) {
        await subscriptionManager.unsubscribe(subscriptionId);
      }

      // Clear timers
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }
      if (this.notificationTimer) {
        clearTimeout(this.notificationTimer);
      }

      // Clear data
      this.recentScores.clear();
      this.placementResults.clear();
      this.awardResults.clear();
      this.pendingNotifications.clear();
      this.subscriptions.clear();

      this.isActive = false;
      logger.info('Results broadcaster stopped', 'results');

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId }
      });
    }
  }

  /**
   * Handle score database updates
   */
  private handleScoreUpdate(event: { payload?: { new?: Record<string, unknown> }; data?: Record<string, unknown> }): void {
    try {
      const scoreData = event.payload?.new || event.data;
      if (!scoreData) return;

      const scoreResult: ScoreResult = {
        id: String(scoreData.id || ''),
        entryId: String(scoreData.entry_id || ''),
        dogId: String(scoreData.dog_id || ''),
        dogName: String(scoreData.dog_name || 'Unknown'),
        ownerName: String(scoreData.owner_name || 'Unknown'),
        armband: String(scoreData.armband || ''),
        classId: String(scoreData.class_id || ''),
        className: String(scoreData.class_name || 'Unknown Class'),
        showId: String(scoreData.show_id || ''),
        judgeId: String(scoreData.judge_id || ''),
        judgeName: String(scoreData.judge_name || 'Unknown Judge'),
        score: {
          points: Number(scoreData.points) || 0,
          time: Number(scoreData.time) || 0,
          faults: Number(scoreData.faults) || 0,
          totalScore: Number(scoreData.total_score || scoreData.points) || 0,
          qualifying: Boolean(scoreData.qualifying_score),
          qualified: Boolean(scoreData.qualified),
        },
        placement: scoreData.placement ? {
          position: Number(scoreData.placement),
          total: Number(scoreData.total_entries) || 0,
          qualified: Boolean(scoreData.qualified),
          title: this.getPlacementTitle(Number(scoreData.placement)),
        } : undefined,
        status: (scoreData.status === 'official' || scoreData.status === 'final' || scoreData.status === 'preliminary') 
          ? scoreData.status : 'preliminary',
        timestamp: new Date(),
        submittedAt: scoreData.updated_at || scoreData.created_at 
          ? new Date(String(scoreData.updated_at || scoreData.created_at)) 
          : new Date(),
        notes: scoreData.notes ? String(scoreData.notes) : undefined,
        videoUrl: scoreData.video_url ? String(scoreData.video_url) : undefined,
      };

      // Store the score
      this.recentScores.set(scoreResult.id, scoreResult);

      // Process with delay for batching similar scores
      setTimeout(() => {
        this.processScoreResult(scoreResult);
      }, this.config.scoreDelayMs);

      logger.debug('Score result', 'results', { armband: scoreResult.armband, dogName: scoreResult.dogName, totalScore: scoreResult.score.totalScore });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.showId }
      });
    }
  }

  /**
   * Handle placement database updates
   */
  private handlePlacementUpdate(event: { payload?: { new?: Record<string, unknown> }; data?: Record<string, unknown> }): void {
    try {
      const placementData = event.payload?.new || event.data;
      if (!placementData) return;

      const placementResult: PlacementResult = {
        classId: String(placementData.class_id || ''),
        className: String(placementData.class_name || 'Unknown Class'),
        showId: String(placementData.show_id || ''),
        judgeId: String(placementData.judge_id || ''),
        judgeName: String(placementData.judge_name || 'Unknown Judge'),
        placements: this.parsePlacementData(Array.isArray(placementData.placements) ? placementData.placements : []),
        totalEntries: Number(placementData.total_entries) || 0,
        qualifyingEntries: Number(placementData.qualifying_entries) || 0,
        calculatedAt: placementData.calculated_at || placementData.updated_at
          ? new Date(String(placementData.calculated_at || placementData.updated_at))
          : new Date(),
        isComplete: Boolean(placementData.is_complete),
        isOfficial: Boolean(placementData.is_official),
      };

      // Store the placement
      this.placementResults.set(placementResult.classId, placementResult);

      // Process placement result
      this.processPlacementResult(placementResult);

      logger.debug('Placement result', 'results', { className: placementResult.className, placesCount: placementResult.placements.length });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.showId }
      });
    }
  }

  /**
   * Handle award database updates
   */
  private handleAwardUpdate(event: { payload?: { new?: Record<string, unknown> }; data?: Record<string, unknown> }): void {
    try {
      const awardData = event.payload?.new || event.data;
      if (!awardData) return;

      const awardResult: AwardResult = {
        id: String(awardData.id || ''),
        type: (awardData.type === 'placement' || awardData.type === 'special' || 
               awardData.type === 'qualification' || awardData.type === 'championship') 
               ? awardData.type : 'placement',
        title: String(awardData.title || 'Award'),
        description: String(awardData.description || ''),
        recipient: {
          entryId: String(awardData.entry_id || ''),
          dogId: String(awardData.dog_id || ''),
          dogName: String(awardData.dog_name || 'Unknown'),
          ownerName: String(awardData.owner_name || 'Unknown'),
          armband: String(awardData.armband || ''),
        },
        classId: awardData.class_id ? String(awardData.class_id) : undefined,
        className: awardData.class_name ? String(awardData.class_name) : undefined,
        showId: String(awardData.show_id || ''),
        value: awardData.value ? Number(awardData.value) : undefined,
        criteria: String(awardData.criteria || ''),
        awardedAt: awardData.awarded_at || awardData.created_at
          ? new Date(String(awardData.awarded_at || awardData.created_at))
          : new Date(),
        awardedBy: String(awardData.awarded_by || 'system'),
        certificate: awardData.certificate_template_id ? {
          templateId: String(awardData.certificate_template_id),
          generatedUrl: awardData.certificate_url ? String(awardData.certificate_url) : undefined,
        } : undefined,
      };

      // Store the award
      this.awardResults.set(awardResult.id, awardResult);

      // Process award result
      this.processAwardResult(awardResult);

      logger.debug('Award result', 'results', { title: awardResult.title, dogName: awardResult.recipient.dogName });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.showId }
      });
    }
  }

  /**
   * Process score result and create notifications
   */
  private processScoreResult(result: ScoreResult): void {
    try {
      // Create score notification
      const notification: ResultsNotification = {
        id: `score-${result.id}-${Date.now()}`,
        type: 'score-posted',
        priority: result.status === 'official' ? 'high' : 'medium',
        title: 'Score Posted',
        message: `${result.armband} - ${result.dogName}: ${result.score.totalScore}${result.score.qualified ? ' (Q)' : ''}`,
        targetAudience: 'class-participants',
        targetIds: [result.entryId],
        data: result,
        showId: this.showId,
        classId: result.classId,
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        displayDuration: 10, // 10 seconds
      };

      this.queueNotification(notification);

      // Trigger listeners
      this.scoreListeners.forEach(listener => {
        try {
          listener(result);
        } catch (error) {
          logger.error('Error in score listener', 'results', {}, error as Error);
        }
      });

      // Update metrics
      this.updateScoreMetrics(result);

      // Auto-calculate placements if enabled
      if (this.config.autoCalculatePlacements) {
        this.scheduleClassPlacementCalculation(result.classId);
      }

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { result, showId: this.showId }
      });
    }
  }

  /**
   * Process placement result and create notifications
   */
  private processPlacementResult(result: PlacementResult): void {
    try {
      // Create placement notification
      const notification: ResultsNotification = {
        id: `placement-${result.classId}-${Date.now()}`,
        type: 'placement-updated',
        priority: result.isOfficial ? 'critical' : 'high',
        title: result.isOfficial ? 'Official Results' : 'Preliminary Results',
        message: `${result.className}: ${result.qualifyingEntries}/${result.totalEntries} qualified`,
        targetAudience: 'class-participants',
        data: result,
        showId: this.showId,
        classId: result.classId,
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        displayDuration: 15, // 15 seconds
      };

      this.queueNotification(notification);

      // Create individual notifications for top placements
      result.placements.slice(0, 3).forEach((placement) => {
        const placementNotification: ResultsNotification = {
          id: `placement-${placement.entryId}-${Date.now()}`,
          type: 'placement-updated',
          priority: 'high',
          title: `${placement.position}${this.getOrdinalSuffix(placement.position)} Place`,
          message: `${placement.armband} - ${placement.dogName}`,
          targetAudience: 'specific',
          targetIds: [placement.entryId],
          data: result,
          showId: this.showId,
          classId: result.classId,
          timestamp: new Date(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          displayDuration: 10,
        };

        this.queueNotification(placementNotification);
      });

      // Trigger listeners
      this.placementListeners.forEach(listener => {
        try {
          listener(result);
        } catch (error) {
          logger.error('Error in placement listener', 'results', {}, error as Error);
        }
      });

      // Update metrics
      this.metrics.placementsCalculated++;

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { result, showId: this.showId }
      });
    }
  }

  /**
   * Process award result and create notifications
   */
  private processAwardResult(result: AwardResult): void {
    try {
      // Create award notification
      const notification: ResultsNotification = {
        id: `award-${result.id}-${Date.now()}`,
        type: 'award-announced',
        priority: 'critical',
        title: result.title,
        message: `${result.recipient.armband} - ${result.recipient.dogName}`,
        targetAudience: 'all',
        data: result,
        showId: this.showId,
        classId: result.classId,
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
        displayDuration: 20, // 20 seconds for awards
      };

      this.queueNotification(notification);

      // Trigger listeners
      this.awardListeners.forEach(listener => {
        try {
          listener(result);
        } catch (error) {
          logger.error('Error in award listener', 'results', {}, error as Error);
        }
      });

      // Update metrics
      this.metrics.awardsAnnounced++;

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { result, showId: this.showId }
      });
    }
  }

  /**
   * Queue notification for processing
   */
  private queueNotification(notification: ResultsNotification): void {
    this.pendingNotifications.set(notification.id, notification);
    
    // Process immediately if high priority
    if (notification.priority === 'critical') {
      this.processNotification(notification);
    }
  }

  /**
   * Process and broadcast notification
   */
  private async processNotification(notification: ResultsNotification): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'results-notification',
        payload: notification,
        metadata: {
          priority: notification.priority,
          timestamp: Date.now(),
        },
      });

      // Trigger notification listeners
      this.notificationListeners.forEach(listener => {
        try {
          listener(notification);
        } catch (error) {
          logger.error('Error in notification listener', 'results', {}, error as Error);
        }
      });

      // Update metrics
      this.metrics.notificationsSent++;

      logger.debug('Results notification sent', 'results', { title: notification.title });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { notification, showId: this.showId }
      });
    }
  }

  /**
   * Start notification processing timer
   */
  private startNotificationProcessing(): void {
    this.notificationTimer = setInterval(() => {
      this.processPendingNotifications();
    }, 1000); // Process every second
  }

  /**
   * Process pending notifications in batches
   */
  private processPendingNotifications(): void {
    const notifications = Array.from(this.pendingNotifications.values())
      .filter(n => n.priority !== 'critical'); // Critical already processed

    notifications.forEach(notification => {
      this.processNotification(notification);
      this.pendingNotifications.delete(notification.id);
    });
  }

  /**
   * Schedule class placement calculation
   */
  private scheduleClassPlacementCalculation(classId: string): void {
    // Clear existing timer for this class
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // Schedule calculation
    this.batchTimer = setTimeout(() => {
      this.calculateClassPlacements(classId);
    }, this.config.batchResultsMs);
  }

  /**
   * Calculate class placements (simplified logic)
   */
  private calculateClassPlacements(classId: string): void {
    try {
      const classScores = Array.from(this.recentScores.values())
        .filter(score => score.classId === classId)
        .sort((a, b) => b.score.totalScore - a.score.totalScore);

      if (classScores.length === 0) return;

      const placements = classScores.map((score, index) => ({
        position: index + 1,
        entryId: score.entryId,
        dogId: score.dogId,
        dogName: score.dogName,
        ownerName: score.ownerName,
        armband: score.armband,
        finalScore: score.score.totalScore,
        qualified: score.score.qualified,
        award: index < 3 ? this.getPlacementTitle(index + 1) : undefined,
      }));

      const placementResult: PlacementResult = {
        classId,
        className: classScores[0].className,
        showId: this.showId,
        judgeId: classScores[0].judgeId,
        judgeName: classScores[0].judgeName,
        placements,
        totalEntries: classScores.length,
        qualifyingEntries: classScores.filter(s => s.score.qualified).length,
        calculatedAt: new Date(),
        isComplete: true,
        isOfficial: false, // Auto-calculated are preliminary
      };

      this.processPlacementResult(placementResult);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { classId, showId: this.showId }
      });
    }
  }

  /**
   * Manually broadcast score result
   */
  async broadcastScore(scoreResult: ScoreResult): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'manual-score-broadcast',
        payload: scoreResult,
        metadata: {
          priority: 'high',
          timestamp: Date.now(),
        },
      });

      logger.info('Manual score broadcast', 'results', { armband: scoreResult.armband, totalScore: scoreResult.score.totalScore });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { scoreResult, showId: this.showId }
      });
      throw error;
    }
  }

  /**
   * Manually broadcast placement results
   */
  async broadcastPlacements(placementResult: PlacementResult): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'manual-placement-broadcast',
        payload: placementResult,
        metadata: {
          priority: 'critical',
          timestamp: Date.now(),
        },
      });

      logger.info('Manual placement broadcast', 'results', { className: placementResult.className });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { placementResult, showId: this.showId }
      });
      throw error;
    }
  }

  /**
   * Event listener management
   */
  onScoreResult(listener: (result: ScoreResult) => void): () => void {
    this.scoreListeners.add(listener);
    return () => this.scoreListeners.delete(listener);
  }

  onPlacementResult(listener: (result: PlacementResult) => void): () => void {
    this.placementListeners.add(listener);
    return () => this.placementListeners.delete(listener);
  }

  onAwardResult(listener: (result: AwardResult) => void): () => void {
    this.awardListeners.add(listener);
    return () => this.awardListeners.delete(listener);
  }

  onNotification(listener: (notification: ResultsNotification) => void): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  /**
   * Data access methods
   */
  getRecentScores(): ScoreResult[] {
    return Array.from(this.recentScores.values());
  }

  getClassScores(classId: string): ScoreResult[] {
    return Array.from(this.recentScores.values())
      .filter(score => score.classId === classId);
  }

  getPlacementResults(): PlacementResult[] {
    return Array.from(this.placementResults.values());
  }

  getClassPlacements(classId: string): PlacementResult | undefined {
    return this.placementResults.get(classId);
  }

  getAwardResults(): AwardResult[] {
    return Array.from(this.awardResults.values());
  }

  getMetrics(): ResultsMetrics {
    return { ...this.metrics };
  }

  /**
   * Utility methods
   */
  private parsePlacementData(placementsData: unknown[]): PlacementResult['placements'] {
    return placementsData
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      .map(p => ({
        position: Number(p.position) || 0,
        entryId: String(p.entry_id || ''),
        dogId: String(p.dog_id || ''),
        dogName: String(p.dog_name || 'Unknown'),
        ownerName: String(p.owner_name || 'Unknown'),
        armband: String(p.armband || ''),
        finalScore: Number(p.final_score) || 0,
        qualified: Boolean(p.qualified),
        award: p.award ? String(p.award) : undefined,
        specialAward: p.special_award ? String(p.special_award) : undefined,
      }));
  }

  private getPlacementTitle(position: number): string {
    switch (position) {
      case 1: return '1st Place';
      case 2: return '2nd Place';
      case 3: return '3rd Place';
      case 4: return '4th Place';
      default: return `${position}${this.getOrdinalSuffix(position)} Place`;
    }
  }

  private getOrdinalSuffix(num: number): string {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  }

  private updateScoreMetrics(result: ScoreResult): void {
    this.metrics.scoresPosted++;
    this.metrics.lastActivity = new Date();

    // Update judge metrics
    if (!this.metrics.judgeActivity.has(result.judgeId)) {
      this.metrics.judgeActivity.set(result.judgeId, {
        judgeId: result.judgeId,
        judgeName: result.judgeName,
        scoresSubmitted: 0,
        averageSubmissionTime: 0,
        lastActivity: new Date(),
      });
    }

    const judgeMetrics = this.metrics.judgeActivity.get(result.judgeId)!;
    judgeMetrics.scoresSubmitted++;
    judgeMetrics.lastActivity = new Date();
  }

  private initializeMetrics(): ResultsMetrics {
    return {
      showId: this.showId,
      scoresPosted: 0,
      placementsCalculated: 0,
      awardsAnnounced: 0,
      notificationsSent: 0,
      averageScorePostingTime: 0,
      peakResultsRate: 0,
      lastActivity: new Date(),
      judgeActivity: new Map(),
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

export default ResultsBroadcaster;