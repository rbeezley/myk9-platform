import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';
import { logger } from '@/services/LoggingService';
import { BaseScore, Score, PlacementUpdate, ScoringConflict } from '@/types/scoring-types';
import { syncQueue } from '../sync/SyncQueue';
import { offlineScoringService } from '../scoring/OfflineScoringService';
import { scoreSyncProcessor } from '../sync/scoreSyncProcessor';
import { debounce, throttle } from '@/utils/performance';
import {
  optimizedChannelSubscribe,
  setupOptimizedPresence,
  setupOptimizedListeners,
} from '../../utils/realtimeOptimization';
import { eventEmitter } from '../sync/eventEmitter';
// import type { SyncEventMap } from '../sync/types';

import type {
  RealtimeScorePayload,
  PresenceState,
  RealtimeConfig,
} from './RealtimeScoringService.types';
import {
  parsePresenceRecord,
  detectScoringConflict,
  buildPresenceStates,
  DEFAULT_REALTIME_CONFIG,
  createLocalScore,
  buildUpdatedScore,
  cacheAndEnqueueScore,
  removeAndEnqueueDeletion,
  resumeSyncIfOnline,
} from './RealtimeScoringService.helpers';

// Re-export types for backward compatibility
export type {
  RealtimeScorePayload,
  PresenceState,
  RealtimeConfig,
} from './RealtimeScoringService.types';

export class RealtimeScoringService {
  private static instance: RealtimeScoringService;
  private channel: RealtimeChannel | null = null;
  private presenceChannel: RealtimeChannel | null = null;
  private subscriptions = new Map<string, Set<(update: unknown) => void>>();
  private presenceStates = new Map<string, PresenceState>();
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private config: RealtimeConfig = { ...DEFAULT_REALTIME_CONFIG };

  // Performance optimization
  private presenceCleanup: (() => void) | null = null;
  private listenersCleanup: (() => void) | null = null;
  private messageQueue: Array<{ timestamp: number; data: Record<string, unknown> }> = [];
  private isOptimizationEnabled = true;

  private constructor() {
    // Register the score sync processor with the shared sync queue
    syncQueue.registerProcessor(scoreSyncProcessor);

    this.initialize();
  }

  static getInstance(): RealtimeScoringService {
    if (!RealtimeScoringService.instance) {
      RealtimeScoringService.instance = new RealtimeScoringService();
    }
    return RealtimeScoringService.instance;
  }

  private async initialize() {
    // Set up connection monitoring
    this.monitorConnection();

    // Initialize channels
    await this.setupChannels();
  }

