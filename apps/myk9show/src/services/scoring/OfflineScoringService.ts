/**
 * Offline Scoring Service
 * 
 * Core service for managing competition scoring in offline environments.
 * Provides real-time score entry, validation, and placement calculations
 * with full offline support and sync queue management.
 * 
 * Key Features:
 * - Complete offline scoring capability
 * - Real-time placement calculations
 * - Multi-format support (Scent Work, Agility, Obedience, etc.)
 * - Score validation and error checking
 * - Conflict resolution for multi-judge scenarios
 * - Background sync queue management
 * - Judge workflow management
 */

import { EventEmitter } from '../sync/eventEmitter';
import type {
  BaseScore,
  ScoringFormat,
  ScoringSession,
  ScoringEvent,
  ScoringEventType,
  ValidationResult,
  MultiJudgeScore,
  ConflictResolution,
  PlacementCalculation
} from '@/types/scoring-types';
import { DEFAULT_SCORING_CONFIGS } from '@/types/scoring-types';
import type { SyncQueueItem } from '@/services/sync/types';
import { syncService } from '@/services/sync/syncService';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import type { StateStorage } from 'zustand/middleware';
import { generateId } from '@/utils/idUtils';

export interface OfflineScoringServiceConfig {
  autoSaveInterval: number;    // Auto-save frequency in ms
  enableRealTimeSync: boolean; // Sync when online
  enablePlacementUpdates: boolean; // Real-time placement calculation
  conflictResolutionStrategy: ConflictResolution['strategy'];
  maxCacheSize: number;       // Maximum cached scores
}

const DEFAULT_CONFIG: OfflineScoringServiceConfig = {
  autoSaveInterval: 30000,    // 30 seconds
  enableRealTimeSync: true,
  enablePlacementUpdates: true,
  conflictResolutionStrategy: 'manual_override',
  maxCacheSize: 1000
};

/**
 * Main offline scoring service class
 */
export class OfflineScoringService extends EventEmitter {
  private config: OfflineScoringServiceConfig;
  private storage!: StateStorage;
  
  // Active scoring sessions
  private activeSessions = new Map<string, ScoringSession>();
  
  // Score storage (in-memory cache + persistent storage)
  private scoreCache = new Map<string, BaseScore>();
  private multiJudgeScores = new Map<string, MultiJudgeScore>();
  
  // Sync queue for offline operations
  private syncQueue: SyncQueueItem[] = [];
  private autoSaveTimer?: NodeJS.Timeout;
  
  // Placement cache for real-time updates
  private placementCache = new Map<string, PlacementCalculation>();
  
  constructor(config: Partial<OfflineScoringServiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeStorage();
  }

  // ========================================================================
  // Initialization and Setup
  // ========================================================================

  private async initializeStorage(): Promise<void> {
    try {
      this.storage = getOptimalStorage('scoring');
      await this.loadPersistedData();
      this.startAutoSave();
      this.emit('service_initialized', {});
    } catch (error) {
      console.error('Failed to initialize offline scoring service:', error);
      this.emit('service_error', { error: (error as Error).message });
    }
  }

