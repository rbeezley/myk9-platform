import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import { logger } from '@/services/LoggingService';

// Re-export types for backward compatibility
export type {
  NavigationPattern,
  PreloadTask,
  ShowEntryPrediction,
  RelationshipHint,
  EntityType,
  RouteEntityType,
} from './PredictiveLoader.types';

import type {
  NavigationPattern,
  PreloadTask,
  ShowEntryPrediction,
  RelationshipHint,
} from './PredictiveLoader.types';

import {
  estimateRouteSize,
  estimateEntitySize,
  predictEntryForDogAndShow,
  PRIORITY_WEIGHTS,
  STORAGE_KEYS,
} from './PredictiveLoader.helpers';

/**
 * Predictive loader service for preloading likely next views and related data
 */
export class PredictiveLoader {
  private navigationPatterns = new Map<string, NavigationPattern>();
  private preloadQueue: PreloadTask[] = [];
  private relationshipHints = new Map<string, RelationshipHint>();
  private showEntryPredictions: ShowEntryPrediction[] = [];
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.loadPatternsFromStorage();
    this.startProcessing();
    this.setupCleanup();
  }

  /**
   * Track navigation patterns for predictive loading
   */
  trackNavigationPattern(fromRoute: string, toRoute: string, loadTime: number): void {
    const key = `${fromRoute}->${toRoute}`;
    const existing = this.navigationPatterns.get(key);

    if (existing) {
      existing.frequency += 1;
      existing.avgLoadTime = (existing.avgLoadTime + loadTime) / 2;
      existing.lastAccessed = new Date();
      existing.confidence = Math.min(0.95, existing.frequency * 0.1);
    } else {
      this.navigationPatterns.set(key, {
        fromRoute,
        toRoute,
        frequency: 1,
        avgLoadTime: loadTime,
        lastAccessed: new Date(),
        confidence: 0.1,
      });
    }

    this.savePatterns();
    this.generatePreloadTasks(fromRoute);
  }

  /**
   * Preload likely next views based on current route
   */
  preloadLikelyViews(currentRoute: string): void {
    const likelyRoutes = this.getLikelyNextRoutes(currentRoute);

    for (const route of likelyRoutes) {
      if (route.confidence > 0.3) {
        this.addPreloadTask({
          id: `route-${Date.now()}-${Math.random()}`,
          type: 'route',
          target: route.toRoute,
          priority: route.confidence > 0.7 ? 'high' : 'medium',
          estimatedSize: estimateRouteSize(route.toRoute),
          confidence: route.confidence,
          createdAt: new Date(),
          status: 'pending',
          retries: 0,
        });
      }
    }
  }

  /**
   * Generate show entry predictions based on historical data
   */
  generateShowEntryPredictions(dogId?: string): ShowEntryPrediction[] {
    const predictions: ShowEntryPrediction[] = [];
    const dogs = dogId
      ? [useDogStore.getState().getDogById(dogId)].filter(Boolean)
      : useDogStore.getState().dogs;
    const upcomingShows = useShowStore.getState().shows.filter(
      show =>
        new Date(show.startDate) > new Date() &&
        new Date(show.startDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // Next 90 days
    );

    for (const dog of dogs) {
      if (!dog) continue;

      for (const show of upcomingShows) {
        const prediction = predictEntryForDogAndShow(dog, show);
        if (prediction && prediction.confidence > 0.2) {
          predictions.push(prediction);
        }
      }
    }

    // Sort by confidence and keep top 20
    this.showEntryPredictions = predictions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20);

    return this.showEntryPredictions;
  }

  /**
   * Implement smart relationship loading
   */
  trackRelationshipAccess(
    entityType: 'club' | 'person' | 'dog' | 'show' | 'entry',
    entityId: string,
    relatedType: 'club' | 'person' | 'dog' | 'show' | 'entry',
    relatedIds: string[]
  ): void {
    const key = `${entityType}:${entityId}->${relatedType}`;
    const existing = this.relationshipHints.get(key);

    if (existing) {
      const allRelatedIds = [...new Set([...existing.relatedIds, ...relatedIds])];
      existing.relatedIds = allRelatedIds;
      existing.strength = Math.min(0.95, existing.strength + 0.1);
      existing.lastAccessed = new Date();
    } else {
      this.relationshipHints.set(key, {
        entityType,
        entityId,
        relatedType,
        relatedIds,
        strength: 0.3,
        lastAccessed: new Date(),
      });
    }

    // Preload high-strength relationships
    if ((existing && existing.strength > 0.6) || relatedIds.length > 0) {
      this.preloadRelatedEntities(entityType, entityId, relatedType, relatedIds.slice(0, 5));
    }

    this.saveRelationshipHints();
  }

  /**
   * Get show entry predictions for a specific dog
   */
  getShowEntryPredictions(dogId: string): ShowEntryPrediction[] {
    return this.showEntryPredictions.filter(pred => pred.dogId === dogId);
  }

  /**
   * Get preload analytics
   */
  getAnalytics() {
    const completedTasks = this.preloadQueue.filter(task => task.status === 'completed');
    const failedTasks = this.preloadQueue.filter(task => task.status === 'failed');

    return {
      navigationPatterns: this.navigationPatterns.size,
      relationshipHints: this.relationshipHints.size,
      showEntryPredictions: this.showEntryPredictions.length,
      preloadQueue: {
        total: this.preloadQueue.length,
        pending: this.preloadQueue.filter(task => task.status === 'pending').length,
        loading: this.preloadQueue.filter(task => task.status === 'loading').length,
        completed: completedTasks.length,
        failed: failedTasks.length,
      },
      successRate:
        this.preloadQueue.length > 0 ? completedTasks.length / this.preloadQueue.length : 0,
      avgConfidence:
        this.preloadQueue.length > 0
          ? this.preloadQueue.reduce((sum, task) => sum + task.confidence, 0) /
            this.preloadQueue.length
          : 0,
    };
  }

  /**
   * Clear all predictive data
   */
  resetPredictiveData(): void {
    this.navigationPatterns.clear();
    this.preloadQueue = [];
    this.relationshipHints.clear();
    this.showEntryPredictions = [];

    localStorage.removeItem(STORAGE_KEYS.navPatterns);
    localStorage.removeItem(STORAGE_KEYS.relationshipHints);
  }

  private getLikelyNextRoutes(currentRoute: string): NavigationPattern[] {
    const patterns: NavigationPattern[] = [];

    for (const [, pattern] of this.navigationPatterns) {
      if (pattern.fromRoute === currentRoute && pattern.confidence > 0.2) {
        patterns.push(pattern);
      }
    }

    return patterns.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  private generatePreloadTasks(currentRoute: string): void {
    this.cleanupOldTasks();
    this.preloadLikelyViews(currentRoute);

    const entityMatch = currentRoute.match(/\/(clubs|people|dogs|shows)\/([^/]+)/);
    if (entityMatch) {
      const [, entityType, entityId] = entityMatch;
      this.preloadRelatedEntitiesForEntity(
        entityType as 'clubs' | 'people' | 'dogs' | 'shows',
        entityId
      );
    }
  }

  private preloadRelatedEntitiesForEntity(entityType: string, entityId: string): void {
    const hints = Array.from(this.relationshipHints.values())
      .filter(hint => hint.entityType === entityType && hint.entityId === entityId)
      .filter(hint => hint.strength > 0.4)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3);

    for (const hint of hints) {
      this.preloadRelatedEntities(
        hint.entityType,
        hint.entityId,
        hint.relatedType,
        hint.relatedIds
      );
    }
  }

  private preloadRelatedEntities(
    _entityType: string,
    _entityId: string,
    relatedType: string,
    relatedIds: string[]
  ): void {
    for (const relatedId of relatedIds.slice(0, 5)) {
      this.addPreloadTask({
        id: `rel-${Date.now()}-${Math.random()}`,
        type: 'relationship',
        target: `${relatedType}:${relatedId}`,
        priority: 'medium',
        estimatedSize: estimateEntitySize(relatedType),
        confidence: 0.6,
        createdAt: new Date(),
        status: 'pending',
        retries: 0,
      });
    }
  }

  private addPreloadTask(task: PreloadTask): void {
    const existing = this.preloadQueue.find(
      t => t.type === task.type && t.target === task.target && t.status !== 'failed'
    );

    if (!existing) {
      this.preloadQueue.push(task);
      this.preloadQueue.sort((a, b) => {
        const aPriority = PRIORITY_WEIGHTS[a.priority] || 1;
        const bPriority = PRIORITY_WEIGHTS[b.priority] || 1;
        if (aPriority !== bPriority) return bPriority - aPriority;
        return b.confidence - a.confidence;
      });
    }
  }

  private startProcessing(): void {
    if (this.processingInterval) return;
    this.processingInterval = setInterval(() => {
      this.processPreloadQueue();
    }, 1000);
  }

  private async processPreloadQueue(): Promise<void> {
    if (this.isProcessing) return;

    const pendingTask = this.preloadQueue.find(task => task.status === 'pending');
    if (!pendingTask) return;

    this.isProcessing = true;
    pendingTask.status = 'loading';

    try {
      await this.executePreloadTask(pendingTask);
      pendingTask.status = 'completed';
      logger.debug('Preloaded', 'prefetch', { type: pendingTask.type, target: pendingTask.target });
    } catch (error) {
      pendingTask.status = 'failed';
      pendingTask.retries += 1;
      logger.warn(
        'Preload failed',
        'prefetch',
        { type: pendingTask.type, target: pendingTask.target },
        error as Error
      );

      if (pendingTask.retries < 3) {
        setTimeout(() => {
          pendingTask.status = 'pending';
          pendingTask.priority = 'low';
        }, 5000 * pendingTask.retries);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executePreloadTask(task: PreloadTask): Promise<void> {
    switch (task.type) {
      case 'route':
        await this.preloadRoute(task.target);
        break;
      case 'entity':
        await this.preloadEntity(task.target);
        break;
      case 'relationship':
        await this.preloadRelationship(task.target);
        break;
      case 'search_results':
        await this.preloadSearchResults(task.target);
        break;
    }
  }

  private async preloadRoute(route: string): Promise<void> {
    if (route.includes('/dogs')) {
      void useDogStore.getState().dogs;
    } else if (route.includes('/people')) {
      void useUserStore.getState().people;
    } else if (route.includes('/shows')) {
      void useShowStore.getState().shows;
    } else if (route.includes('/clubs')) {
      void useClubStore.getState().clubs;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async preloadEntity(target: string): Promise<void> {
    const [type, id] = target.split(':');
    switch (type) {
      case 'dog':
        void useDogStore.getState().getDogById(id);
        break;
      case 'person':
        void useUserStore.getState().people.find(p => p.id === id);
        break;
      case 'show':
        void useShowStore.getState().shows.find(s => s.id === id);
        break;
      case 'club':
        void useClubStore.getState().clubs.find(c => c.id === id);
        break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  private async preloadRelationship(target: string): Promise<void> {
    await this.preloadEntity(target);
  }

  private async preloadSearchResults(query: string): Promise<void> {
    logger.debug('Preloading search results', 'prefetch', { query });
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  private cleanupOldTasks(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.preloadQueue = this.preloadQueue.filter(
      task =>
        task.createdAt > oneHourAgo && (task.status === 'pending' || task.status === 'loading')
    );
  }

  private setupCleanup(): void {
    setInterval(
      () => {
        this.cleanupOldTasks();
        this.cleanupOldPatterns();
        this.cleanupOldRelationshipHints();
      },
      30 * 60 * 1000
    );
  }

  private cleanupOldPatterns(): void {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    for (const [key, pattern] of this.navigationPatterns) {
      if (pattern.lastAccessed < oneWeekAgo && pattern.frequency < 3) {
        this.navigationPatterns.delete(key);
      }
    }
  }

  private cleanupOldRelationshipHints(): void {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    for (const [key, hint] of this.relationshipHints) {
      if (hint.lastAccessed < oneWeekAgo && hint.strength < 0.3) {
        this.relationshipHints.delete(key);
      }
    }
  }

  private savePatterns(): void {
    try {
      const data = Array.from(this.navigationPatterns.entries());
      localStorage.setItem(STORAGE_KEYS.navPatterns, JSON.stringify(data));
    } catch (error) {
      logger.warn('Failed to save navigation patterns', 'prefetch', {}, error as Error);
    }
  }

  private saveRelationshipHints(): void {
    try {
      const data = Array.from(this.relationshipHints.entries());
      localStorage.setItem(STORAGE_KEYS.relationshipHints, JSON.stringify(data));
    } catch (error) {
      logger.warn('Failed to save relationship hints', 'prefetch', {}, error as Error);
    }
  }

  private loadPatternsFromStorage(): void {
    try {
      const navData = localStorage.getItem(STORAGE_KEYS.navPatterns);
      if (navData) {
        const patterns = JSON.parse(navData);
        for (const [key, pattern] of patterns) {
          pattern.lastAccessed = new Date(pattern.lastAccessed);
          this.navigationPatterns.set(key, pattern);
        }
      }

      const relData = localStorage.getItem(STORAGE_KEYS.relationshipHints);
      if (relData) {
        const hints = JSON.parse(relData);
        for (const [key, hint] of hints) {
          hint.lastAccessed = new Date(hint.lastAccessed);
          this.relationshipHints.set(key, hint);
        }
      }
    } catch (error) {
      logger.warn('Failed to load predictive data from storage', 'prefetch', {}, error as Error);
    }
  }
}

// Export singleton instance
export const predictiveLoader = new PredictiveLoader();
