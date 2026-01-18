// Common priority type used across all realtime and competition services
export type Priority = 'low' | 'medium' | 'high' | 'critical';

// Base realtime types
export interface RealtimeEvent {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  data: unknown;
  timestamp: Date;
  source: 'local' | 'remote';
  userId?: string | undefined;
  sessionId?: string | undefined;
}

// Scoring-specific realtime types
export interface ScoreUpdate {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  score: Score;
  timestamp: Date;
  judgeId: string;
  judgeName: string;
}

export interface PlacementUpdate {
  classId: string;
  showId: string;
  placements: PlacementData[];
  timestamp: Date;
  calculatedBy: string;
}

export interface PlacementData {
  dogId: string;
  placement: number;
  finalScore: number;
  time: number;
  faults: number;
  qualified: boolean;
}

export interface JudgePresence {
  judgeId: string;
  judgeName: string;
  classId: string;
  lastActivity: Date;
  status: 'active' | 'idle' | 'offline';
}

export interface ScoringConflict {
  id: string;
  type: 'concurrent_update' | 'duplicate_score' | 'invalid_data';
  entityType: 'score' | 'placement';
  entityId: string;
  localValue: unknown;
  remoteValue: unknown;
  detectedAt: Date;
  status: 'pending' | 'resolved' | 'ignored';
  resolution?: ConflictResolution | undefined;
}

export interface ConflictResolution {
  strategy: 'accept_local' | 'accept_remote' | 'merge' | 'manual';
  resolvedAt: Date;
  resolvedBy: string;
  finalValue: unknown;
  notes?: string | undefined;
}

// Connection types
export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastConnected: Date | null;
  reconnectAttempts: number;
  error: string | null;
}

export interface ConnectionMetrics {
  totalConnections: number;
  totalDisconnections: number;
  averageReconnectTime: number;
  lastReconnectTime: number;
  connectionUptime: number;
}

// Subscription types
export interface RealtimeSubscription {
  id: string;
  channelName: string;
  table: string;
  filter?: string | undefined;
  events: string[];
  callback: (payload: unknown) => void;
  isActive: boolean;
  createdAt: Date;
}

export interface PresenceState {
  [key: string]: {
    judge_id: string;
    judge_name: string;
    class_id: string;
    last_activity: string;
    status: 'active' | 'idle' | 'offline';
  }[];
}

// Event types for the event bus
export type RealtimeEventType = 
  | 'score-created'
  | 'score-updated' 
  | 'score-deleted'
  | 'placement-updated'
  | 'placement-calculated'
  | 'judge-joined'
  | 'judge-left'
  | 'judge-status-changed'
  | 'conflict-detected'
  | 'conflict-resolved'
  | 'sync-started'
  | 'sync-completed'
  | 'sync-failed'
  | 'connection-restored'
  | 'connection-lost'
  | 'channel-error';

// Sync queue integration
export interface RealtimeSyncEvent {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: 'score' | 'placement' | 'entry';
  data: unknown;
  timestamp: Date;
  retries: number;
  priority: Priority;
  sourceEvent?: RealtimeEvent | undefined;
}

// Performance monitoring
export interface RealtimePerformanceMetrics {
  eventProcessingTime: number;
  subscriptionCount: number;
  activeChannels: number;
  messageQueueSize: number;
  memoryUsage: number;
  cpuUsage: number;
  networkLatency: number;
  lastMetricsUpdate: Date;
}

// Error types
export interface RealtimeError {
  code: string;
  message: string;
  details?: Record<string, unknown> | undefined;
  timestamp: Date;
  source: 'connection' | 'subscription' | 'processing' | 'sync';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Configuration
export interface RealtimeConfig {
  enabled: boolean;
  connectionTimeout: number;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  eventHistorySize: number;
  performanceMonitoring: boolean;
  debugMode: boolean;
}

// Channel configuration
export interface ChannelConfig {
  name: string;
  table: string;
  filter?: string | undefined;
  events: string[];
  enablePresence: boolean;
  enableBroadcast: boolean;
  metadata?: Record<string, unknown> | undefined;
}

// Presence tracking
export interface PresenceTrackingData {
  user_id: string;
  user_name: string;
  role: 'judge' | 'secretary' | 'steward';
  class_id?: string | undefined;
  show_id?: string | undefined;
  status: 'active' | 'idle' | 'away';
  last_seen: string;
  device_info?: {
    type: 'desktop' | 'tablet' | 'mobile';
    os: string;
    browser: string;
  } | undefined;
}

// Batch operations
export interface BatchOperation {
  id: string;
  operations: RealtimeSyncEvent[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt: Date;
  completedAt?: Date | undefined;
  error?: RealtimeError | undefined;
}

// Real-time scoring specific interfaces
export interface LiveScoringSession {
  sessionId: string;
  classId: string;
  showId: string;
  judgeId: string;
  startedAt: Date;
  endedAt?: Date | undefined;
  status: 'active' | 'paused' | 'completed';
  scoresSubmitted: number;
  conflictsDetected: number;
  averageSubmissionTime: number;
}

export interface ScoringActivity {
  id: string;
  sessionId: string;
  type: 'score_submitted' | 'score_updated' | 'conflict_detected' | 'placement_changed';
  timestamp: Date;
  data: unknown;
  processed: boolean;
}

// Integration with existing types
export interface Score {
  id: string;
  class_id: string;
  show_id: string;
  dog_id: string;
  judge_id: string;
  points: number;
  time: number;
  faults: number;
  notes: string;
  placement: number;
  status: 'draft' | 'submitted' | 'final';
  created_at: string;
  updated_at: string;
}

// Missing exports that are needed by hooks
export interface SubscriptionConfig {
  table: string;
  filter?: string | undefined;
  events: string[];
  enablePresence?: boolean | undefined;
  enableBroadcast?: boolean | undefined;
}

export interface SubscriptionMetrics {
  subscriptions: number;
  activeChannels: number;
  messagesReceived: number;
  messagesLost: number;
  averageLatency: number;
}

export interface ConnectionHealth {
  isConnected: boolean;
  connectionQuality: 'poor' | 'fair' | 'good' | 'excellent';
  latency: number;
  packetLoss: number;
}

export interface BroadcastEvent {
  type: string;
  payload: unknown;
  timestamp: number;
}

// Utility types
export type RealtimeEventCallback<T = unknown> = (event: RealtimeEvent & { data: T }) => void;
export type ConnectionEventCallback = (state: ConnectionState) => void;
export type PresenceEventCallback = (presence: JudgePresence) => void;