  private async loadPersistedData(): Promise<void> {
    try {
      // Load scores from storage
      const storedScores = await this.storage.getItem('offline_scores') || '{}';
      const scores = JSON.parse(storedScores);
      
      Object.entries(scores).forEach(([id, score]) => {
        this.scoreCache.set(id, this.deserializeScore(score));
      });

      // Load multi-judge scores
      const storedMultiScores = await this.storage.getItem('multi_judge_scores') || '{}';
      const multiScores = JSON.parse(storedMultiScores);
      
      Object.entries(multiScores).forEach(([id, score]) => {
        this.multiJudgeScores.set(id, this.deserializeMultiJudgeScore(score));
      });

      // Load sync queue
      const storedQueue = await this.storage.getItem('scoring_sync_queue') || '[]';
      this.syncQueue = JSON.parse(storedQueue);

      // Load active sessions
      const storedSessions = await this.storage.getItem('scoring_sessions') || '{}';
      const sessions = JSON.parse(storedSessions);
      
      Object.entries(sessions).forEach(([id, session]) => {
        this.activeSessions.set(id, this.deserializeSession(session));
      });

      console.log(`Loaded ${this.scoreCache.size} scores, ${this.syncQueue.length} queued items`);
    } catch (error) {
      console.error('Failed to load persisted scoring data:', error);
    }
  }

  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(() => {
      this.persistData();
    }, this.config.autoSaveInterval);
  }

  // ========================================================================
  // Session Management
  // ========================================================================

  /**
   * Start a new scoring session for a judge and class
   */
  async startSession(
    classId: string,
    judgeId: string,
    format: ScoringFormat,
    totalEntries: number
  ): Promise<ScoringSession> {
    const sessionId = generateId();
    
    const session: ScoringSession = {
      id: sessionId,
      classId,
      judgeId,
      format,
      status: 'active',
      startTime: new Date(),
      totalEntries,
      completedEntries: [],
      isOffline: !navigator.onLine,
      pendingSync: []
    };

    this.activeSessions.set(sessionId, session);
    await this.persistSessions();
    
    this.emitEvent('session_started', {
      sessionId,
      classId,
      judgeId,
      format
    });

    return session;
  }

  /**
   * End a scoring session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.status = 'completed';
    session.endTime = new Date();

    await this.persistSessions();
    
    // Queue session completion for sync
    if (this.config.enableRealTimeSync) {
      await this.queueSessionForSync(session);
    }

    this.emitEvent('session_completed', {
      sessionId,
      duration: session.endTime.getTime() - session.startTime.getTime(),
      completedEntries: session.completedEntries
    });
  }

  /**
   * Get active session for a judge and class
   */
  getActiveSession(classId: string, judgeId: string): ScoringSession | null {
    for (const session of this.activeSessions.values()) {
      if (session.classId === classId && 
          session.judgeId === judgeId && 
          session.status === 'active') {
        return session;
      }
    }
    return null;
  }

  // ========================================================================
  // Score Management
  // ========================================================================

  /**
   * Submit a score for an entry
   */
  async submitScore(score: BaseScore): Promise<ValidationResult> {
    try {
      // Validate the score
      const validation = await this.validateScore(score);
      if (!validation.isValid) {
        return validation;
      }

      // Check for existing score and handle conflicts
      const existingScore = this.getScore(score.entryId, score.classId);
      if (existingScore && existingScore.judgeId !== score.judgeId) {
        return await this.handleMultiJudgeScore(score, existingScore);
      }

      // Store the score
      const scoreKey = this.getScoreKey(score.entryId, score.classId, score.judgeId);
      score.version = (existingScore?.version || 0) + 1;
      score.lastModified = new Date();
      score.syncStatus = 'pending';

      this.scoreCache.set(scoreKey, score);

      // Update session progress
      await this.updateSessionProgress(score);

      // Queue for sync if online
      if (this.config.enableRealTimeSync && navigator.onLine) {
        await this.queueScoreForSync(score);
      }

      // Update placements in real-time
      if (this.config.enablePlacementUpdates) {
        await this.updateClassPlacements(score.classId, score.format);
      }

      await this.persistData();

      this.emitEvent('score_submitted', {
        entryId: score.entryId,
        classId: score.classId,
        judgeId: score.judgeId,
        score
      });

      return { isValid: true, errors: [], warnings: [] };

    } catch (error) {
      console.error('Failed to submit score:', error);
      this.emitEvent('score_error', {
        entryId: score.entryId,
        error: (error as Error).message
      });
      
      return {
        isValid: false,
        errors: [{ field: 'general', message: (error as Error).message, code: 'SUBMISSION_ERROR' }],
        warnings: []
      };
    }
  }

  /**
   * Update an existing score
   */
  async updateScore(scoreKey: string, updates: Partial<BaseScore>): Promise<ValidationResult> {
    const existingScore = this.scoreCache.get(scoreKey);
    if (!existingScore) {
      return {
        isValid: false,
        errors: [{ field: 'general', message: 'Score not found', code: 'NOT_FOUND' }],
        warnings: []
      };
    }

    const updatedScore = {
      ...existingScore,
      ...updates,
      version: existingScore.version + 1,
      lastModified: new Date(),
      syncStatus: 'pending' as const
    };

    return await this.submitScore(updatedScore);
  }

  /**
   * Get a score for a specific entry and judge
   */
  getScore(entryId: string, classId: string, judgeId?: string): BaseScore | null {
    if (judgeId) {
      const scoreKey = this.getScoreKey(entryId, classId, judgeId);
      return this.scoreCache.get(scoreKey) || null;
    }

    // Find any score for this entry in this class
    for (const score of this.scoreCache.values()) {
      if (score.entryId === entryId && score.classId === classId) {
        return score;
      }
    }

    return null;
  }

  /**
   * Get all scores for a class
   */
  getClassScores(classId: string): BaseScore[] {
    const scores: BaseScore[] = [];
    
    for (const score of this.scoreCache.values()) {
      if (score.classId === classId) {
        scores.push(score);
      }
    }

    return scores.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  }

  /**
   * Delete a score
   */
  async deleteScore(entryId: string, classId: string, judgeId: string): Promise<void> {
    const scoreKey = this.getScoreKey(entryId, classId, judgeId);
    
    if (this.scoreCache.has(scoreKey)) {
      this.scoreCache.delete(scoreKey);
      
      // Queue deletion for sync
      await this.queueDeletionForSync(entryId, classId, judgeId);
      
      // Update placements
      if (this.config.enablePlacementUpdates) {
        const scores = this.getClassScores(classId);
        if (scores.length > 0) {
          await this.updateClassPlacements(classId, scores[0].format);
        }
      }

      await this.persistData();

      this.emitEvent('score_deleted', {
        entryId,
        classId,
        judgeId
      });
    }
  }

  // ========================================================================
  // Multi-Judge Support
  // ========================================================================

  private async handleMultiJudgeScore(
    newScore: BaseScore,
    existingScore: BaseScore
  ): Promise<ValidationResult> {
    const entryKey = `${newScore.entryId}-${newScore.classId}`;
    
    let multiScore = this.multiJudgeScores.get(entryKey);
    
    if (!multiScore) {
      // Create new multi-judge score entry
      multiScore = {
        entryId: newScore.entryId,
        classId: newScore.classId,
        format: newScore.format,
        judgeScores: new Map(),
        hasConflicts: false,
        lastUpdated: new Date(),
        syncStatus: 'pending'
      };
      
      // Add existing score
      multiScore.judgeScores.set(existingScore.judgeId, existingScore);
    }

    // Add new score
    multiScore.judgeScores.set(newScore.judgeId, newScore);
    multiScore.lastUpdated = new Date();

    // Check for conflicts
    multiScore.hasConflicts = this.detectConflicts(multiScore);

    // Apply conflict resolution if needed
    if (multiScore.hasConflicts) {
      multiScore.conflictResolution = await this.resolveConflicts();
    }

    this.multiJudgeScores.set(entryKey, multiScore);
    
    this.emitEvent('multi_judge_score_updated', {
      entryId: newScore.entryId,
      classId: newScore.classId,
      judgeCount: multiScore.judgeScores.size,
      hasConflicts: multiScore.hasConflicts
    });

    return { isValid: true, errors: [], warnings: [] };
  }

  private detectConflicts(multiScore: MultiJudgeScore): boolean {
    const scores = Array.from(multiScore.judgeScores.values());
    if (scores.length < 2) return false;

    // Check for qualification conflicts
    const qualifications = scores.map(s => s.qualification);
    const uniqueQualifications = new Set(qualifications);
    
    return uniqueQualifications.size > 1;
  }

  private async resolveConflicts(): Promise<ConflictResolution> {
    const resolution: ConflictResolution = {
      strategy: this.config.conflictResolutionStrategy,
      resolvedBy: 'system', // Will be updated if manual resolution
      resolvedAt: new Date(),
      resolutionNotes: 'Automatic conflict resolution applied'
    };


    switch (this.config.conflictResolutionStrategy) {
      case 'average':
        // Not applicable for qualification-based conflicts
        resolution.resolutionNotes = 'Manual resolution required for qualification conflicts';
        break;
        
      case 'judge_hierarchy':
        // Use score from judge with highest authority (implementation specific)
        resolution.resolutionNotes = 'Head judge score takes precedence';
        break;
        
      case 'head_judge_final':
        // Mark for head judge review
        resolution.resolutionNotes = 'Marked for head judge final decision';
        break;
        
      default:
        // Manual override required
        resolution.resolutionNotes = 'Manual override required';
        break;
    }

    return resolution;
  }

  // ========================================================================
  // Validation
  // ========================================================================

  private async validateScore(score: BaseScore): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Get format-specific configuration
    const config = DEFAULT_SCORING_CONFIGS[score.format];
    if (!config) {
      result.errors.push({
        field: 'format',
        message: `Unsupported scoring format: ${score.format}`,
        code: 'INVALID_FORMAT'
      });
      result.isValid = false;
      return result;
    }

    // Basic validation
    if (!score.entryId || !score.classId || !score.judgeId) {
      result.errors.push({
        field: 'general',
        message: 'Missing required identifiers',
        code: 'MISSING_IDS'
      });
      result.isValid = false;
    }

    if (!score.qualification) {
      result.errors.push({
        field: 'qualification',
        message: 'Qualification status is required',
        code: 'MISSING_QUALIFICATION'
      });
      result.isValid = false;
    }

    // Format-specific validation would be delegated to ScoreValidatorService
    // For now, we'll do basic checks

    return result;
  }

  // ========================================================================
  // Placement Calculation Integration
  // ========================================================================

  private async updateClassPlacements(classId: string, format: ScoringFormat): Promise<void> {
    try {
      const classScores = this.getClassScores(classId);
      
      // This would integrate with PlacementCalculatorService
      // For now, we'll emit an event for external calculation
      this.emitEvent('placement_update_needed', {
        classId,
        format,
        scoreCount: classScores.length
      });
      
    } catch (error) {
      console.error('Failed to update class placements:', error);
    }
  }

  // ========================================================================
  // Sync Queue Management
  // ========================================================================

  private async queueScoreForSync(score: BaseScore): Promise<void> {
    const syncItem: SyncQueueItem = {
      id: generateId(),
      entityType: 'entry',
      entityId: this.getScoreKey(score.entryId, score.classId, score.judgeId),
      operation: 'update',
      data: this.serializeScore(score),
      priority: 'medium',
      timestamp: new Date(),
      attempts: 0,
      retryCount: 0,
      status: 'pending'
    };

    this.syncQueue.push(syncItem);
    await this.persistSyncQueue();

    // Attempt immediate sync if online
    if (navigator.onLine && syncService) {
      try {
        await (syncService as { processQueue: () => Promise<void> }).processQueue();
      } catch (error) {
        console.log('Immediate sync failed, queued for later:', (error as Error).message);
      }
    }
  }

  private async queueDeletionForSync(entryId: string, classId: string, judgeId: string): Promise<void> {
    const syncItem: SyncQueueItem = {
      id: generateId(),
      entityType: 'entry',
      entityId: this.getScoreKey(entryId, classId, judgeId),
      operation: 'delete',
      data: { entryId, classId, judgeId },
      priority: 'medium',
      timestamp: new Date(),
      attempts: 0,
      retryCount: 0,
      status: 'pending'
    };

    this.syncQueue.push(syncItem);
    await this.persistSyncQueue();
  }

  private async queueSessionForSync(session: ScoringSession): Promise<void> {
    const syncItem: SyncQueueItem = {
      id: generateId(),
      entityType: 'entry',
      entityId: session.id,
      operation: 'update',
      data: this.serializeSession(session),
      priority: 'medium',
      timestamp: new Date(),
      attempts: 0,
      retryCount: 0,
      status: 'pending'
    };

    this.syncQueue.push(syncItem);
    await this.persistSyncQueue();
  }

  // ========================================================================
  // Persistence
  // ========================================================================

  private async persistData(): Promise<void> {
    try {
      // Persist scores
      const scores = Object.fromEntries(
        Array.from(this.scoreCache.entries()).map(([key, score]) => [
          key,
          this.serializeScore(score)
        ])
      );
      await this.storage.setItem('offline_scores', JSON.stringify(scores));

      // Persist multi-judge scores
      const multiScores = Object.fromEntries(
        Array.from(this.multiJudgeScores.entries()).map(([key, score]) => [
          key,
          this.serializeMultiJudgeScore(score)
        ])
      );
      await this.storage.setItem('multi_judge_scores', JSON.stringify(multiScores));

      await this.persistSyncQueue();
      await this.persistSessions();

    } catch (error) {
      console.error('Failed to persist scoring data:', error);
    }
  }

  private async persistSyncQueue(): Promise<void> {
    await this.storage.setItem('scoring_sync_queue', JSON.stringify(this.syncQueue));
  }

  private async persistSessions(): Promise<void> {
    const sessions = Object.fromEntries(
      Array.from(this.activeSessions.entries()).map(([key, session]) => [
        key,
        this.serializeSession(session)
      ])
    );
    await this.storage.setItem('scoring_sessions', JSON.stringify(sessions));
  }

  // ========================================================================
  // Serialization Helpers
  // ========================================================================

  private serializeScore(score: BaseScore): Record<string, unknown> {
    return {
      ...score,
      timestamp: score.timestamp.toISOString(),
      recordedAt: score.recordedAt.toISOString(),
      lastModified: score.lastModified.toISOString()
    };
  }

  private deserializeScore(data: unknown): BaseScore {
    const scoreData = data as Record<string, unknown>;
    return {
      ...scoreData,
      timestamp: new Date(scoreData.timestamp as string),
      recordedAt: new Date(scoreData.recordedAt as string),
      lastModified: new Date(scoreData.lastModified as string)
    } as BaseScore;
  }

  private serializeMultiJudgeScore(score: MultiJudgeScore): Record<string, unknown> {
    return {
      ...score,
      judgeScores: Object.fromEntries(score.judgeScores),
      lastUpdated: score.lastUpdated.toISOString(),
      conflictResolution: score.conflictResolution ? {
        ...score.conflictResolution,
        resolvedAt: score.conflictResolution.resolvedAt.toISOString()
      } : undefined
    };
  }

  private deserializeMultiJudgeScore(data: unknown): MultiJudgeScore {
    const multiData = data as Record<string, unknown>;
    return {
      ...multiData,
      judgeScores: new Map(Object.entries(multiData.judgeScores || {} as Record<string, BaseScore>)),
      lastUpdated: new Date(multiData.lastUpdated as string),
      conflictResolution: multiData.conflictResolution ? {
        ...(multiData.conflictResolution as ConflictResolution),
        resolvedAt: new Date((multiData.conflictResolution as ConflictResolution).resolvedAt)
      } : undefined
    } as MultiJudgeScore;
  }

  private serializeSession(session: ScoringSession): Record<string, unknown> {
    return {
      ...session,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime?.toISOString(),
      lastSyncAt: session.lastSyncAt?.toISOString(),
      pendingSync: session.pendingSync.map(score => this.serializeScore(score))
    };
  }

  private deserializeSession(data: unknown): ScoringSession {
    const sessionData = data as Record<string, unknown>;
    return {
      ...sessionData,
      startTime: new Date(sessionData.startTime as string),
      endTime: sessionData.endTime ? new Date(sessionData.endTime as string) : undefined,
      lastSyncAt: sessionData.lastSyncAt ? new Date(sessionData.lastSyncAt as string) : undefined,
      pendingSync: ((sessionData.pendingSync || []) as unknown[]).map((score) => this.deserializeScore(score))
    } as ScoringSession;
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  private getScoreKey(entryId: string, classId: string, judgeId: string): string {
    return `${entryId}-${classId}-${judgeId}`;
  }

  private async updateSessionProgress(score: BaseScore): Promise<void> {
    for (const session of this.activeSessions.values()) {
      if (session.classId === score.classId && session.judgeId === score.judgeId) {
        session.completedEntries = this.getClassScores(score.classId).map(s => s.entryId);
        break;
      }
    }
  }

  private emitEvent(type: ScoringEventType, data: Record<string, unknown>): void {
    const event: ScoringEvent = {
      type,
      entryId: (data as Record<string, string>).entryId || '',
      classId: (data as Record<string, string>).classId || '',
      judgeId: (data as Record<string, string>).judgeId || '',
      timestamp: new Date(),
      data
    };

    this.emit(type, event);
    this.emit('scoring_event', event);
  }

  // ========================================================================
  // Public API Methods
  // ========================================================================

  /**
   * Get sync queue status
   */
  getSyncQueueStatus(): { pending: number; failed: number; lastSync?: Date } {
    const pending = this.syncQueue.filter(item => (item.attempts || 0) < (item.attempts || 3)).length;
    const failed = this.syncQueue.filter(item => (item.attempts || 0) >= (item.attempts || 3)).length;
    
    return { pending, failed };
  }

  /**
   * Force sync all pending items
   */
  async forceSyncAll(): Promise<void> {
    if (syncService && navigator.onLine) {
      await syncService.processQueue();
    }
  }

  /**
   * Clear all cached data (use with caution)
   */
  async clearCache(): Promise<void> {
    this.scoreCache.clear();
    this.multiJudgeScores.clear();
    this.syncQueue.length = 0;
    this.activeSessions.clear();
    this.placementCache.clear();
    
    await this.persistData();
    
    this.emit('cache_cleared', {});
  }

  /**
   * Get service statistics
   */
  getStatistics(): {
    cachedScores: number;
    activeSessions: number;
    pendingSyncItems: number;
    totalScoresSubmitted: number;
  } {
    return {
      cachedScores: this.scoreCache.size,
      activeSessions: Array.from(this.activeSessions.values()).filter(s => s.status === 'active').length,
      pendingSyncItems: this.syncQueue.length,
      totalScoresSubmitted: this.scoreCache.size
    };
  }

  /**
   * Cleanup old data
   */
  async cleanup(): Promise<void> {
    // Remove completed sessions older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const [id, session] of this.activeSessions.entries()) {
      if (session.status === 'completed' && session.endTime && session.endTime < cutoff) {
        this.activeSessions.delete(id);
      }
    }

    // Cleanup sync queue of successfully processed items
    this.syncQueue = this.syncQueue.filter(item => 
      (item.attempts || 0) < (item.attempts || 3) || 
      new Date((item as { timestamp: string | number | Date }).timestamp) > cutoff
    );

    await this.persistData();
  }

  /**
   * Destroy service and cleanup
   */
  async destroy(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    await this.persistData();
    this.removeAllListeners();
  }
}

// Singleton instance
export const offlineScoringService = new OfflineScoringService();