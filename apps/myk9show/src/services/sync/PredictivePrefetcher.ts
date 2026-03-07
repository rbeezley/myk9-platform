import { syncService } from './syncService';
import { logger } from '@/services/LoggingService';

import type {
  NavigationPattern,
  EntityAccessPattern,
  PrefetchRule,
  PrefetchTask,
  PrefetchAnalytics,
} from './PredictivePrefetcher.types';

import {
  estimateEntitySize,
  generateSearchPredictions,
  loadNavigationPatterns,
  loadEntityPatterns,
  loadPrefetchRules,
  savePatternsToStorage,
  clearPatternsFromStorage,
  cleanupOldPatterns,
  updateRuleSuccessRates,
  DEFAULT_PREFETCH_RULES,
  ROUTE_ENTITY_MAP,
} from './PredictivePrefetcher.helpers';

// Re-export types for backward compatibility
export type {
  NavigationPattern,
  EntityAccessPattern,
  PrefetchRule,
  PrefetchTask,
  PrefetchAnalytics,
} from './PredictivePrefetcher.types';

export class PredictivePrefetcher {
  private navigationPatterns = new Map<string, NavigationPattern>();
  private entityAccessPatterns = new Map<string, EntityAccessPattern>();
  private prefetchRules: PrefetchRule[] = [];
  private pendingPrefetches = new Map<string, PrefetchTask>();
  private prefetchQueue: PrefetchTask[] = [];
  private isProcessing = false;
  private maxConcurrentPrefetches = 3;
  private maxPrefetchSize = 1024 * 1024; // 1MB
  private prefetchTimeWindow = 5000; // 5 seconds

  constructor() {
    this.loadPatternsFromStorage();
    this.initializeDefaultRules();
    this.startPrefetchProcessor();
  }

  /**
   * Track user navigation for pattern learning
   */
  trackNavigation(fromRoute: string, toRoute: string, timeSpent: number): void {
    const key = `${fromRoute}->${toRoute}`;
    const existing = this.navigationPatterns.get(key);

    if (existing) {
      existing.frequency++;
      existing.avgTimeSpent = (existing.avgTimeSpent + timeSpent) / 2;
      existing.lastAccessed = new Date();
    } else {
      this.navigationPatterns.set(key, {
        fromRoute,
        toRoute,
        frequency: 1,
        avgTimeSpent: timeSpent,
        lastAccessed: new Date(),
      });
    }

    this.savePatterns();
    this.evaluatePrefetchOpportunities(toRoute);
  }

  /**
   * Track entity access for relationship learning
   */
  trackEntityAccess(
    entityType: EntityAccessPattern['entityType'],
    entityId: string,
    currentRoute: string,
    relatedEntities: string[] = []
  ): void {
    const key = `${entityType}:${entityId}`;
    const existing = this.entityAccessPatterns.get(key);

    if (existing) {
      existing.accessCount++;
      existing.lastAccessed = new Date();
      if (!existing.contextualAccess.includes(currentRoute)) {
        existing.contextualAccess.push(currentRoute);
      }
      relatedEntities.forEach(rel => {
        if (!existing.relatedEntities.includes(rel)) {
          existing.relatedEntities.push(rel);
        }
      });
    } else {
      this.entityAccessPatterns.set(key, {
        entityType,
        entityId,
        accessCount: 1,
        lastAccessed: new Date(),
        contextualAccess: [currentRoute],
        relatedEntities: [...relatedEntities],
      });
    }

    this.savePatterns();
    this.evaluateRelatedEntityPrefetch(entityType, entityId);
  }

  /**
   * Predict and prefetch based on search query
   */
  predictSearchResults(query: string, entityType?: string): void {
    const predictions = generateSearchPredictions(query, entityType);

    predictions.forEach(prediction => {
      this.schedulePrefetch({
        id: `search-${Date.now()}-${Math.random()}`,
        entityType: prediction.entityType,
        searchQuery: prediction.query,
        priority: prediction.confidence * 100,
        estimatedSize: prediction.estimatedSize,
        createdAt: new Date(),
        timeout: this.prefetchTimeWindow,
        retries: 0,
      });
    });
  }

