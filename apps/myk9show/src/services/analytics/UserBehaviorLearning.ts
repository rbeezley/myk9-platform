import { logger } from '@/services/LoggingService';

interface UserAction {
  id: string;
  type: 'navigation' | 'entity_access' | 'search' | 'create' | 'update' | 'delete';
  entityType?: 'club' | 'person' | 'dog' | 'show' | 'entry';
  entityId?: string;
  route?: string;
  searchQuery?: string;
  timestamp: Date;
  sessionId: string;
  userId?: string;
  timeSpent?: number;
  metadata?: Record<string, unknown>;
}

interface UserSession {
  id: string;
  userId?: string;
  startTime: Date;
  endTime?: Date;
  actions: UserAction[];
  totalTimeSpent: number;
  routesVisited: string[];
  entitiesAccessed: string[];
}

interface BehaviorPattern {
  id: string;
  type: 'sequence' | 'frequency' | 'timing' | 'context';
  pattern: string;
  confidence: number;
  frequency: number;
  lastSeen: Date;
  metadata: Record<string, unknown>;
}

interface UserProfile {
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

interface PredictiveInsight {
  type: 'next_route' | 'next_entity' | 'optimal_sync_time' | 'prefetch_opportunity';
  prediction: string;
  confidence: number;
  reasoning: string;
  suggestedAction?: string;
  estimatedValue: number; // How much this insight could help performance
}

export class UserBehaviorLearning {
  private currentSession: UserSession | null = null;
  private userProfiles = new Map<string, UserProfile>();
  private globalPatterns: BehaviorPattern[] = [];
  private actionHistory: UserAction[] = [];
  private maxHistorySize = 1000;
  private minPatternFrequency = 3;
  private patternDecayDays = 30;

  constructor() {
    this.loadFromStorage();
    this.startNewSession();
    this.setupEventListeners();
    this.scheduleAnalysis();
  }