  private async setupChannels() {
    try {
      // Use optimized channel subscription with performance monitoring
      this.channel = await optimizedChannelSubscribe(
        'class-scores',
        () =>
          supabase.channel('class-scores', {
            config: {
              presence: { key: 'scoring' },
            },
          }),
        {
          usePool: this.isOptimizationEnabled,
          enableCompression: true,
          batchMessages: true,
        }
      );

      // Setup optimized listeners with performance monitoring
      this.listenersCleanup = setupOptimizedListeners(
        this.channel,
        {
          postgres_changes_scores: this.handleScoreUpdate.bind(this),
          postgres_changes_placements: this.handlePlacementUpdate.bind(this),
          presence_sync: () => this.handlePresenceSync(),
          presence_join: (data: { key: string; newPresences: unknown[] }) =>
            this.handlePresenceJoin(data.key, data.newPresences),
          presence_leave: (data: { key: string; leftPresences: unknown[] }) =>
            this.handlePresenceLeave(data.key, data.leftPresences),
        },
        this
      );

      // Setup traditional listeners for Supabase-specific events
      this.channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'scores',
            filter: 'show_id=eq.active',
          },
          this.handleScoreUpdate.bind(this)
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'placements',
            filter: 'show_id=eq.active',
          },
          this.handlePlacementUpdate.bind(this)
        )
        .on('presence', { event: 'sync' }, () => {
          this.handlePresenceSync();
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          this.handlePresenceJoin(key, newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          this.handlePresenceLeave(key, leftPresences);
        });

      // Subscribe to channel
      await this.channel.subscribe(status => {
        this.isConnected = status === 'SUBSCRIBED';
        this.handleConnectionChange(status);
      });

      // Judge presence channel with optimization
      this.presenceChannel = await optimizedChannelSubscribe(
        'judge-presence',
        () => supabase.channel('judge-presence'),
        {
          usePool: this.isOptimizationEnabled,
          enableCompression: false, // Presence data is typically small
          batchMessages: false, // Presence needs immediate updates
        }
      );

      await this.presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = this.presenceChannel?.presenceState();
          this.updatePresenceStates(state);
        })
        .subscribe();
    } catch (error) {
      logger.error('Failed to setup realtime channels', 'realtime', {}, error as Error);
      this.scheduleReconnect();
    }
  }

  // Score Update Handling
  private handleScoreUpdate = throttle(async (...args: unknown[]) => {
    const payload = args[0] as RealtimePostgresChangesPayload<BaseScore>;
    const { eventType, new: newScore, old: oldScore } = payload as RealtimeScorePayload;

    // Emit real-time update event
    eventEmitter.emit('realtime:ui-update', {
      type: 'score-update',
      timestamp: Date.now(),
      data: newScore || oldScore,
    });

    // Update local cache based on event type
    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      if (newScore) {
        offlineScoringService.cacheScore(newScore as BaseScore).catch(err => {
          logger.error('Failed to cache realtime score', 'realtime', {}, err as Error);
        });

        const pendingScores = offlineScoringService.getPendingScores();
        const matchingPending = pendingScores.find(
          s => s.entryId === newScore.entryId && s.classId === newScore.classId
        );
        if (matchingPending && matchingPending.id) {
          offlineScoringService
            .updateCacheWithServerData(matchingPending.id, newScore as BaseScore)
            .catch(err => {
              logger.error('Failed to update cache with server data', 'realtime', {}, err as Error);
            });
        }
      }
    } else if (eventType === 'DELETE' && oldScore) {
      if (oldScore.id) {
        offlineScoringService.removeScore(oldScore.id as string).catch(err => {
          logger.error('Failed to remove score from cache', 'realtime', {}, err as Error);
        });
      }
    }

    // Check for conflicts if this is an update
    if (eventType === 'UPDATE' && newScore && oldScore) {
      const conflict = detectScoringConflict(newScore, oldScore);
      if (conflict) {
        this.handleScoringConflict(conflict);
      }
    }

    // Calculate new placements
    if (newScore?.classId) {
      this.broadcastPlacementUpdate({
        classId: newScore.classId,
        entryId: newScore.entryId,
        newPlacement: 1,
        timestamp: new Date(),
      });
    }

    // Notify subscribers
    this.notifySubscribers('score-update', {
      eventType,
      score: newScore || oldScore,
      timestamp: new Date(),
    });
  }, this.config.throttleMs);

  // Placement Update Handling
  private handlePlacementUpdate = debounce(async (...args: unknown[]) => {
    const payload = args[0] as RealtimePostgresChangesPayload<PlacementUpdate>;
    const { new: placement } = payload as RealtimePostgresChangesPayload<PlacementUpdate>;

    if (placement) {
      const placementData = placement as Record<string, unknown>;
      this.notifySubscribers('placement-update', {
        classId: placementData.class_id as string,
        placements: placementData.placements as unknown[],
        timestamp: new Date(),
      });
    }
  }, this.config.debounceMs);

  // Conflict Handling — last-write-wins with UI notification
  private async handleScoringConflict(conflict: ScoringConflict) {
    // Notify UI so the judge can review the conflict
    this.notifySubscribers('scoring-conflict', conflict);

    // Auto-resolve with last-write-wins: the newest score takes precedence.
    // The server-side row already reflects the latest write, so we just
    // mark the conflict as resolved and let the UI refresh from the DB.
    conflict.resolved = true;

    logger.info('Scoring conflict auto-resolved (last-write-wins)', 'realtime', {
      conflictId: conflict.id,
      entryId: conflict.entryId,
      conflictType: conflict.conflictType,
    });

    this.notifySubscribers('conflict-resolved', conflict);
  }

  // Presence Management
  private handlePresenceSync() {
    const state = this.channel?.presenceState();
    if (state) {
      this.updatePresenceStates(state);
    }
  }

  private handlePresenceJoin(key: string, newPresences: unknown[]) {
    newPresences.forEach(presence => {
      const presenceData = presence as Record<string, unknown>;
      const state = parsePresenceRecord(presenceData);
      state.status = 'active';

      this.presenceStates.set(state.judgeId, state);
      this.notifySubscribers('judge-joined', state);
    });
  }

  private handlePresenceLeave(key: string, leftPresences: unknown[]) {
    leftPresences.forEach(presence => {
      const presenceData = presence as Record<string, unknown>;
      const judgeId = (presenceData.judgeId || presenceData.judge_id) as string;
      const judgeName = (presenceData.judgeName || presenceData.judge_name) as string;

      this.presenceStates.delete(judgeId);
      this.notifySubscribers('judge-left', {
        judgeId,
        judgeName,
      });
    });
  }

  private updatePresenceStates(state: Record<string, unknown[]> | undefined) {
    this.presenceStates = buildPresenceStates(state);
    this.notifySubscribers('presence-sync', Array.from(this.presenceStates.values()));
  }

  // Public Methods

  async subscribeToClass(classId?: string): Promise<void> {
    if (!this.channel || classId) {
      // Supabase realtime channels don't support dynamic filter changes.
      // Tear down the existing channel and recreate with the new filter.
      if (this.channel) {
        await this.channel.unsubscribe();
        this.channel = null;
      }
      if (this.presenceChannel) {
        await this.presenceChannel.unsubscribe();
        this.presenceChannel = null;
      }
      if (this.presenceCleanup) {
        this.presenceCleanup();
        this.presenceCleanup = null;
      }
      if (this.listenersCleanup) {
        this.listenersCleanup();
        this.listenersCleanup = null;
      }
      await this.setupChannels();
    }
  }

  async unsubscribeFromClass(classId: string): Promise<void> {
    // Remove class-specific subscriptions
    this.subscriptions.delete(`class-${classId}`);
  }

  async updateJudgePresence(
    judgeId: string,
    judgeName: string,
    classId: string,
    status: 'active' | 'idle' | 'offline' = 'active'
  ): Promise<void> {
    if (!this.channel) return;

    if (!this.presenceCleanup) {
      this.presenceCleanup = setupOptimizedPresence(
        this.channel,
        {
          judge_id: judgeId,
          judge_name: judgeName,
          class_id: classId,
          last_activity: new Date().toISOString(),
          status,
        },
        {
          heartbeatInterval: 30000,
          adaptiveHeartbeat: true,
        }
      );
    } else {
      await this.channel.track({
        judge_id: judgeId,
        judge_name: judgeName,
        class_id: classId,
        last_activity: new Date().toISOString(),
        status,
      });
    }
  }

  async submitScore(score: Omit<Score, 'id' | 'created_at' | 'updated_at'>): Promise<Score> {
    const localScore = createLocalScore(score);
    await cacheAndEnqueueScore(localScore, 'create');
    resumeSyncIfOnline(this.isConnected);
    return localScore;
  }

  async updateScore(scoreId: string, updates: Partial<Score>): Promise<Score> {
    const updatedScore = buildUpdatedScore(scoreId, updates);
    await cacheAndEnqueueScore(updatedScore, 'update');
    resumeSyncIfOnline(this.isConnected);
    return updatedScore;
  }

  async deleteScore(scoreId: string): Promise<void> {
    await removeAndEnqueueDeletion(scoreId);
    resumeSyncIfOnline(this.isConnected);
  }

  getActiveJudges(classId?: string): PresenceState[] {
    const judges = Array.from(this.presenceStates.values());

    if (classId) {
      return judges.filter(judge => judge.classId === classId);
    }

    return judges;
  }

  isJudgeActive(judgeId: string): boolean {
    const state = this.presenceStates.get(judgeId);
    return state?.status === 'active';
  }

  // Event Subscription
  subscribe(event: string, callback: (data: unknown) => void): () => void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }

    this.subscriptions.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscriptions.get(event)?.delete(callback);
    };
  }

  private notifySubscribers(event: string, data: unknown) {
    const subscribers = this.subscriptions.get(event);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error('Error in subscriber', 'realtime', { event }, error as Error);
        }
      });
    }
  }

  private broadcastPlacementUpdate(update: PlacementUpdate) {
    this.notifySubscribers('placement-update', update);
  }

  // Connection Management
  private monitorConnection() {
    // Monitor online/offline status
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Periodic connection check
    setInterval(() => {
      if (this.isConnected && this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'ping',
        });
      }
    }, 30000); // Every 30 seconds
  }

  private async handleOnline() {
    logger.info('Connection restored, reconnecting to realtime', 'realtime');
    await this.reconnect();

    // Resume sync queue processing now that we're online
    logger.debug('Resuming sync queue processing', 'realtime');
    syncQueue.resume();
  }

  private handleOffline() {
    logger.info('Connection lost, switching to offline mode', 'realtime');
    this.isConnected = false;
    this.notifySubscribers('connection-lost', { timestamp: new Date() });
  }

  private handleConnectionChange(status: string) {
    logger.debug('Realtime connection status', 'realtime', { status });

    if (status === 'SUBSCRIBED') {
      this.reconnectAttempts = 0;
      this.notifySubscribers('connection-restored', { timestamp: new Date() });
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts < this.config.reconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.config.reconnectDelay * this.reconnectAttempts;

      logger.debug('Scheduling reconnect attempt', 'realtime', {
        attempt: this.reconnectAttempts,
        delayMs: delay,
      });

      this.reconnectTimer = setTimeout(() => {
        this.reconnect();
      }, delay);
    } else {
      logger.error('Max reconnection attempts reached', 'realtime', {
        attempts: this.reconnectAttempts,
      });
      this.notifySubscribers('connection-failed', {
        attempts: this.reconnectAttempts,
        timestamp: new Date(),
      });
    }
  }

  private async reconnect() {
    try {
      // Cleanup existing channels
      if (this.channel) {
        await this.channel.unsubscribe();
      }
      if (this.presenceChannel) {
        await this.presenceChannel.unsubscribe();
      }

      // Re-setup channels
      await this.setupChannels();

      // Process any queued updates now that we're reconnected
      if (navigator.onLine) {
        logger.debug('Processing queued sync items after reconnection', 'realtime');
        syncQueue.resume();
      }
    } catch (error) {
      logger.error('Reconnection failed', 'realtime', {}, error as Error);
      this.scheduleReconnect();
    }
  }

  async disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.presenceCleanup) {
      this.presenceCleanup();
      this.presenceCleanup = null;
    }

    if (this.listenersCleanup) {
      this.listenersCleanup();
      this.listenersCleanup = null;
    }

    if (this.channel) {
      await this.channel.unsubscribe();
    }

    if (this.presenceChannel) {
      await this.presenceChannel.unsubscribe();
    }

    this.subscriptions.clear();
    this.presenceStates.clear();
    this.messageQueue = [];
    this.isConnected = false;
  }

  setOptimizationEnabled(enabled: boolean): void {
    this.isOptimizationEnabled = enabled;
  }
}
