export interface UserAction {
  id: string;
  type: 'navigation' | 'entity_access' | 'search' | 'create' | 'update' | 'delete';
  entityType?: 'club' | 'person' | 'dog' | 'show' | 'entry' | undefined;
  entityId?: string | undefined;
  route?: string | undefined;
  searchQuery?: string | undefined;
  timestamp: Date;
  sessionId: string;
  userId?: string | undefined;
  timeSpent?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface UserSession {
  id: string;
  userId?: string;
  startTime: Date;
  endTime?: Date;
  actions: UserAction[];
  totalTimeSpent: number;
  routesVisited: string[];
  entitiesAccessed: string[];
}

export interface BehaviorPattern {
  id: string;
  type: 'sequence' | 'frequency' | 'timing' | 'context';
  pattern: string;
  confidence: number;
  frequency: number;
  lastSeen: Date;
  metadata: Record<string, unknown>;
}

export interface UserProfile {
  userId: string;
  role: 'exhibitor' | 'judge' | 'secretary' | 'admin' | 'visitor';
  preferredEntityTypes: string[];
  commonRoutes: string[];
  peakUsageHours: number[];
  averageSessionDuration: number;
  totalSessions: number;
  lastActive: Date;
  behaviors: BehaviorPattern[];
}

export interface PredictiveInsight {
  type: 'next_route' | 'next_entity' | 'optimal_sync_time' | 'prefetch_opportunity';
  prediction: string;
  confidence: number;
  reasoning: string;
  suggestedAction?: string;
  estimatedValue: number; // How much this insight could help performance
}

export interface AnalyticsSummary {
  totalActions: number;
  totalSessions: number;
  uniqueUsers: number;
  behaviorPatterns: number;
  averageSessionDuration: number;
  topRoutes: string[];
  topEntityTypes: string[];
}

export interface PatternSequence {
  pattern: string;
  frequency: number;
}