  /**
   * Track a user action
   */
  trackAction(action: Omit<UserAction, 'id' | 'timestamp' | 'sessionId'>): void {
    if (!this.currentSession) {
      this.startNewSession();
    }

    const fullAction: UserAction = {
      ...action,
      id: `action-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      sessionId: this.currentSession!.id
    };

    // Add to current session
    this.currentSession!.actions.push(fullAction);
    
    // Add to global history
    this.actionHistory.push(fullAction);
    
    // Maintain history size limit
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory = this.actionHistory.slice(-this.maxHistorySize);
    }

    // Track route visits
    if (action.route && !this.currentSession!.routesVisited.includes(action.route)) {
      this.currentSession!.routesVisited.push(action.route);
    }

    // Track entity access
    if (action.entityType && action.entityId) {
      const entityKey = `${action.entityType}:${action.entityId}`;
      if (!this.currentSession!.entitiesAccessed.includes(entityKey)) {
        this.currentSession!.entitiesAccessed.push(entityKey);
      }
    }

    this.saveToStorage();
    this.analyzeRealTimePatterns(fullAction);
  }

  /**
   * Track navigation with timing
   */
  trackNavigation(fromRoute: string, toRoute: string, timeSpent: number): void {
    this.trackAction({
      type: 'navigation',
      route: toRoute,
      timeSpent,
      metadata: { fromRoute, timeSpent }
    });
  }

  /**
   * Track entity access
   */
  trackEntityAccess(
    entityType: UserAction['entityType'], 
    entityId: string, 
    route: string,
    timeSpent?: number
  ): void {
    this.trackAction({
      type: 'entity_access',
      entityType,
      entityId,
      route,
      timeSpent
    });
  }

  /**
   * Track search behavior
   */
  trackSearch(query: string, route: string, resultsCount?: number): void {
    this.trackAction({
      type: 'search',
      route,
      searchQuery: query,
      metadata: { resultsCount }
    });
  }

  /**
   * End current session
   */
  endSession(): void {
    if (!this.currentSession) return;

    this.currentSession.endTime = new Date();
    this.currentSession.totalTimeSpent = 
      this.currentSession.endTime.getTime() - this.currentSession.startTime.getTime();

    this.updateUserProfile(this.currentSession);
    this.saveToStorage();
    this.currentSession = null;
  }

  /**
   * Start a new session
   */
  private startNewSession(): void {
    this.currentSession = {
      id: `session-${Date.now()}-${Math.random()}`,
      startTime: new Date(),
      actions: [],
      totalTimeSpent: 0,
      routesVisited: [],
      entitiesAccessed: []
    };
  }

  /**
   * Analyze patterns and generate insights
   */
  analyzePatterns(): PredictiveInsight[] {
    const insights: PredictiveInsight[] = [];

    // Analyze navigation patterns
    insights.push(...this.analyzeNavigationPatterns());
    
    // Analyze entity access patterns
    insights.push(...this.analyzeEntityPatterns());
    
    // Analyze temporal patterns
    insights.push(...this.analyzeTemporalPatterns());
    
    // Analyze search patterns
    insights.push(...this.analyzeSearchPatterns());

    return insights.sort((a, b) => b.confidence * b.estimatedValue - a.confidence * a.estimatedValue);
  }

  /**
   * Get predictions for current context
   */
  getPredictions(currentRoute: string, recentEntities: string[]): PredictiveInsight[] {
    const predictions: PredictiveInsight[] = [];

    // Predict next route based on current context
    const routePrediction = this.predictNextRoute(currentRoute);
    if (routePrediction) {
      predictions.push(routePrediction);
    }

    // Predict next entities based on current context
    const entityPredictions = this.predictNextEntities(currentRoute, recentEntities);
    predictions.push(...entityPredictions);

    // Predict optimal sync times
    const syncTimePrediction = this.predictOptimalSyncTime();
    if (syncTimePrediction) {
      predictions.push(syncTimePrediction);
    }

    return predictions;
  }

  /**
   * Analyze navigation patterns
   */
  private analyzeNavigationPatterns(): PredictiveInsight[] {
    const insights: PredictiveInsight[] = [];
    const navigationSequences = this.extractNavigationSequences();

    navigationSequences.forEach(sequence => {
      if (sequence.frequency >= this.minPatternFrequency) {
        insights.push({
          type: 'next_route',
          prediction: sequence.pattern,
          confidence: Math.min(sequence.frequency / 10, 0.9),
          reasoning: `Users frequently navigate ${sequence.pattern} (${sequence.frequency} times)`,
          suggestedAction: 'prefetch_route_data',
          estimatedValue: sequence.frequency * 10
        });
      }
    });

    return insights;
  }

  /**
   * Analyze entity access patterns
   */
  private analyzeEntityPatterns(): PredictiveInsight[] {
    const insights: PredictiveInsight[] = [];
    const entitySequences = this.extractEntitySequences();

    entitySequences.forEach(sequence => {
      if (sequence.frequency >= this.minPatternFrequency) {
        insights.push({
          type: 'next_entity',
          prediction: sequence.pattern,
          confidence: Math.min(sequence.frequency / 8, 0.85),
          reasoning: `Users often access these entities together: ${sequence.pattern}`,
          suggestedAction: 'prefetch_related_entities',
          estimatedValue: sequence.frequency * 15
        });
      }
    });

    return insights;
  }

  /**
   * Analyze temporal patterns
   */
  private analyzeTemporalPatterns(): PredictiveInsight[] {
    const insights: PredictiveInsight[] = [];
    const timePatterns = this.extractTimePatterns();

    timePatterns.forEach(pattern => {
      insights.push({
        type: 'optimal_sync_time',
        prediction: pattern.pattern,
        confidence: pattern.confidence,
        reasoning: `Users are typically ${pattern.metadata.activity} during ${pattern.pattern}`,
        suggestedAction: pattern.metadata.activity === 'active' ? 'schedule_background_sync' : 'schedule_heavy_sync',
        estimatedValue: pattern.confidence * 20
      });
    });

    return insights;
  }

  /**
   * Analyze search patterns
   */
  private analyzeSearchPatterns(): PredictiveInsight[] {
    const insights: PredictiveInsight[] = [];
    const searchPatterns = this.extractSearchPatterns();

    searchPatterns.forEach(pattern => {
      if (pattern.frequency >= 2) {
        insights.push({
          type: 'prefetch_opportunity',
          prediction: pattern.pattern,
          confidence: Math.min(pattern.frequency / 5, 0.8),
          reasoning: `Common search pattern: ${pattern.pattern}`,
          suggestedAction: 'prefetch_search_results',
          estimatedValue: pattern.frequency * 8
        });
      }
    });

    return insights;
  }

  /**
   * Predict next route based on current route
   */
  private predictNextRoute(currentRoute: string): PredictiveInsight | null {
    const navigationPatterns = this.extractNavigationSequences()
      .filter(seq => seq.pattern.startsWith(currentRoute))
      .sort((a, b) => b.frequency - a.frequency);

    if (navigationPatterns.length > 0) {
      const topPattern = navigationPatterns[0];
      const nextRoute = topPattern.pattern.split(' -> ')[1];
      
      return {
        type: 'next_route',
        prediction: nextRoute,
        confidence: Math.min(topPattern.frequency / 10, 0.9),
        reasoning: `Based on ${topPattern.frequency} similar navigation patterns`,
        suggestedAction: 'prefetch_route_data',
        estimatedValue: topPattern.frequency * 12
      };
    }

    return null;
  }

  /**
   * Predict next entities based on context
   */
  private predictNextEntities(_currentRoute: string, recentEntities: string[]): PredictiveInsight[] {
    const predictions: PredictiveInsight[] = [];
    const entityPatterns = this.extractEntitySequences();

    // Find patterns that match current context
    entityPatterns.forEach(pattern => {
      const entities = pattern.pattern.split(' -> ');
      const hasRecentEntity = recentEntities.some(entity => 
        entities.some(patternEntity => patternEntity.includes(entity))
      );

      if (hasRecentEntity && pattern.frequency >= this.minPatternFrequency) {
        const nextEntity = entities[entities.length - 1];
        predictions.push({
          type: 'next_entity',
          prediction: nextEntity,
          confidence: Math.min(pattern.frequency / 8, 0.85),
          reasoning: `Users who access ${recentEntities.join(', ')} often access ${nextEntity}`,
          suggestedAction: 'prefetch_entity',
          estimatedValue: pattern.frequency * 10
        });
      }
    });

    return predictions.slice(0, 3); // Top 3 predictions
  }

  /**
   * Predict optimal sync time
   */
  private predictOptimalSyncTime(): PredictiveInsight | null {
    const currentHour = new Date().getHours();
    const timePatterns = this.extractTimePatterns();
    
    const currentPattern = timePatterns.find(p => 
      p.pattern.includes(currentHour.toString())
    );

    if (currentPattern) {
      const isLowActivity = currentPattern.metadata.activity === 'low';
      return {
        type: 'optimal_sync_time',
        prediction: isLowActivity ? 'now' : 'later',
        confidence: currentPattern.confidence,
        reasoning: `Current time shows ${currentPattern.metadata.activity} user activity`,
        suggestedAction: isLowActivity ? 'perform_sync_now' : 'defer_sync',
        estimatedValue: 15
      };
    }

    return null;
  }

  /**
   * Extract navigation sequences from action history
   */
  private extractNavigationSequences(): Array<{ pattern: string; frequency: number }> {
    const sequences = new Map<string, number>();
    
    for (let i = 0; i < this.actionHistory.length - 1; i++) {
      const current = this.actionHistory[i];
      const next = this.actionHistory[i + 1];
      
      if (current.type === 'navigation' && next.type === 'navigation' && 
          current.route && next.route) {
        const pattern = `${current.route} -> ${next.route}`;
        sequences.set(pattern, (sequences.get(pattern) || 0) + 1);
      }
    }

    return Array.from(sequences.entries()).map(([pattern, frequency]) => ({
      pattern,
      frequency
    }));
  }

  /**
   * Extract entity access sequences
   */
  private extractEntitySequences(): Array<{ pattern: string; frequency: number }> {
    const sequences = new Map<string, number>();
    
    for (let i = 0; i < this.actionHistory.length - 1; i++) {
      const current = this.actionHistory[i];
      const next = this.actionHistory[i + 1];
      
      if (current.type === 'entity_access' && next.type === 'entity_access' &&
          current.entityType && current.entityId && next.entityType && next.entityId) {
        const currentEntity = `${current.entityType}:${current.entityId}`;
        const nextEntity = `${next.entityType}:${next.entityId}`;
        const pattern = `${currentEntity} -> ${nextEntity}`;
        sequences.set(pattern, (sequences.get(pattern) || 0) + 1);
      }
    }

    return Array.from(sequences.entries()).map(([pattern, frequency]) => ({
      pattern,
      frequency
    }));
  }

  /**
   * Extract time-based usage patterns
   */
  private extractTimePatterns(): BehaviorPattern[] {
    const hourlyActivity = new Array(24).fill(0);
    
    this.actionHistory.forEach(action => {
      const hour = action.timestamp.getHours();
      hourlyActivity[hour]++;
    });

    const patterns: BehaviorPattern[] = [];
    const avgActivity = hourlyActivity.reduce((a, b) => a + b, 0) / 24;

    for (let hour = 0; hour < 24; hour++) {
      const activity = hourlyActivity[hour];
      const activityLevel = activity > avgActivity * 1.5 ? 'high' : 
                           activity > avgActivity * 0.5 ? 'medium' : 'low';
      
      patterns.push({
        id: `time-${hour}`,
        type: 'timing',
        pattern: `hour-${hour}`,
        confidence: Math.min(activity / (avgActivity * 2), 1),
        frequency: activity,
        lastSeen: new Date(),
        metadata: { 
          hour, 
          activity: activityLevel,
          activityCount: activity 
        }
      });
    }

    return patterns.filter(p => p.frequency > 0);
  }

  /**
   * Extract search patterns
   */
  private extractSearchPatterns(): Array<{ pattern: string; frequency: number }> {
    const patterns = new Map<string, number>();
    
    this.actionHistory
      .filter(action => action.type === 'search' && action.searchQuery)
      .forEach(action => {
        const query = action.searchQuery!.toLowerCase().trim();
        
        // Group similar queries
        const normalized = this.normalizeSearchQuery(query);
        patterns.set(normalized, (patterns.get(normalized) || 0) + 1);
      });

    return Array.from(patterns.entries()).map(([pattern, frequency]) => ({
      pattern,
      frequency
    }));
  }

  /**
   * Normalize search query for pattern detection
   */
  private normalizeSearchQuery(query: string): string {
    // Remove common words and normalize
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const words = query.toLowerCase().split(/\s+/);
    const filtered = words.filter(word => !commonWords.includes(word) && word.length > 2);
    
    // Sort words to group semantically similar queries
    return filtered.sort().join(' ');
  }

  /**
   * Analyze patterns in real-time as actions occur
   */
  private analyzeRealTimePatterns(action: UserAction): void {
    // Quick pattern detection for immediate insights
    if (action.type === 'navigation' && this.actionHistory.length > 1) {
      const lastAction = this.actionHistory[this.actionHistory.length - 2];
      if (lastAction.type === 'navigation' && lastAction.route !== action.route) {
        // Detected navigation pattern - could trigger prefetch
        logger.debug(`Navigation pattern detected: ${lastAction.route} -> ${action.route}`, 'analytics', {});
      }
    }

    if (action.type === 'entity_access') {
      // Look for entity access patterns
      const recentEntityAccess = this.actionHistory
        .slice(-5)
        .filter(a => a.type === 'entity_access')
        .map(a => `${a.entityType}:${a.entityId}`);
      
      if (recentEntityAccess.length > 1) {
        logger.debug(`Entity access pattern: ${recentEntityAccess.join(' -> ')}`, 'analytics', {});
      }
    }
  }

  /**
   * Update user profile based on session data
   */
  private updateUserProfile(session: UserSession): void {
    const userId = session.userId || 'anonymous';
    let profile = this.userProfiles.get(userId);

    if (!profile) {
      profile = {
        userId,
        role: 'visitor',
        preferredEntityTypes: [],
        commonRoutes: [],
        peakUsageHours: [],
        averageSessionDuration: 0,
        totalSessions: 0,
        lastActive: new Date(),
        behaviors: []
      };
    }

    // Update session statistics
    profile.totalSessions++;
    profile.averageSessionDuration = 
      (profile.averageSessionDuration * (profile.totalSessions - 1) + session.totalTimeSpent) / profile.totalSessions;
    profile.lastActive = session.endTime || new Date();

    // Update preferred entity types
    session.entitiesAccessed.forEach(entity => {
      const [entityType] = entity.split(':');
      if (!profile!.preferredEntityTypes.includes(entityType)) {
        profile!.preferredEntityTypes.push(entityType);
      }
    });

    // Update common routes
    session.routesVisited.forEach(route => {
      if (!profile!.commonRoutes.includes(route)) {
        profile!.commonRoutes.push(route);
      }
    });

    // Update peak usage hours
    const sessionHour = session.startTime.getHours();
    if (!profile.peakUsageHours.includes(sessionHour)) {
      profile.peakUsageHours.push(sessionHour);
    }

    this.userProfiles.set(userId, profile);
  }

  /**
   * Setup event listeners for automatic tracking
   */
  private setupEventListeners(): void {
    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.endSession();
      } else {
        this.startNewSession();
      }
    });

    // Track before page unload
    window.addEventListener('beforeunload', () => {
      this.endSession();
    });
  }

  /**
   * Schedule periodic analysis
   */
  private scheduleAnalysis(): void {
    // Analyze patterns every hour
    setInterval(() => {
      this.analyzePatterns();
      this.cleanupOldData();
    }, 60 * 60 * 1000);

    // Save to storage every 5 minutes
    setInterval(() => {
      this.saveToStorage();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up old data to prevent memory issues
   */
  private cleanupOldData(): void {
    const cutoffDate = new Date(Date.now() - this.patternDecayDays * 24 * 60 * 60 * 1000);
    
    // Remove old actions
    this.actionHistory = this.actionHistory.filter(action => 
      action.timestamp > cutoffDate
    );

    // Remove old patterns
    this.globalPatterns = this.globalPatterns.filter(pattern => 
      pattern.lastSeen > cutoffDate
    );

    // Clean up user profiles
    this.userProfiles.forEach((profile, userId) => {
      if (profile.lastActive < cutoffDate) {
        this.userProfiles.delete(userId);
      }
    });
  }

  /**
   * Load data from storage
   */
  private loadFromStorage(): void {
    try {
      const historyData = localStorage.getItem('myk9show-behavior-history');
      if (historyData) {
        this.actionHistory = JSON.parse(historyData).map((action: Partial<UserAction>) => ({
          ...action,
          timestamp: action.timestamp ? new Date(action.timestamp) : new Date()
        }));
      }

      const profilesData = localStorage.getItem('myk9show-user-profiles');
      if (profilesData) {
        const profiles = JSON.parse(profilesData);
        profiles.forEach((profile: Partial<UserProfile>) => {
          if (profile.userId) {
            this.userProfiles.set(profile.userId, {
              ...profile,
              userId: profile.userId,
              lastActive: profile.lastActive ? new Date(profile.lastActive) : new Date()
            } as UserProfile);
          }
        });
      }

      const patternsData = localStorage.getItem('myk9show-behavior-patterns');
      if (patternsData) {
        this.globalPatterns = JSON.parse(patternsData).map((pattern: Partial<BehaviorPattern>) => ({
          ...pattern,
          lastSeen: pattern.lastSeen ? new Date(pattern.lastSeen) : new Date()
        }));
      }
    } catch (error) {
      logger.warn('Failed to load behavior data from storage:', 'analytics', {}, error as Error);
    }
  }

  /**
   * Save data to storage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem('myk9show-behavior-history', JSON.stringify(this.actionHistory));
      localStorage.setItem('myk9show-user-profiles', JSON.stringify(Array.from(this.userProfiles.values())));
      localStorage.setItem('myk9show-behavior-patterns', JSON.stringify(this.globalPatterns));
    } catch (error) {
      logger.warn('Failed to save behavior data to storage:', 'analytics', {}, error as Error);
    }
  }

  /**
   * Get analytics summary
   */
  getAnalytics(): {
    totalActions: number;
    totalSessions: number;
    uniqueUsers: number;
    behaviorPatterns: number;
    averageSessionDuration: number;
    topRoutes: string[];
    topEntityTypes: string[];
  } {
    const sessions = Array.from(this.userProfiles.values()).reduce((sum, profile) => 
      sum + profile.totalSessions, 0
    );
    
    const avgDuration = Array.from(this.userProfiles.values()).reduce((sum, profile) => 
      sum + profile.averageSessionDuration, 0
    ) / this.userProfiles.size || 0;

    const routeFrequency = new Map<string, number>();
    const entityFrequency = new Map<string, number>();

    this.actionHistory.forEach(action => {
      if (action.route) {
        routeFrequency.set(action.route, (routeFrequency.get(action.route) || 0) + 1);
      }
      if (action.entityType) {
        entityFrequency.set(action.entityType, (entityFrequency.get(action.entityType) || 0) + 1);
      }
    });

    const topRoutes = Array.from(routeFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([route]) => route);

    const topEntityTypes = Array.from(entityFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([entity]) => entity);

    return {
      totalActions: this.actionHistory.length,
      totalSessions: sessions,
      uniqueUsers: this.userProfiles.size,
      behaviorPatterns: this.globalPatterns.length,
      averageSessionDuration: avgDuration,
      topRoutes,
      topEntityTypes
    };
  }

  /**
   * Reset all behavior data
   */
  resetBehaviorData(): void {
    this.actionHistory = [];
    this.userProfiles.clear();
    this.globalPatterns = [];
    this.currentSession = null;
    
    localStorage.removeItem('myk9show-behavior-history');
    localStorage.removeItem('myk9show-user-profiles');
    localStorage.removeItem('myk9show-behavior-patterns');
    
    this.startNewSession();
  }
}

// Create singleton instance
export const userBehaviorLearning = new UserBehaviorLearning();