  /**
   * Predict next likely entities based on current context
   */
  predictNextEntities(currentRoute: string, currentEntities: string[]): string[] {
    const predictions: { entityId: string; confidence: number }[] = [];

    // Based on navigation patterns
    this.navigationPatterns.forEach(pattern => {
      if (pattern.fromRoute === currentRoute && pattern.frequency > 2) {
        const confidence = Math.min(pattern.frequency / 10, 1);
        predictions.push({ entityId: pattern.toRoute, confidence });
      }
    });

    // Based on entity relationships
    currentEntities.forEach(entityKey => {
      const pattern = this.entityAccessPatterns.get(entityKey);
      if (pattern) {
        pattern.relatedEntities.forEach(relatedKey => {
          const confidence = pattern.accessCount / 20;
          predictions.push({ entityId: relatedKey, confidence });
        });
      }
    });

    return predictions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .filter(p => p.confidence > 0.3)
      .map(p => p.entityId);
  }

  /**
   * Add a custom prefetch rule
   */
  addPrefetchRule(rule: Omit<PrefetchRule, 'id' | 'createdAt' | 'successRate'>): void {
    const newRule: PrefetchRule = {
      ...rule,
      id: `rule-${Date.now()}-${Math.random()}`,
      createdAt: new Date(),
      successRate: 0,
    };

    this.prefetchRules.push(newRule);
    this.savePatterns();
  }

  /**
   * Get analytics data for debugging and optimization
   */
  getAnalytics(): PrefetchAnalytics {
    return {
      navigationPatterns: this.navigationPatterns.size,
      entityPatterns: this.entityAccessPatterns.size,
      activeRules: this.prefetchRules.filter(r => r.enabled).length,
      pendingPrefetches: this.pendingPrefetches.size,
      queuedPrefetches: this.prefetchQueue.length,
    };
  }

  /**
   * Reset all learned patterns (for testing or privacy)
   */
  resetPatterns(): void {
    this.navigationPatterns.clear();
    this.entityAccessPatterns.clear();
    this.prefetchRules.length = 0;
    this.pendingPrefetches.clear();
    this.prefetchQueue.length = 0;

    clearPatternsFromStorage();
    this.initializeDefaultRules();
  }

  // ── Private methods ──────────────────────────────────────────────

  private schedulePrefetch(task: PrefetchTask): void {
    if (this.pendingPrefetches.has(task.id)) return;

    if (task.estimatedSize > this.maxPrefetchSize) {
      logger.warn('Prefetch task too large, skipping', 'prefetch', {
        taskId: task.id,
        estimatedSize: task.estimatedSize,
        maxSize: this.maxPrefetchSize,
      });
      return;
    }

    this.prefetchQueue.push(task);
    this.prefetchQueue.sort((a, b) => b.priority - a.priority);
    this.processPrefetchQueue();
  }

  private async processPrefetchQueue(): Promise<void> {
    if (this.isProcessing || this.prefetchQueue.length === 0) return;

    this.isProcessing = true;

    while (
      this.prefetchQueue.length > 0 &&
      this.pendingPrefetches.size < this.maxConcurrentPrefetches
    ) {
      const task = this.prefetchQueue.shift();
      if (!task) break;

      this.pendingPrefetches.set(task.id, task);
      this.executePrefetch(task);
    }

    this.isProcessing = false;
  }

  private async executePrefetch(task: PrefetchTask): Promise<void> {
    try {
      logger.debug('Executing prefetch', 'prefetch', {
        taskId: task.id,
        entityType: task.entityType,
        entityId: task.entityId,
      });

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Prefetch timeout')), task.timeout);
      });

      const prefetchPromise = this.performPrefetch(task);
      await Promise.race([prefetchPromise, timeoutPromise]);

