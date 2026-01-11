import { syncService } from './syncService';
import { logger } from '@/services/LoggingService';

interface NavigationPattern {
  fromRoute: string;
  toRoute: string;
  frequency: number;
  avgTimeSpent: number;
  lastAccessed: Date;
}

interface EntityAccessPattern {
  entityType: 'club' | 'person' | 'dog' | 'show' | 'entry';
  entityId: string;
  accessCount: number;
  lastAccessed: Date;
  contextualAccess: string[]; // Routes where this entity was accessed
  relatedEntities: string[]; // Entities accessed together
}

interface PrefetchRule {
  id: string;
  trigger: 'route_change' | 'entity_access' | 'time_based' | 'search_query';
  condition: string; // Pattern or condition to match
  action: 'prefetch_entity' | 'prefetch_related' | 'prefetch_search_results';
  priority: 'high' | 'medium' | 'low';
  enabled: boolean;
  successRate: number; // How often this rule was useful
  createdAt: Date;
  lastUsed?: Date;
}

interface PrefetchTask {
  id: string;
  entityType: string;
  entityId?: string;
  searchQuery?: string;
  priority: number;
  estimatedSize: number;
  createdAt: Date;
  timeout: number;
  retries: number;
}

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
        lastAccessed: new Date()
      });
    }

    this.savePatternsToStorage();
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
      // Merge related entities
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
        relatedEntities: [...relatedEntities]
      });
    }

    this.savePatternsToStorage();
    this.evaluateRelatedEntityPrefetch(entityType, entityId);
  }

  /**
   * Predict and prefetch based on search query
   */
  predictSearchResults(query: string, entityType?: string): void {
    const predictions = this.generateSearchPredictions(query, entityType);
    
    predictions.forEach(prediction => {
      this.schedulePrefetch({
        id: `search-${Date.now()}-${Math.random()}`,
        entityType: prediction.entityType,
        searchQuery: prediction.query,
        priority: prediction.confidence * 100,
        estimatedSize: prediction.estimatedSize,
        createdAt: new Date(),
        timeout: this.prefetchTimeWindow,
        retries: 0
      });
    });
  }

  /**
   * Predict next likely entities based on current context
   */
  predictNextEntities(currentRoute: string, currentEntities: string[]): string[] {
    const predictions: { entityId: string; confidence: number }[] = [];

    // Based on navigation patterns
    this.navigationPatterns.forEach((pattern) => {
      if (pattern.fromRoute === currentRoute && pattern.frequency > 2) {
        const confidence = Math.min(pattern.frequency / 10, 1);
        // This would need integration with route-to-entity mapping
        predictions.push({
          entityId: pattern.toRoute,
          confidence
        });
      }
    });

    // Based on entity relationships
    currentEntities.forEach(entityKey => {
      const pattern = this.entityAccessPatterns.get(entityKey);
      if (pattern) {
        pattern.relatedEntities.forEach(relatedKey => {
          const confidence = pattern.accessCount / 20; // Normalize
          predictions.push({
            entityId: relatedKey,
            confidence
          });
        });
      }
    });

    // Sort by confidence and return top predictions
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
      successRate: 0
    };

    this.prefetchRules.push(newRule);
    this.savePatternsToStorage();
  }

  /**
   * Schedule a prefetch task
   */
  private schedulePrefetch(task: PrefetchTask): void {
    // Check if already pending or in queue
    if (this.pendingPrefetches.has(task.id)) {
      return;
    }

    // Check size limits
    if (task.estimatedSize > this.maxPrefetchSize) {
      logger.warn('Prefetch task too large, skipping', 'prefetch', { taskId: task.id, estimatedSize: task.estimatedSize, maxSize: this.maxPrefetchSize });
      return;
    }

    // Add to queue with priority sorting
    this.prefetchQueue.push(task);
    this.prefetchQueue.sort((a, b) => b.priority - a.priority);

    this.processPrefetchQueue();
  }

  /**
   * Process the prefetch queue
   */
  private async processPrefetchQueue(): Promise<void> {
    if (this.isProcessing || this.prefetchQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.prefetchQueue.length > 0 && this.pendingPrefetches.size < this.maxConcurrentPrefetches) {
      const task = this.prefetchQueue.shift();
      if (!task) break;

      this.pendingPrefetches.set(task.id, task);
      this.executePrefetch(task);
    }

    this.isProcessing = false;
  }

  /**
   * Execute a single prefetch task
   */
  private async executePrefetch(task: PrefetchTask): Promise<void> {
    try {
      logger.debug('Executing prefetch', 'prefetch', { taskId: task.id, entityType: task.entityType, entityId: task.entityId });

      // Set timeout for the task
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Prefetch timeout')), task.timeout);
      });

      const prefetchPromise = this.performPrefetch(task);

      await Promise.race([prefetchPromise, timeoutPromise]);

      logger.debug('Prefetch completed successfully', 'prefetch', { taskId: task.id });
      this.updateRuleSuccessRate(task, true);

    } catch (error) {
      logger.warn('Prefetch failed', 'prefetch', { taskId: task.id }, error as Error);
      
      // Retry logic
      if (task.retries < 2) {
        task.retries++;
        task.timeout *= 1.5; // Exponential backoff
        this.prefetchQueue.unshift(task); // Add back to front with higher timeout
      } else {
        this.updateRuleSuccessRate(task, false);
      }
    } finally {
      this.pendingPrefetches.delete(task.id);
      this.processPrefetchQueue(); // Continue processing
    }
  }

  /**
   * Perform the actual prefetch operation
   */
  private async performPrefetch(task: PrefetchTask): Promise<void> {
    if (task.searchQuery) {
      // Prefetch search results
      await this.prefetchSearchResults(task.searchQuery, task.entityType);
    } else if (task.entityId) {
      // Prefetch specific entity
      await this.prefetchEntity(task.entityType, task.entityId);
    }
  }

  /**
   * Prefetch search results
   */
  private async prefetchSearchResults(query: string, entityType: string): Promise<void> {
    // This would integrate with the search service
    logger.debug('Prefetching search results', 'prefetch', { query, entityType });

    // Mock implementation - in real app would call search API
    await new Promise(resolve => setTimeout(resolve, 100));

    // Cache results in IndexedDB or memory cache
    // await searchService.cacheSearchResults(query, entityType, results);
  }

  /**
   * Prefetch specific entity
   */
  private async prefetchEntity(entityType: string, entityId: string): Promise<void> {
    logger.debug('Prefetching entity', 'prefetch', { entityType, entityId });

    // Mock implementation - in real app would load from API
    await new Promise(resolve => setTimeout(resolve, 200));

    // Queue for sync service to load and cache
    await syncService.addToQueue({
      entityType: entityType as 'club' | 'person' | 'dog' | 'show' | 'entry',
      operation: 'create', // Using create as a fetch action
      entityId,
      data: { prefetch: true },
      priority: "medium" // Medium priority for prefetch operations
    });
  }

  /**
   * Evaluate prefetch opportunities based on navigation
   */
  private evaluatePrefetchOpportunities(currentRoute: string): void {
    // Find patterns where this route is the source
    this.navigationPatterns.forEach((pattern) => {
      if (pattern.fromRoute === currentRoute && pattern.frequency > 3) {
        const confidence = pattern.frequency / 10;
        if (confidence > 0.5) {
          // High confidence - schedule prefetch for target route entities
          this.schedulePrefetchForRoute(pattern.toRoute, confidence);
        }
      }
    });
  }

  /**
   * Evaluate related entity prefetch opportunities
   */
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
            estimatedSize: this.estimateEntitySize(relType),
            createdAt: new Date(),
            timeout: this.prefetchTimeWindow,
            retries: 0
          });
        }
      });
    }
  }

  /**
   * Schedule prefetch for entities typically found on a route
   */
  private schedulePrefetchForRoute(route: string, confidence: number): void {
    // This would need route-to-entity mapping configuration
    // For now, implementing a simple mapping
    const routeEntityMap: Record<string, { type: string; pattern: string }[]> = {
      '/shows': [{ type: 'show', pattern: 'upcoming' }],
      '/dogs': [{ type: 'dog', pattern: 'recent' }],
      '/people': [{ type: 'person', pattern: 'frequent' }],
      '/clubs': [{ type: 'club', pattern: 'member' }]
    };

    const entities = routeEntityMap[route];
    if (entities) {
      entities.forEach(entity => {
        this.schedulePrefetch({
          id: `route-${route}-${Date.now()}-${Math.random()}`,
          entityType: entity.type,
          priority: confidence * 100,
          estimatedSize: this.estimateEntitySize(entity.type),
          createdAt: new Date(),
          timeout: this.prefetchTimeWindow,
          retries: 0
        });
      });
    }
  }

  /**
   * Generate search predictions based on query patterns
   */
  private generateSearchPredictions(query: string, entityType?: string): Array<{
    entityType: string;
    query: string;
    confidence: number;
    estimatedSize: number;
  }> {
    const predictions: Array<{
      entityType: string;
      query: string;
      confidence: number;
      estimatedSize: number;
    }> = [];

    // Query expansion predictions
    const expansions = this.generateQueryExpansions(query);
    expansions.forEach(expansion => {
      predictions.push({
        entityType: entityType || 'person',
        query: expansion.query,
        confidence: expansion.confidence,
        estimatedSize: expansion.estimatedSize
      });
    });

    // Cross-entity predictions
    if (!entityType) {
      ['person', 'dog', 'show', 'club'].forEach(type => {
        predictions.push({
          entityType: type,
          query,
          confidence: 0.6,
          estimatedSize: this.estimateSearchResultSize(type, query)
        });
      });
    }

    return predictions.filter(p => p.confidence > 0.4);
  }

  /**
   * Generate query expansions based on patterns
   */
  private generateQueryExpansions(query: string): Array<{
    query: string;
    confidence: number;
    estimatedSize: number;
  }> {
    const expansions: Array<{
      query: string;
      confidence: number;
      estimatedSize: number;
    }> = [];

    // Common patterns
    if (query.length >= 3) {
      // Partial match expansions
      expansions.push({
        query: `${query}*`,
        confidence: 0.8,
        estimatedSize: 1024 * 5
      });

      // Fuzzy match expansions
      expansions.push({
        query: `~${query}`,
        confidence: 0.6,
        estimatedSize: 1024 * 3
      });
    }

    // Breed-specific expansions for dog searches
    const breedKeywords = ['golden', 'lab', 'shepherd', 'poodle', 'retriever'];
    const lowerQuery = query.toLowerCase();
    breedKeywords.forEach(breed => {
      if (lowerQuery.includes(breed)) {
        expansions.push({
          query: `breed:${breed}`,
          confidence: 0.7,
          estimatedSize: 1024 * 8
        });
      }
    });

    return expansions;
  }

  /**
   * Estimate entity size for prefetch planning
   */
  private estimateEntitySize(entityType: string): number {
    const sizes: Record<string, number> = {
      person: 2 * 1024,   // 2KB
      dog: 5 * 1024,      // 5KB with health records
      show: 10 * 1024,    // 10KB with trials and classes
      club: 3 * 1024,     // 3KB
      entry: 1 * 1024     // 1KB
    };
    return sizes[entityType] || 1024;
  }

  /**
   * Estimate search result size
   */
  private estimateSearchResultSize(entityType: string, query: string): number {
    const baseSize = this.estimateEntitySize(entityType);
    const estimatedResults = Math.max(5, Math.min(20, 15 - query.length));
    return baseSize * estimatedResults;
  }

  /**
   * Update rule success rate based on usage
   */
  private updateRuleSuccessRate(task: PrefetchTask, success: boolean): void {
    // Find the rule that generated this task and update its success rate
    // This is a simplified version - in practice you'd track which rule generated each task
    const relevantRules = this.prefetchRules.filter(rule => rule.enabled);
    relevantRules.forEach(rule => {
      if (success) {
        rule.successRate = Math.min(1, rule.successRate + 0.05);
        rule.lastUsed = new Date();
      } else {
        rule.successRate = Math.max(0, rule.successRate - 0.02);
      }
    });

    // Disable rules with consistently low success rates
    this.prefetchRules.forEach(rule => {
      if (rule.successRate < 0.2 && rule.lastUsed) {
        const daysSinceLastUse = (Date.now() - rule.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastUse > 7) {
          rule.enabled = false;
        }
      }
    });
  }

  /**
   * Initialize default prefetch rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: Omit<PrefetchRule, 'id' | 'createdAt' | 'successRate'>[] = [
      {
        trigger: 'route_change',
        condition: 'route:/shows',
        action: 'prefetch_entity',
        priority: 'high',
        enabled: true
      },
      {
        trigger: 'entity_access',
        condition: 'entityType:person',
        action: 'prefetch_related',
        priority: 'medium',
        enabled: true
      },
      {
        trigger: 'search_query',
        condition: 'length:>=3',
        action: 'prefetch_search_results',
        priority: 'medium',
        enabled: true
      },
      {
        trigger: 'time_based',
        condition: 'idle:>5000',
        action: 'prefetch_entity',
        priority: 'low',
        enabled: true
      }
    ];

    defaultRules.forEach(rule => this.addPrefetchRule(rule));
  }

  /**
   * Start the prefetch processor
   */
  private startPrefetchProcessor(): void {
    // Process queue every 2 seconds
    setInterval(() => {
      this.processPrefetchQueue();
    }, 2000);

    // Cleanup old patterns weekly
    setInterval(() => {
      this.cleanupOldPatterns();
    }, 7 * 24 * 60 * 60 * 1000); // 1 week
  }

  /**
   * Clean up old patterns to prevent unbounded growth
   */
  private cleanupOldPatterns(): void {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    // Remove old navigation patterns
    this.navigationPatterns.forEach((pattern, key) => {
      if (pattern.lastAccessed < cutoffDate && pattern.frequency < 3) {
        this.navigationPatterns.delete(key);
      }
    });

    // Remove old entity access patterns
    this.entityAccessPatterns.forEach((pattern, key) => {
      if (pattern.lastAccessed < cutoffDate && pattern.accessCount < 5) {
        this.entityAccessPatterns.delete(key);
      }
    });

    this.savePatternsToStorage();
  }

  /**
   * Load patterns from localStorage
   */
  private loadPatternsFromStorage(): void {
    try {
      const navPatternsData = localStorage.getItem('myk9show-nav-patterns');
      if (navPatternsData) {
        const parsed = JSON.parse(navPatternsData);
        parsed.forEach((item: [string, NavigationPattern & { lastAccessed: string }]) => {
          this.navigationPatterns.set(item[0], {
            ...item[1],
            lastAccessed: new Date(item[1].lastAccessed)
          });
        });
      }

      const entityPatternsData = localStorage.getItem('myk9show-entity-patterns');
      if (entityPatternsData) {
        const parsed = JSON.parse(entityPatternsData);
        parsed.forEach((item: [string, EntityAccessPattern & { lastAccessed: string }]) => {
          this.entityAccessPatterns.set(item[0], {
            ...item[1],
            lastAccessed: new Date(item[1].lastAccessed)
          });
        });
      }

      const rulesData = localStorage.getItem('myk9show-prefetch-rules');
      if (rulesData) {
        this.prefetchRules = JSON.parse(rulesData).map((rule: Record<string, unknown>) => ({
          ...rule,
          createdAt: new Date(rule.createdAt as string),
          lastUsed: rule.lastUsed ? new Date(rule.lastUsed as string) : undefined
        } as PrefetchRule));
      }
    } catch (error) {
      logger.warn('Failed to load prefetch patterns from storage', 'prefetch', {}, error as Error);
    }
  }

  /**
   * Save patterns to localStorage
   */
  private savePatternsToStorage(): void {
    try {
      localStorage.setItem(
        'myk9show-nav-patterns',
        JSON.stringify(Array.from(this.navigationPatterns.entries()))
      );

      localStorage.setItem(
        'myk9show-entity-patterns',
        JSON.stringify(Array.from(this.entityAccessPatterns.entries()))
      );

      localStorage.setItem(
        'myk9show-prefetch-rules',
        JSON.stringify(this.prefetchRules)
      );
    } catch (error) {
      logger.warn('Failed to save prefetch patterns to storage', 'prefetch', {}, error as Error);
    }
  }

  /**
   * Get analytics data for debugging and optimization
   */
  getAnalytics(): {
    navigationPatterns: number;
    entityPatterns: number;
    activeRules: number;
    pendingPrefetches: number;
    queuedPrefetches: number;
  } {
    return {
      navigationPatterns: this.navigationPatterns.size,
      entityPatterns: this.entityAccessPatterns.size,
      activeRules: this.prefetchRules.filter(r => r.enabled).length,
      pendingPrefetches: this.pendingPrefetches.size,
      queuedPrefetches: this.prefetchQueue.length
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
    
    localStorage.removeItem('myk9show-nav-patterns');
    localStorage.removeItem('myk9show-entity-patterns');
    localStorage.removeItem('myk9show-prefetch-rules');
    
    this.initializeDefaultRules();
  }
}

// Create singleton instance
export const predictivePrefetcher = new PredictivePrefetcher();