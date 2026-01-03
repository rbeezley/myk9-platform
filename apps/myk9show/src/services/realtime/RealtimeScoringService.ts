import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';
import { BaseScore, Score, PlacementUpdate, ScoringConflict } from '@/types/scoring-types';
import { SyncQueue } from '../sync/SyncQueue';
import { debounce, throttle } from '@/utils/performance';
import { realtimePerformanceMonitor } from '../performance/realtimePerformanceMonitor';
import { uiPerformanceManager } from '../performance/uiPerformanceManager';
import { 
  optimizedChannelSubscribe, 
  setupOptimizedPresence,
  setupOptimizedListeners
} from '../../utils/realtimeOptimization';
import { performanceMonitor } from '../performance/PerformanceMonitor';
import { eventEmitter } from '../sync/eventEmitter';
// import type { SyncEventMap } from '../sync/types';

interface RealtimeScorePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Score | null;
  old: Score | null;
}

interface PresenceState {
  judgeId: string;
  judgeName: string;
  classId: string;
  lastActivity: Date;
  status: 'active' | 'idle' | 'offline';
}

interface RealtimeConfig {
  throttleMs: number;
  debounceMs: number;
  reconnectAttempts: number;
  reconnectDelay: number;
}

export class RealtimeScoringService {
  private static instance: RealtimeScoringService;
  private channel: RealtimeChannel | null = null;
  private presenceChannel: RealtimeChannel | null = null;
  private subscriptions = new Map<string, Set<(update: unknown) => void>>();
  private presenceStates = new Map<string, PresenceState>();
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  private config: RealtimeConfig = {
    throttleMs: 300,
    debounceMs: 500,
    reconnectAttempts: 5,
    reconnectDelay: 2000
  };

  private syncQueue: SyncQueue;
  
  // Performance optimization
  private presenceCleanup: (() => void) | null = null;
  private listenersCleanup: (() => void) | null = null;
  private messageQueue: Array<{ timestamp: number; data: Record<string, unknown> }> = [];
  private isOptimizationEnabled = true;

