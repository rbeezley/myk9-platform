import { logger } from '@/services/LoggingService';
import {
  MAX_HISTORY_SIZE,
  PATTERN_DECAY_DAYS,
  ANALYSIS_INTERVAL_MS,
  STORAGE_SAVE_INTERVAL_MS,
  STORAGE_KEYS,
} from './UserBehaviorLearning.constants';
import {
  analyzeNavigationPatterns,
  analyzeEntityPatterns,
  analyzeTemporalPatterns,
  analyzeSearchPatterns,
  predictNextRoute,
  predictNextEntities,
  predictOptimalSyncTime,
} from './UserBehaviorLearning.helpers';
import type {
  UserAction,
  UserSession,
  BehaviorPattern,
  UserProfile,
  PredictiveInsight,
  AnalyticsSummary,
} from './UserBehaviorLearning.types';

// Re-export types for external consumers
export type {
  UserAction,
  UserSession,
  BehaviorPattern,
  UserProfile,
  PredictiveInsight,
  AnalyticsSummary,
  PatternSequence,
} from './UserBehaviorLearning.types';

export class UserBehaviorLearning {
  private currentSession: UserSession | null = null;
  private userProfiles = new Map<string, UserProfile>();
  private globalPatterns: BehaviorPattern[] = [];
  private actionHistory: UserAction[] = [];
  private minPatternFrequency = 3;

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
      sessionId: this.currentSession!.id,
    };

    // Add to current session
    this.currentSession!.actions.push(fullAction);

    // Add to global history
    this.actionHistory.push(fullAction);

    // Maintain history size limit
    if (this.actionHistory.length > MAX_HISTORY_SIZE) {
      this.actionHistory = this.actionHistory.slice(-MAX_HISTORY_SIZE);
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
      metadata: { fromRoute, timeSpent },
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
      timeSpent,
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
      metadata: { resultsCount },
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
      entitiesAccessed: [],
    };
  }

  /**
   * Analyze patterns and generate insights
   */
  analyzePatterns(): PredictiveInsight[] {
    const insights: PredictiveInsight[] = [];

    insights.push(...analyzeNavigationPatterns(this.actionHistory, this.minPatternFrequency));
    insights.push(...analyzeEntityPatterns(this.actionHistory, this.minPatternFrequency));
    insights.push(...analyzeTemporalPatterns(this.actionHistory));
    insights.push(...analyzeSearchPatterns(this.actionHistory));

    return insights.sort(
      (a, b) => b.confidence * b.estimatedValue - a.confidence * a.estimatedValue
    );
  }

  /**
   * Get predictions for current context
   */
  getPredictions(currentRoute: string, recentEntities: string[]): PredictiveInsight[] {
    const predictions: PredictiveInsight[] = [];

    const routePrediction = predictNextRoute(currentRoute, this.actionHistory);
    if (routePrediction) {
      predictions.push(routePrediction);
    }

    const entityPredictions = predictNextEntities(
      this.actionHistory,
      recentEntities,
      this.minPatternFrequency
    );
    predictions.push(...entityPredictions);

    const syncTimePrediction = predictOptimalSyncTime(this.actionHistory);
    if (syncTimePrediction) {
      predictions.push(syncTimePrediction);
    }

    return predictions;
  }

  /**
   * Analyze patterns in real-time as actions occur
   */
  private analyzeRealTimePatterns(action: UserAction): void {
    if (action.type === 'navigation' && this.actionHistory.length > 1) {
      const lastAction = this.actionHistory[this.actionHistory.length - 2];
      if (lastAction.type === 'navigation' && lastAction.route !== action.route) {
        logger.debug(
          `Navigation pattern detected: ${lastAction.route} -> ${action.route}`,
          'analytics',
          {}
        );
      }
    }

    if (action.type === 'entity_access') {
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
        behaviors: [],
      };
    }

    profile.totalSessions++;
    profile.averageSessionDuration =
      (profile.averageSessionDuration * (profile.totalSessions - 1) + session.totalTimeSpent) /
      profile.totalSessions;
    profile.lastActive = session.endTime || new Date();

    session.entitiesAccessed.forEach(entity => {
      const [entityType] = entity.split(':');
      if (!profile!.preferredEntityTypes.includes(entityType)) {
        profile!.preferredEntityTypes.push(entityType);
      }
    });

    session.routesVisited.forEach(route => {
      if (!profile!.commonRoutes.includes(route)) {
        profile!.commonRoutes.push(route);
      }
    });

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
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.endSession();
      } else {
        this.startNewSession();
      }
    });

    window.addEventListener('beforeunload', () => {
      this.endSession();
    });
  }

  /**
   * Schedule periodic analysis
   */
  private scheduleAnalysis(): void {
    setInterval(() => {
      this.analyzePatterns();
      this.cleanupOldData();
    }, ANALYSIS_INTERVAL_MS);

    setInterval(() => {
      this.saveToStorage();
    }, STORAGE_SAVE_INTERVAL_MS);
  }

  /**
   * Clean up old data to prevent memory issues
   */
  private cleanupOldData(): void {
    const cutoffDate = new Date(Date.now() - PATTERN_DECAY_DAYS * 24 * 60 * 60 * 1000);

    this.actionHistory = this.actionHistory.filter(action => action.timestamp > cutoffDate);

    this.globalPatterns = this.globalPatterns.filter(pattern => pattern.lastSeen > cutoffDate);

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
      const historyData = localStorage.getItem(STORAGE_KEYS.BEHAVIOR_HISTORY);
      if (historyData) {
        this.actionHistory = JSON.parse(historyData).map((action: Partial<UserAction>) => ({
          ...action,
          timestamp: action.timestamp ? new Date(action.timestamp) : new Date(),
        }));
      }

      const profilesData = localStorage.getItem(STORAGE_KEYS.USER_PROFILES);
      if (profilesData) {
        const profiles = JSON.parse(profilesData);
        profiles.forEach((profile: Partial<UserProfile>) => {
          if (profile.userId) {
            this.userProfiles.set(profile.userId, {
              ...profile,
              userId: profile.userId,
              lastActive: profile.lastActive ? new Date(profile.lastActive) : new Date(),
            } as UserProfile);
          }
        });
      }

      const patternsData = localStorage.getItem(STORAGE_KEYS.BEHAVIOR_PATTERNS);
      if (patternsData) {
        this.globalPatterns = JSON.parse(patternsData).map((pattern: Partial<BehaviorPattern>) => ({
          ...pattern,
          lastSeen: pattern.lastSeen ? new Date(pattern.lastSeen) : new Date(),
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
      localStorage.setItem(STORAGE_KEYS.BEHAVIOR_HISTORY, JSON.stringify(this.actionHistory));
      localStorage.setItem(
        STORAGE_KEYS.USER_PROFILES,
        JSON.stringify(Array.from(this.userProfiles.values()))
      );
      localStorage.setItem(STORAGE_KEYS.BEHAVIOR_PATTERNS, JSON.stringify(this.globalPatterns));
    } catch (error) {
      logger.warn('Failed to save behavior data to storage:', 'analytics', {}, error as Error);
    }
  }

  /**
   * Get analytics summary
   */
  getAnalytics(): AnalyticsSummary {
    const sessions = Array.from(this.userProfiles.values()).reduce(
      (sum, profile) => sum + profile.totalSessions,
      0
    );

    const avgDuration =
      Array.from(this.userProfiles.values()).reduce(
        (sum, profile) => sum + profile.averageSessionDuration,
        0
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
      topEntityTypes,
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

    localStorage.removeItem(STORAGE_KEYS.BEHAVIOR_HISTORY);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILES);
    localStorage.removeItem(STORAGE_KEYS.BEHAVIOR_PATTERNS);

    this.startNewSession();
  }
}

// Create singleton instance
export const userBehaviorLearning = new UserBehaviorLearning();
