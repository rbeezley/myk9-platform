import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import { logger } from '@/services/LoggingService';

/**
 * Navigation pattern for tracking user movement between routes
 */
interface NavigationPattern {
  fromRoute: string;
  toRoute: string;
  frequency: number;
  avgLoadTime: number;
  lastAccessed: Date;
  confidence: number;
}

/**
 * Preload task for managing what to load and when
 */
interface PreloadTask {
  id: string;
  type: 'route' | 'entity' | 'relationship' | 'search_results';
  target: string;
  priority: 'high' | 'medium' | 'low';
  estimatedSize: number;
  confidence: number;
  createdAt: Date;
  status: 'pending' | 'loading' | 'completed' | 'failed';
  retries: number;
}

/**
 * Show entry prediction based on historical patterns
 */
interface ShowEntryPrediction {
  showId: string;
  showName: string;
  dogId: string;
  dogName: string;
  classes: string[];
  confidence: number;
  reasoning: string[];
  estimatedEntryDate: Date;
}

/**
 * Relationship loading hint for smart preloading
 */
interface RelationshipHint {
  entityType: 'club' | 'person' | 'dog' | 'show' | 'entry';
  entityId: string;
  relatedType: 'club' | 'person' | 'dog' | 'show' | 'entry';
  relatedIds: string[];
  strength: number; // 0-1, how strongly related
  lastAccessed: Date;
}

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
        confidence: 0.1
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
          estimatedSize: this.estimateRouteSize(route.toRoute),
          confidence: route.confidence,
          createdAt: new Date(),
          status: 'pending',
          retries: 0
        });
      }
    }
  }

  /**
   * Generate show entry predictions based on historical data
   */
  generateShowEntryPredictions(dogId?: string): ShowEntryPrediction[] {
    const predictions: ShowEntryPrediction[] = [];
    const dogs = dogId ? [useDogStore.getState().getDogById(dogId)].filter(Boolean) : useDogStore.getState().dogs;
    const upcomingShows = useShowStore.getState().shows.filter(show => 
      new Date(show.startDate) > new Date() && 
      new Date(show.startDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // Next 90 days
    );

    for (const dog of dogs) {
      if (!dog) continue;

      for (const show of upcomingShows) {
        const prediction = this.predictEntryForDogAndShow(dog, show);
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
      // Merge related IDs and update strength
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
        lastAccessed: new Date()
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
        failed: failedTasks.length
      },
      successRate: this.preloadQueue.length > 0 
        ? completedTasks.length / this.preloadQueue.length 
        : 0,
      avgConfidence: this.preloadQueue.length > 0
        ? this.preloadQueue.reduce((sum, task) => sum + task.confidence, 0) / this.preloadQueue.length
        : 0
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
    
    localStorage.removeItem('myk9show-nav-patterns');
    localStorage.removeItem('myk9show-relationship-hints');
  }

  /**
   * Private: Get likely next routes based on patterns
   */
  private getLikelyNextRoutes(currentRoute: string): NavigationPattern[] {
    const patterns: NavigationPattern[] = [];
    
    for (const [, pattern] of this.navigationPatterns) {
      if (pattern.fromRoute === currentRoute && pattern.confidence > 0.2) {
        patterns.push(pattern);
      }
    }

    return patterns.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  /**
   * Private: Generate preload tasks based on patterns
   */
  private generatePreloadTasks(currentRoute: string): void {
    // Clean old tasks first
    this.cleanupOldTasks();

    // Generate new tasks for likely routes
    this.preloadLikelyViews(currentRoute);

    // Generate tasks for related entities if on entity detail page
    const entityMatch = currentRoute.match(/\/(clubs|people|dogs|shows)\/([^/]+)/);
    if (entityMatch) {
      const [, entityType, entityId] = entityMatch;
      this.preloadRelatedEntitiesForEntity(entityType as 'clubs' | 'people' | 'dogs' | 'shows', entityId);
    }
  }

  /**
   * Private: Estimate the size of loading a route
   */
  private estimateRouteSize(route: string): number {
    // Estimate based on route complexity
    if (route.includes('/dogs')) return 5; // 5KB average
    if (route.includes('/people')) return 3; // 3KB average
    if (route.includes('/shows')) return 10; // 10KB average
    if (route.includes('/clubs')) return 2; // 2KB average
    return 1; // Default 1KB
  }

  /**
   * Private: Predict entry for specific dog and show
   */
  private predictEntryForDogAndShow(dog: { id: string; name: string; breed?: string | undefined; ownerId?: string | undefined; isActive?: boolean | undefined; sex?: string | undefined; dateOfBirth?: string | undefined }, show: { id: string; name: string; type?: string | undefined; location?: string | undefined }): ShowEntryPrediction | null {
    const reasoning: string[] = [];
    let confidence = 0.1;

    // Check if dog's breed matches show types
    if (show.type && dog.breed) {
      if (show.type.toLowerCase().includes('all breed') || 
          show.type.toLowerCase().includes(dog.breed.toLowerCase())) {
        confidence += 0.3;
        reasoning.push('Breed matches show type');
      }
    }

    // Check geographic proximity
    if (show.location && dog.ownerId) {
      const ownerLocation = useUserStore.getState().people.find(p => p.id === dog.ownerId)?.city;
      if (ownerLocation && show.location.includes(ownerLocation)) {
        confidence += 0.4;
        reasoning.push('Show in owner\'s city');
      }
    }

    // Check historical entries (would need entry history)
    // For now, add base confidence for active dogs
    if (dog.isActive !== false) {
      confidence += 0.2;
      reasoning.push('Dog is active in competitions');
    }

    // Only return prediction if confidence is reasonable
    if (confidence < 0.2) return null;

    return {
      showId: show.id,
      showName: show.name,
      dogId: dog.id,
      dogName: dog.name,
      classes: this.predictLikelyClasses({ ...(dog.sex !== undefined && { sex: dog.sex }), ...(dog.dateOfBirth !== undefined && { dateOfBirth: dog.dateOfBirth }) }),
      confidence: Math.min(0.9, confidence),
      reasoning,
      estimatedEntryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Estimate 1 week before show
    };
  }

  /**
   * Private: Predict likely classes for dog in show
   */
  private predictLikelyClasses(dog: { sex?: string; dateOfBirth?: string }): string[] {
    const classes: string[] = [];

    // Basic conformation classes
    if (dog.sex === 'male') {
      classes.push('Open Dogs');
    } else {
      classes.push('Open Bitches');
    }

    // Age-based classes (would need dog age calculation)
    if (dog.dateOfBirth) {
      const age = new Date().getFullYear() - new Date(dog.dateOfBirth).getFullYear();
      if (age < 2) {
        classes.push(dog.sex === 'male' ? 'Puppy Dogs' : 'Puppy Bitches');
      }
    }

    return classes.slice(0, 3); // Limit to top 3 predicted classes
  }

  /**
   * Private: Preload related entities for a specific entity
   */
  private preloadRelatedEntitiesForEntity(entityType: string, entityId: string): void {
    const hints = Array.from(this.relationshipHints.values())
      .filter(hint => hint.entityType === entityType && hint.entityId === entityId)
      .filter(hint => hint.strength > 0.4)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3);

    for (const hint of hints) {
      this.preloadRelatedEntities(hint.entityType, hint.entityId, hint.relatedType, hint.relatedIds);
    }
  }

  /**
   * Private: Preload related entities
   */
  private preloadRelatedEntities(
    _entityType: string, 
    _entityId: string, 
    relatedType: string, 
    relatedIds: string[]
  ): void {
    for (const relatedId of relatedIds.slice(0, 5)) { // Limit to 5 entities
      this.addPreloadTask({
        id: `rel-${Date.now()}-${Math.random()}`,
        type: 'relationship',
        target: `${relatedType}:${relatedId}`,
        priority: 'medium',
        estimatedSize: this.estimateEntitySize(relatedType),
        confidence: 0.6,
        createdAt: new Date(),
        status: 'pending',
        retries: 0
      });
    }
  }

  /**
   * Private: Estimate entity size
   */
  private estimateEntitySize(entityType: string): number {
    const sizes = {
      person: 3, // 3KB
      dog: 5,    // 5KB
      show: 10,  // 10KB
      club: 2,   // 2KB
      entry: 1   // 1KB
    };
    return sizes[entityType as keyof typeof sizes] || 1;
  }

  /**
   * Private: Add preload task to queue
   */
  private addPreloadTask(task: PreloadTask): void {
    // Check if similar task already exists
    const existing = this.preloadQueue.find(t => 
      t.type === task.type && 
      t.target === task.target && 
      t.status !== 'failed'
    );

    if (!existing) {
      this.preloadQueue.push(task);
      this.preloadQueue.sort((a, b) => {
        // Sort by priority and confidence
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityWeight[a.priority];
        const bPriority = priorityWeight[b.priority];
        
        if (aPriority !== bPriority) return bPriority - aPriority;
        return b.confidence - a.confidence;
      });
    }
  }

  /**
   * Private: Start processing preload queue
   */
  private startProcessing(): void {
    if (this.processingInterval) return;

    this.processingInterval = setInterval(() => {
      this.processPreloadQueue();
    }, 1000);
  }

  /**
   * Private: Process preload queue
   */
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
      logger.warn('Preload failed', 'prefetch', { type: pendingTask.type, target: pendingTask.target }, error as Error);

      // Retry with lower priority if retries < 3
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

  /**
   * Private: Execute a preload task
   */
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

  /**
   * Private: Preload route data
   */
  private async preloadRoute(route: string): Promise<void> {
    // Simulate route preloading by pre-fetching likely data
    if (route.includes('/dogs')) {
      // Trigger loading if not already loaded
      void useDogStore.getState().dogs;
    } else if (route.includes('/people')) {
      // Trigger loading if not already loaded
      void useUserStore.getState().people;
    } else if (route.includes('/shows')) {
      // Trigger loading if not already loaded
      void useShowStore.getState().shows;
    } else if (route.includes('/clubs')) {
      // Trigger loading if not already loaded
      void useClubStore.getState().clubs;
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Private: Preload specific entity
   */
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

  /**
   * Private: Preload relationship data
   */
  private async preloadRelationship(target: string): Promise<void> {
    // This would preload related entities
    await this.preloadEntity(target);
  }

  /**
   * Private: Preload search results
   */
  private async preloadSearchResults(query: string): Promise<void> {
    // This would pre-execute common searches
    logger.debug('Preloading search results', 'prefetch', { query });
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  /**
   * Private: Clean up old preload tasks
   */
  private cleanupOldTasks(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.preloadQueue = this.preloadQueue.filter(task => 
      task.createdAt > oneHourAgo && 
      (task.status === 'pending' || task.status === 'loading')
    );
  }

  /**
   * Private: Setup periodic cleanup
   */
  private setupCleanup(): void {
    // Clean up old data every 30 minutes
    setInterval(() => {
      this.cleanupOldTasks();
      this.cleanupOldPatterns();
      this.cleanupOldRelationshipHints();
    }, 30 * 60 * 1000);
  }

  /**
   * Private: Clean up old navigation patterns
   */
  private cleanupOldPatterns(): void {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    for (const [key, pattern] of this.navigationPatterns) {
      if (pattern.lastAccessed < oneWeekAgo && pattern.frequency < 3) {
        this.navigationPatterns.delete(key);
      }
    }
  }

  /**
   * Private: Clean up old relationship hints
   */
  private cleanupOldRelationshipHints(): void {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    for (const [key, hint] of this.relationshipHints) {
      if (hint.lastAccessed < oneWeekAgo && hint.strength < 0.3) {
        this.relationshipHints.delete(key);
      }
    }
  }

  /**
   * Private: Save patterns to localStorage
   */
  private savePatterns(): void {
    try {
      const data = Array.from(this.navigationPatterns.entries());
      localStorage.setItem('myk9show-nav-patterns', JSON.stringify(data));
    } catch (error) {
      logger.warn('Failed to save navigation patterns', 'prefetch', {}, error as Error);
    }
  }

  /**
   * Private: Save relationship hints to localStorage
   */
  private saveRelationshipHints(): void {
    try {
      const data = Array.from(this.relationshipHints.entries());
      localStorage.setItem('myk9show-relationship-hints', JSON.stringify(data));
    } catch (error) {
      logger.warn('Failed to save relationship hints', 'prefetch', {}, error as Error);
    }
  }

  /**
   * Private: Load patterns from localStorage
   */
  private loadPatternsFromStorage(): void {
    try {
      // Load navigation patterns
      const navData = localStorage.getItem('myk9show-nav-patterns');
      if (navData) {
        const patterns = JSON.parse(navData);
        for (const [key, pattern] of patterns) {
          pattern.lastAccessed = new Date(pattern.lastAccessed);
          this.navigationPatterns.set(key, pattern);
        }
      }

      // Load relationship hints
      const relData = localStorage.getItem('myk9show-relationship-hints');
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