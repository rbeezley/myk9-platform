import { SEARCH_COMMON_WORDS } from './UserBehaviorLearning.constants';
import type {
  UserAction,
  BehaviorPattern,
  PredictiveInsight,
  PatternSequence,
} from './UserBehaviorLearning.types';

/**
 * Normalize search query for pattern detection by removing common words,
 * filtering short tokens, and sorting alphabetically.
 */
export function normalizeSearchQuery(query: string): string {
  const words = query.toLowerCase().split(/\s+/);
  const filtered = words.filter(word => !SEARCH_COMMON_WORDS.includes(word) && word.length > 2);
  return filtered.sort().join(' ');
}

/**
 * Extract navigation sequences (route A -> route B) from action history.
 */
export function extractNavigationSequences(actionHistory: UserAction[]): PatternSequence[] {
  const sequences = new Map<string, number>();

  for (let i = 0; i < actionHistory.length - 1; i++) {
    const current = actionHistory[i];
    const next = actionHistory[i + 1];

    if (
      current.type === 'navigation' &&
      next.type === 'navigation' &&
      current.route &&
      next.route
    ) {
      const pattern = `${current.route} -> ${next.route}`;
      sequences.set(pattern, (sequences.get(pattern) || 0) + 1);
    }
  }

  return Array.from(sequences.entries()).map(([pattern, frequency]) => ({
    pattern,
    frequency,
  }));
}

/**
 * Extract entity access sequences from action history.
 */
export function extractEntitySequences(actionHistory: UserAction[]): PatternSequence[] {
  const sequences = new Map<string, number>();

  for (let i = 0; i < actionHistory.length - 1; i++) {
    const current = actionHistory[i];
    const next = actionHistory[i + 1];

    if (
      current.type === 'entity_access' &&
      next.type === 'entity_access' &&
      current.entityType &&
      current.entityId &&
      next.entityType &&
      next.entityId
    ) {
      const currentEntity = `${current.entityType}:${current.entityId}`;
      const nextEntity = `${next.entityType}:${next.entityId}`;
      const pattern = `${currentEntity} -> ${nextEntity}`;
      sequences.set(pattern, (sequences.get(pattern) || 0) + 1);
    }
  }

  return Array.from(sequences.entries()).map(([pattern, frequency]) => ({
    pattern,
    frequency,
  }));
}

/**
 * Extract time-based usage patterns from action history.
 */
export function extractTimePatterns(actionHistory: UserAction[]): BehaviorPattern[] {
  const hourlyActivity = new Array(24).fill(0) as number[];

  actionHistory.forEach(action => {
    const hour = action.timestamp.getHours();
    hourlyActivity[hour]++;
  });

  const patterns: BehaviorPattern[] = [];
  const avgActivity = hourlyActivity.reduce((a, b) => a + b, 0) / 24;

  for (let hour = 0; hour < 24; hour++) {
    const activity = hourlyActivity[hour];
    const activityLevel =
      activity > avgActivity * 1.5 ? 'high' : activity > avgActivity * 0.5 ? 'medium' : 'low';

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
        activityCount: activity,
      },
    });
  }

  return patterns.filter(p => p.frequency > 0);
}

/**
 * Extract search patterns from action history.
 */
export function extractSearchPatterns(actionHistory: UserAction[]): PatternSequence[] {
  const patterns = new Map<string, number>();

  actionHistory
    .filter(action => action.type === 'search' && action.searchQuery)
    .forEach(action => {
      const query = action.searchQuery!.toLowerCase().trim();
      const normalized = normalizeSearchQuery(query);
      patterns.set(normalized, (patterns.get(normalized) || 0) + 1);
    });

  return Array.from(patterns.entries()).map(([pattern, frequency]) => ({
    pattern,
    frequency,
  }));
}

/**
 * Analyze navigation patterns and produce predictive insights.
 */
export function analyzeNavigationPatterns(
  actionHistory: UserAction[],
  minPatternFrequency: number
): PredictiveInsight[] {
  const insights: PredictiveInsight[] = [];
  const navigationSequences = extractNavigationSequences(actionHistory);

  navigationSequences.forEach(sequence => {
    if (sequence.frequency >= minPatternFrequency) {
      insights.push({
        type: 'next_route',
        prediction: sequence.pattern,
        confidence: Math.min(sequence.frequency / 10, 0.9),
        reasoning: `Users frequently navigate ${sequence.pattern} (${sequence.frequency} times)`,
        suggestedAction: 'prefetch_route_data',
        estimatedValue: sequence.frequency * 10,
      });
    }
  });

  return insights;
}