      logger.debug('Prefetch completed successfully', 'prefetch', { taskId: task.id });
      updateRuleSuccessRates(this.prefetchRules, true);
    } catch (error) {
      logger.warn('Prefetch failed', 'prefetch', { taskId: task.id }, error as Error);

      if (task.retries < 2) {
        task.retries++;
        task.timeout *= 1.5;
        this.prefetchQueue.unshift(task);
      } else {
        updateRuleSuccessRates(this.prefetchRules, false);
      }
    } finally {
      this.pendingPrefetches.delete(task.id);
      this.processPrefetchQueue();
    }
  }

  private async performPrefetch(task: PrefetchTask): Promise<void> {
    if (task.searchQuery) {
      await this.prefetchSearchResults(task.searchQuery, task.entityType);
    } else if (task.entityId) {
      await this.prefetchEntity(task.entityType, task.entityId);
    }
  }

  private async prefetchSearchResults(query: string, entityType: string): Promise<void> {
    logger.debug('Prefetching search results', 'prefetch', { query, entityType });
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async prefetchEntity(entityType: string, entityId: string): Promise<void> {
    logger.debug('Prefetching entity', 'prefetch', { entityType, entityId });
    await new Promise(resolve => setTimeout(resolve, 200));

    await syncService.addToQueue({
      entityType: entityType as 'club' | 'person' | 'dog' | 'show' | 'entry',
      operation: 'create',
      entityId,
      data: { prefetch: true },
      priority: 'medium',
    });
  }

  private evaluatePrefetchOpportunities(currentRoute: string): void {
    this.navigationPatterns.forEach(pattern => {
      if (pattern.fromRoute === currentRoute && pattern.frequency > 3) {
        const confidence = pattern.frequency / 10;
        if (confidence > 0.5) {
          this.schedulePrefetchForRoute(pattern.toRoute, confidence);
        }
      }
    });
  }

  private evaluateRelatedEntityPrefetch(entityType: string, entityId: string): void {
    const key = `${entityType}:${entityId}`;
    const pattern = this.entityAccessPatterns.get(key);

    if (pattern && pattern.relatedEntities.length > 0) {
      pattern.relatedEntities.forEach(relatedKey => {
        const [relType, relId] = relatedKey.split(':');
        const confidence = pattern.accessCount / 10;

        if (confidence > 0.4) {
          this.schedulePrefetch({
            id: `related-${Date.now()}-${Math.random()}`,
            entityType: relType,
            entityId: relId,
            priority: confidence * 100,
            estimatedSize: estimateEntitySize(relType),
            createdAt: new Date(),
            timeout: this.prefetchTimeWindow,
            retries: 0,
          });
        }
      });
    }
  }

  private schedulePrefetchForRoute(route: string, confidence: number): void {
    const entities = ROUTE_ENTITY_MAP[route];
    if (entities) {
      entities.forEach(entity => {
        this.schedulePrefetch({
          id: `route-${route}-${Date.now()}-${Math.random()}`,
          entityType: entity.type,
          priority: confidence * 100,
          estimatedSize: estimateEntitySize(entity.type),
          createdAt: new Date(),
          timeout: this.prefetchTimeWindow,
          retries: 0,
        });
      });
    }
  }

  private initializeDefaultRules(): void {
    DEFAULT_PREFETCH_RULES.forEach(rule => this.addPrefetchRule(rule));
  }

  private startPrefetchProcessor(): void {
    setInterval(() => {
      this.processPrefetchQueue();
    }, 2000);

    setInterval(
      () => {
        cleanupOldPatterns(this.navigationPatterns, this.entityAccessPatterns);
        this.savePatterns();
      },
      7 * 24 * 60 * 60 * 1000
    );
  }

  private loadPatternsFromStorage(): void {
    this.navigationPatterns = loadNavigationPatterns();
    this.entityAccessPatterns = loadEntityPatterns();
    const rules = loadPrefetchRules();
    if (rules.length > 0) {
      this.prefetchRules = rules;
    }
  }

  private savePatterns(): void {
    savePatternsToStorage(this.navigationPatterns, this.entityAccessPatterns, this.prefetchRules);
  }
}

// Create singleton instance
export const predictivePrefetcher = new PredictivePrefetcher();