  private constructor() {
    this.syncQueue = new SyncQueue();
    
    // Start performance monitoring
    realtimePerformanceMonitor.startMonitoring();
    
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
    const timerId = performanceMonitor.startTimer('realtime-channel-setup');
    
    try {
      // Use optimized channel subscription with performance monitoring
      this.channel = await optimizedChannelSubscribe(
        'class-scores',
        () => supabase.channel('class-scores', {
          config: {
            presence: { key: 'scoring' }
          }
        }),
        {
          usePool: this.isOptimizationEnabled,
          enableCompression: true,
          batchMessages: true
        }
      );

      // Setup optimized listeners with performance monitoring
      this.listenersCleanup = setupOptimizedListeners(
        this.channel,
        {
          'postgres_changes_scores': this.handleScoreUpdate.bind(this),
          'postgres_changes_placements': this.handlePlacementUpdate.bind(this),
          'presence_sync': () => this.handlePresenceSync(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'presence_join': (data: any) => this.handlePresenceJoin(data.key, data.newPresences),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'presence_leave': (data: any) => this.handlePresenceLeave(data.key, data.leftPresences)
        },
        this
      );

      // Setup traditional listeners for Supabase-specific events
      this.channel
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'scores',
            filter: 'show_id=eq.active' 
          }, 
          this.handleScoreUpdate.bind(this)
        )
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'placements',
            filter: 'show_id=eq.active'
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
      await this.channel.subscribe((status) => {
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
          batchMessages: false // Presence needs immediate updates
        }
      );
      
      await this.presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = this.presenceChannel?.presenceState();
          this.updatePresenceStates(state);
        })
        .subscribe();

      performanceMonitor.endTimer(timerId, { 
        success: true,
        channelsSetup: 2,
        optimizationEnabled: this.isOptimizationEnabled
      });

    } catch (error) {
      console.error('Failed to setup realtime channels:', error);
      performanceMonitor.endTimer(timerId, { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.scheduleReconnect();
    }
  }

  // Score Update Handling with Performance Optimization
  private handleScoreUpdate = throttle(
    async (...args: unknown[]) => {
      const timerId = performanceMonitor.startTimer('score-update-handling');
      
      try {
        const payload = args[0] as RealtimePostgresChangesPayload<BaseScore>;
        const { eventType, new: newScore, old: oldScore } = payload as RealtimeScorePayload;
        
        // Use batched updates for better UI performance
        uiPerformanceManager.batchRealtimeUpdate(() => {
          // Emit real-time update event for performance monitoring
          eventEmitter.emit('realtime:ui-update', {
            type: 'score-update',
            timestamp: Date.now(),
            data: newScore || oldScore
          });
      
          // Update local cache first
          // TODO: Implement offline service when available
          console.log('TODO: Update offline cache for score:', newScore || oldScore);
          
          // Check for conflicts if this is an update
          if (eventType === 'UPDATE' && newScore && oldScore) {
            this.detectScoringConflict(newScore, oldScore).then(conflict => {
              if (conflict) {
                this.handleScoringConflict(conflict);
                return;
              }
            });
          }
          
          // Calculate new placements
          if (newScore?.classId) {
            // Broadcast placement updates - simplified without placement calculator
            this.broadcastPlacementUpdate({
              classId: newScore.classId,
              entryId: newScore.entryId,
              newPlacement: 1, // Placeholder placement
              timestamp: new Date()
            });
          }
          
          // Notify subscribers
          this.notifySubscribers('score-update', {
            eventType,
            score: newScore || oldScore,
            timestamp: new Date()
          });
        });

        performanceMonitor.endTimer(timerId, { 
          success: true,
          eventType,
          scoreId: (newScore || oldScore)?.id
        });
      } catch (error) {
        performanceMonitor.endTimer(timerId, { 
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    },
    this.config.throttleMs
  );

  // Placement Update Handling
  private handlePlacementUpdate = debounce(
    async (...args: unknown[]) => {
      const payload = args[0] as RealtimePostgresChangesPayload<PlacementUpdate>;
      const { new: placement } = payload as RealtimePostgresChangesPayload<PlacementUpdate>;
      
      if (placement) {
        const placementData = placement as Record<string, unknown>;
        this.notifySubscribers('placement-update', {
          classId: placementData.class_id as string,
          placements: placementData.placements as unknown[],
          timestamp: new Date()
        });
      }
    },
    this.config.debounceMs
  );

  // Conflict Detection
  private async detectScoringConflict(
    newScore: Score, 
    oldScore: Score
  ): Promise<ScoringConflict | null> {
    // Check if scores were updated by different judges within a short time window
    const timeDiff = new Date(newScore.lastModified).getTime() - 
                     new Date(oldScore.lastModified).getTime();
    
    if (timeDiff < 5000 && newScore.judgeId !== oldScore.judgeId) {
      return {
        id: `conflict-${newScore.id}-${Date.now()}`,
        entryId: newScore.entryId,
        classId: newScore.classId,
        conflictType: 'judge_conflict',
        details: {
          oldJudge: oldScore.judgeId,
          newJudge: newScore.judgeId,
          timeDiff
        },
        timestamp: new Date(),
        resolved: false
      };
    }
    
    return null;
  }

  // Conflict Handling
  private async handleScoringConflict(conflict: ScoringConflict) {
    // Notify UI about conflict
    this.notifySubscribers('scoring-conflict', conflict);
    
    // TODO: Implement conflict resolution when conflict resolver is properly set up
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
      const state: PresenceState = {
        judgeId: (presenceData.judgeId || presenceData.judge_id) as string,
        judgeName: (presenceData.judgeName || presenceData.judge_name) as string,
        classId: (presenceData.classId || presenceData.class_id) as string,
        lastActivity: new Date((presenceData.lastActivity || presenceData.last_activity) as string),
        status: 'active'
      };
      
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
        judgeName
      });
    });
  }

  private updatePresenceStates(state: Record<string, unknown[]> | undefined) {
    this.presenceStates.clear();
    
    if (state) {
      Object.entries(state).forEach(([, presences]: [string, unknown[]]) => {
        if (Array.isArray(presences)) {
          presences.forEach(presence => {
            const presenceData = presence as Record<string, unknown>;
            const presenceState: PresenceState = {
              judgeId: (presenceData.judgeId || presenceData.judge_id) as string,
              judgeName: (presenceData.judgeName || presenceData.judge_name) as string,
              classId: (presenceData.classId || presenceData.class_id) as string,
              lastActivity: new Date((presenceData.lastActivity || presenceData.last_activity) as string),
              status: (presenceData.status as PresenceState['status']) || 'active'
            };
            this.presenceStates.set(presenceState.judgeId, presenceState);
          });
        }
      });
    }
    
    this.notifySubscribers('presence-sync', Array.from(this.presenceStates.values()));
  }

  // Public Methods

  async subscribeToClass(): Promise<void> {
    if (!this.channel) {
      await this.setupChannels();
    }
    
    // TODO: Update channel subscription filter when needed
    // Supabase realtime doesn't support dynamic filter updates
    // Would need to recreate channel with new filter
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
    
    const timerId = performanceMonitor.startTimer('judge-presence-update');
    
    try {
      // Setup optimized presence tracking if not already done
      if (!this.presenceCleanup) {
        this.presenceCleanup = setupOptimizedPresence(
          this.channel,
          {
            judge_id: judgeId,
            judge_name: judgeName,
            class_id: classId,
            last_activity: new Date().toISOString(),
            status
          },
          {
            heartbeatInterval: 30000, // 30 seconds
            adaptiveHeartbeat: true
          }
        );
      } else {
        // Update existing presence
        await this.channel.track({
          judge_id: judgeId,
          judge_name: judgeName,
          class_id: classId,
          last_activity: new Date().toISOString(),
          status
        });
      }

      performanceMonitor.endTimer(timerId, { 
        success: true,
        judgeId,
        status
      });
    } catch (error) {
      performanceMonitor.endTimer(timerId, { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async submitScore(score: Omit<Score, 'id' | 'created_at' | 'updated_at'>): Promise<Score> {
    // Create score object with id
    const localScore: Score = {
      id: `score-${Date.now()}`,
      ...score
    };
    
    // Queue for sync if online
    if (this.isConnected) {
      // TODO: Implement proper sync queue when available
      try {
        await this.directSubmitToSupabase(localScore);
      } catch (error) {
        console.error('Failed to submit score:', error);
      }
    }
    
    return localScore;
  }

  async updateScore(scoreId: string, updates: Partial<Score>): Promise<Score> {
    // Create updated score object
    const updatedScore: Score = {
      id: scoreId,
      ...updates
    } as Score;
    
    // Queue for sync if online
    if (this.isConnected) {
      // TODO: Implement proper sync queue when available
      try {
        await this.directSubmitToSupabase(updatedScore);
      } catch (error) {
        console.error('Failed to update score:', error);
      }
    }
    
    return updatedScore;
  }

  async deleteScore(scoreId: string): Promise<void> {
    // Queue for sync if online
    if (this.isConnected) {
      // TODO: Implement proper sync queue when available
      try {
        await this.directDeleteFromSupabase(scoreId);
      } catch (error) {
        console.error('Failed to delete score:', error);
      }
    }
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
          console.error(`Error in subscriber for ${event}:`, error);
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
          event: 'ping'
        });
      }
    }, 30000); // Every 30 seconds
  }

  private async handleOnline() {
    console.log('Connection restored, reconnecting to realtime...');
    await this.reconnect();
  }

  private handleOffline() {
    console.log('Connection lost, switching to offline mode');
    this.isConnected = false;
    this.notifySubscribers('connection-lost', { timestamp: new Date() });
  }

  private handleConnectionChange(status: string) {
    console.log('Realtime connection status:', status);
    
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
      
      console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
      
      this.reconnectTimer = setTimeout(() => {
        this.reconnect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.notifySubscribers('connection-failed', { 
        attempts: this.reconnectAttempts,
        timestamp: new Date() 
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
      
      // Process any queued updates
      // TODO: Implement processQueue when SyncQueue is properly set up
      
    } catch (error) {
      console.error('Reconnection failed:', error);
      this.scheduleReconnect();
    }
  }

  // Cleanup with Performance Optimization
  async disconnect() {
    const timerId = performanceMonitor.startTimer('realtime-disconnect');
    
    try {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }
      
      // Cleanup optimized components
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
      
      // Stop performance monitoring
      realtimePerformanceMonitor.stopMonitoring();

      performanceMonitor.endTimer(timerId, { success: true });
    } catch (error) {
      performanceMonitor.endTimer(timerId, { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Performance Configuration Methods
  
  /**
   * Enable or disable performance optimizations
   */
  setOptimizationEnabled(enabled: boolean): void {
    this.isOptimizationEnabled = enabled;
    
    if (enabled) {
      realtimePerformanceMonitor.startMonitoring();
    } else {
      realtimePerformanceMonitor.stopMonitoring();
    }
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics() {
    return realtimePerformanceMonitor.getMetrics();
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    return realtimePerformanceMonitor.getPerformanceSummary();
  }

  /**
   * Force performance optimization
   */
  forceOptimization(): void {
    realtimePerformanceMonitor.forceOptimization();
  }

  // Helper methods for direct Supabase operations
  private async directSubmitToSupabase(score: Score): Promise<void> {
    // TODO: Implement direct Supabase submission
    console.log('TODO: Submit score to Supabase:', score);
  }

  private async directDeleteFromSupabase(scoreId: string): Promise<void> {
    // TODO: Implement direct Supabase deletion
    console.log('TODO: Delete score from Supabase:', scoreId);
  }
}