/**
 * Analyze entity access patterns and produce predictive insights.
 */
export function analyzeEntityPatterns(
  actionHistory: UserAction[],
  minPatternFrequency: number
): PredictiveInsight[] {
  const insights: PredictiveInsight[] = [];
  const entitySequences = extractEntitySequences(actionHistory);

  entitySequences.forEach(sequence => {
    if (sequence.frequency >= minPatternFrequency) {
      insights.push({
        type: 'next_entity',
        prediction: sequence.pattern,
        confidence: Math.min(sequence.frequency / 8, 0.85),
        reasoning: `Users often access these entities together: ${sequence.pattern}`,
        suggestedAction: 'prefetch_related_entities',
        estimatedValue: sequence.frequency * 15,
      });
    }
  });

  return insights;
}

/**
 * Analyze temporal patterns and produce predictive insights.
 */
export function analyzeTemporalPatterns(actionHistory: UserAction[]): PredictiveInsight[] {
  const insights: PredictiveInsight[] = [];
  const timePatterns = extractTimePatterns(actionHistory);

  timePatterns.forEach(pattern => {
    insights.push({
      type: 'optimal_sync_time',
      prediction: pattern.pattern,
      confidence: pattern.confidence,
      reasoning: `Users are typically ${pattern.metadata.activity} during ${pattern.pattern}`,
      suggestedAction:
        pattern.metadata.activity === 'active' ? 'schedule_background_sync' : 'schedule_heavy_sync',
      estimatedValue: pattern.confidence * 20,
    });
  });

  return insights;
}

/**
 * Analyze search patterns and produce predictive insights.
 */
export function analyzeSearchPatterns(actionHistory: UserAction[]): PredictiveInsight[] {
  const insights: PredictiveInsight[] = [];
  const searchPatterns = extractSearchPatterns(actionHistory);

  searchPatterns.forEach(pattern => {
    if (pattern.frequency >= 2) {
      insights.push({
        type: 'prefetch_opportunity',
        prediction: pattern.pattern,
        confidence: Math.min(pattern.frequency / 5, 0.8),
        reasoning: `Common search pattern: ${pattern.pattern}`,
        suggestedAction: 'prefetch_search_results',
        estimatedValue: pattern.frequency * 8,
      });
    }
  });

  return insights;
}

/**
 * Predict next route based on current route and navigation history.
 */
export function predictNextRoute(
  currentRoute: string,
  actionHistory: UserAction[]
): PredictiveInsight | null {
  const navigationPatterns = extractNavigationSequences(actionHistory)
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
      estimatedValue: topPattern.frequency * 12,
    };
  }

  return null;
}

/**
 * Predict next entities based on current context and recent entity access.
 */
export function predictNextEntities(
  actionHistory: UserAction[],
  recentEntities: string[],
  minPatternFrequency: number
): PredictiveInsight[] {
  const predictions: PredictiveInsight[] = [];
  const entityPatterns = extractEntitySequences(actionHistory);

  entityPatterns.forEach(pattern => {
    const entities = pattern.pattern.split(' -> ');
    const hasRecentEntity = recentEntities.some(entity =>
      entities.some(patternEntity => patternEntity.includes(entity))
    );

    if (hasRecentEntity && pattern.frequency >= minPatternFrequency) {
      const nextEntity = entities[entities.length - 1];
      predictions.push({
        type: 'next_entity',
        prediction: nextEntity,
        confidence: Math.min(pattern.frequency / 8, 0.85),
        reasoning: `Users who access ${recentEntities.join(', ')} often access ${nextEntity}`,
        suggestedAction: 'prefetch_entity',
        estimatedValue: pattern.frequency * 10,
      });
    }
  });

  return predictions.slice(0, 3); // Top 3 predictions
}

/**
 * Predict optimal sync time based on current activity patterns.
 */
export function predictOptimalSyncTime(actionHistory: UserAction[]): PredictiveInsight | null {
  const currentHour = new Date().getHours();
  const timePatterns = extractTimePatterns(actionHistory);

  const currentPattern = timePatterns.find(p => p.pattern.includes(currentHour.toString()));

  if (currentPattern) {
    const isLowActivity = currentPattern.metadata.activity === 'low';
    return {
      type: 'optimal_sync_time',
      prediction: isLowActivity ? 'now' : 'later',
      confidence: currentPattern.confidence,
      reasoning: `Current time shows ${currentPattern.metadata.activity} user activity`,
      suggestedAction: isLowActivity ? 'perform_sync_now' : 'defer_sync',
      estimatedValue: 15,
    };
  }

  return null;
}
