/**
 * Automatic Data Cleanup Service
 * 
 * Handles automatic cleanup of show-specific data when users exit shows
 * or switch contexts. This prevents memory leaks and ensures optimal
 * performance by freeing up unused data.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { showIsolationService } from './ShowIsolation';
import { logger } from '@/services/LoggingService';

interface CleanupRule {
  /** Unique identifier for this cleanup rule */
  id: string;
  /** Human-readable name */
  name: string;
  /** When this rule should trigger cleanup */
  trigger: 'show-exit' | 'show-switch' | 'timeout' | 'memory-pressure' | 'manual';
  /** How long to wait before cleanup (ms) */
  delayMs: number;
  /** Data types to clean up */
  dataTypes: string[];
  /** Whether to clean up completely or just reduce data */
  aggressive: boolean;
  /** Condition function to check if cleanup should proceed */
  condition?: () => boolean;
  /** Custom cleanup function */
  cleanup?: (showId: string, dataTypes: string[]) => Promise<void>;
}

interface CleanupEvent {
  /** When the cleanup occurred */
  timestamp: Date;
  /** Show ID that was cleaned */
  showId: string;
  /** Trigger that caused the cleanup */
  trigger: CleanupRule['trigger'];
  /** Data types that were cleaned */
  dataTypes: string[];
  /** Amount of memory freed (estimated) */
  memoryFreedBytes: number;
  /** How long the cleanup took */
  durationMs: number;
}

/**
 * Service to handle automatic data cleanup
 */
export class AutoCleanupService {
  private rules: Map<string, CleanupRule> = new Map();
  private cleanupHistory: CleanupEvent[] = [];
  private pendingCleanups: Map<string, NodeJS.Timeout> = new Map();
  private isEnabled: boolean = true;
  private maxHistorySize: number = 100;

  constructor() {
    this.setupDefaultRules();
    this.setupEventListeners();
  }

  /**
   * Setup default cleanup rules for common scenarios
   */
  private setupDefaultRules(): void {
    // Rule 1: Clean up when switching shows
    this.addCleanupRule({
      id: 'show-switch',
      name: 'Show Context Switch Cleanup',
      trigger: 'show-switch',
      delayMs: 1000, // 1 second delay to allow for navigation
      dataTypes: ['dogs', 'people', 'classes', 'registrations'],
      aggressive: false,
      condition: () => this.isEnabled,
    });

    // Rule 2: Clean up after extended time away from show
    this.addCleanupRule({
      id: 'show-timeout',
      name: 'Show Timeout Cleanup',
      trigger: 'timeout',
      delayMs: 15 * 60 * 1000, // 15 minutes
      dataTypes: ['dogs', 'people', 'classes', 'registrations', 'health'],
      aggressive: true,
      condition: () => this.isEnabled && !document.hasFocus(),
    });

    // Rule 3: Clean up when memory pressure is high
    this.addCleanupRule({
      id: 'memory-pressure',
      name: 'Memory Pressure Cleanup',
      trigger: 'memory-pressure',
      delayMs: 5000, // 5 second delay
      dataTypes: ['dogs', 'people', 'classes', 'registrations', 'health', 'analytics'],
      aggressive: true,
      condition: () => {
        const stats = showIsolationService.getMemoryStats();
        return stats.totalMemoryMB > 100; // Cleanup if over 100MB
      },
    });

    // Rule 4: Clean up on explicit show exit
    this.addCleanupRule({
      id: 'show-exit',
      name: 'Show Exit Cleanup',
      trigger: 'show-exit',
      delayMs: 500, // Quick cleanup
      dataTypes: ['dogs', 'people', 'classes', 'registrations', 'health', 'judging'],
      aggressive: true,
      condition: () => this.isEnabled,
    });
  }

  /**
   * Setup event listeners for automatic cleanup triggers
   */
  private setupEventListeners(): void {
    // Listen for show isolation events
    showIsolationService.on('boundary-activated', (boundary) => {
      this.triggerCleanup('show-switch', boundary.showId);
    });

    showIsolationService.on('boundary-destroyed', (showId) => {
      this.triggerCleanup('show-exit', showId);
    });

    showIsolationService.on('memory-warning', () => {
      this.triggerCleanup('memory-pressure');
    });

    // Listen for page visibility changes for timeout cleanup
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          // Start timeout cleanup when page becomes hidden
          setTimeout(() => {
            if (document.hidden) {
              this.triggerCleanup('timeout');
            }
          }, 15 * 60 * 1000); // 15 minutes
        }
      });
    }

    // Listen for beforeunload to cleanup everything
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.triggerCleanup('show-exit');
      });
    }
  }

  /**
   * Add a new cleanup rule
   */
  addCleanupRule(rule: CleanupRule): void {
    this.rules.set(rule.id, rule);
    logger.debug('Added cleanup rule', 'cleanup', { ruleName: rule.name, ruleId: rule.id });
  }

  /**
   * Remove a cleanup rule
   */
  removeCleanupRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      // Cancel any pending cleanup for this rule
      const pendingKey = `${ruleId}-pending`;
      if (this.pendingCleanups.has(pendingKey)) {
        clearTimeout(this.pendingCleanups.get(pendingKey)!);
        this.pendingCleanups.delete(pendingKey);
      }
      logger.debug('Removed cleanup rule', 'cleanup', { ruleId });
    }
    return removed;
  }

  /**
   * Get all active cleanup rules
   */
  getCleanupRules(): CleanupRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Trigger cleanup based on a specific trigger
   */
  async triggerCleanup(
    trigger: CleanupRule['trigger'],
    showId?: string,
    forceImmediate: boolean = false
  ): Promise<void> {
    if (!this.isEnabled) {
      logger.debug('Cleanup disabled, skipping trigger', 'cleanup', { trigger });
      return;
    }

    // Find all rules that match this trigger
    const matchingRules = Array.from(this.rules.values())
      .filter(rule => rule.trigger === trigger);

    if (matchingRules.length === 0) {
      logger.debug('No cleanup rules found for trigger', 'cleanup', { trigger });
      return;
    }

    logger.debug('Triggered cleanup', 'cleanup', { trigger, ruleCount: matchingRules.length });

    // Execute each matching rule
    for (const rule of matchingRules) {
      await this.executeCleanupRule(rule, showId, forceImmediate);
    }
  }

  /**
   * Execute a specific cleanup rule
   */
  private async executeCleanupRule(
    rule: CleanupRule, 
    showId?: string, 
    forceImmediate: boolean = false
  ): Promise<void> {
    // Check condition if provided
    if (rule.condition && !rule.condition()) {
      logger.debug('Skipping cleanup rule - condition not met', 'cleanup', { ruleName: rule.name });
      return;
    }

    const executeCleanup = async () => {
      const startTime = Date.now();
      let memoryFreedBytes = 0;

      try {
        logger.debug('Executing cleanup rule', 'cleanup', { ruleName: rule.name });

        // If no specific showId provided, clean all inactive shows
        const showsToClean = showId 
          ? [showId] 
          : showIsolationService.getAllBoundaries()
              .filter(b => !b.isActive)
              .map(b => b.showId);

        for (const cleanShowId of showsToClean) {
          const boundary = showIsolationService.getAllBoundaries()
            .find(b => b.showId === cleanShowId);

          if (boundary) {
            const beforeMemory = boundary.memoryUsage;
            
            // Use custom cleanup function if provided
            if (rule.cleanup) {
              await rule.cleanup(cleanShowId, rule.dataTypes);
            } else {
              await this.defaultCleanup(cleanShowId, rule.dataTypes, rule.aggressive);
            }

            const afterMemory = boundary.memoryUsage;
            memoryFreedBytes += beforeMemory - afterMemory;
          }
        }

        // Record the cleanup event
        const cleanupEvent: CleanupEvent = {
          timestamp: new Date(),
          showId: showId || 'multiple',
          trigger: rule.trigger,
          dataTypes: rule.dataTypes,
          memoryFreedBytes,
          durationMs: Date.now() - startTime,
        };

        this.addCleanupEvent(cleanupEvent);

        logger.info('Completed cleanup', 'cleanup', { ruleName: rule.name, memoryFreedMB: (memoryFreedBytes / 1024 / 1024).toFixed(2), durationMs: cleanupEvent.durationMs });

      } catch (error) {
        logger.error('Cleanup rule failed', 'cleanup', { ruleName: rule.name }, error as Error);
      }
    };

    // Execute immediately or with delay
    if (forceImmediate || rule.delayMs <= 0) {
      await executeCleanup();
    } else {
      const pendingKey = `${rule.id}-${showId || 'all'}`;
      
      // Cancel any existing pending cleanup for this rule/show combo
      if (this.pendingCleanups.has(pendingKey)) {
        clearTimeout(this.pendingCleanups.get(pendingKey)!);
      }

      // Schedule the cleanup
      const timeoutId = setTimeout(async () => {
        await executeCleanup();
        this.pendingCleanups.delete(pendingKey);
      }, rule.delayMs);

      this.pendingCleanups.set(pendingKey, timeoutId);
      logger.debug('Scheduled cleanup', 'cleanup', { ruleName: rule.name, delayMs: rule.delayMs });
    }
  }

  /**
   * Default cleanup implementation
   */
  private async defaultCleanup(showId: string, dataTypes: string[], aggressive: boolean): Promise<void> {
    logger.debug('Default cleanup for show', 'cleanup', { showId, dataTypes, aggressive });

    // Clean up each data type
    for (const dataType of dataTypes) {
      try {
        // Dynamic import and cleanup of store
        const storeModule = await import(`@/store/${dataType}Store.ts`);
        const hookName = `use${dataType.charAt(0).toUpperCase() + dataType.slice(1)}Store`;
        const useStore = storeModule[hookName];

        if (useStore) {
          const store = useStore.getState();
          
          if (aggressive) {
            // Complete cleanup
            if (store.clearShowData && typeof store.clearShowData === 'function') {
              store.clearShowData();
            }
          } else {
            // Partial cleanup - keep essential data
            if (store.partialCleanup && typeof store.partialCleanup === 'function') {
              store.partialCleanup(showId);
            } else if (store.clearShowData && typeof store.clearShowData === 'function') {
              store.clearShowData();
            }
          }

          // Unregister from show isolation service
          showIsolationService.unregisterData(showId, dataType);
        }
      } catch (error) {
        logger.warn('Failed to cleanup data type for show', 'cleanup', { dataType, showId }, error as Error);
      }
    }
  }

  /**
   * Add a cleanup event to history
   */
  private addCleanupEvent(event: CleanupEvent): void {
    this.cleanupHistory.push(event);
    
    // Keep history size manageable
    if (this.cleanupHistory.length > this.maxHistorySize) {
      this.cleanupHistory = this.cleanupHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get cleanup history
   */
  getCleanupHistory(limit?: number): CleanupEvent[] {
    const history = [...this.cleanupHistory].reverse(); // Most recent first
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get cleanup statistics
   */
  getCleanupStats(): {
    totalCleanups: number;
    totalMemoryFreedMB: number;
    averageCleanupTimeMs: number;
    mostFrequentTrigger: string;
    recentCleanups: number;
  } {
    const recentCutoff = Date.now() - (24 * 60 * 60 * 1000); // Last 24 hours
    const recentCleanups = this.cleanupHistory.filter(event => 
      event.timestamp.getTime() > recentCutoff
    );

    const totalMemoryFreed = this.cleanupHistory.reduce(
      (sum, event) => sum + event.memoryFreedBytes, 0
    );

    const avgCleanupTime = this.cleanupHistory.length > 0
      ? this.cleanupHistory.reduce((sum, event) => sum + event.durationMs, 0) / this.cleanupHistory.length
      : 0;

    // Find most frequent trigger
    const triggerCounts = new Map<string, number>();
    this.cleanupHistory.forEach(event => {
      triggerCounts.set(event.trigger, (triggerCounts.get(event.trigger) || 0) + 1);
    });

    const mostFrequentTrigger = Array.from(triggerCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

    return {
      totalCleanups: this.cleanupHistory.length,
      totalMemoryFreedMB: totalMemoryFreed / (1024 * 1024),
      averageCleanupTimeMs: avgCleanupTime,
      mostFrequentTrigger,
      recentCleanups: recentCleanups.length,
    };
  }

  /**
   * Enable or disable automatic cleanup
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    logger.info('Automatic cleanup status changed', 'cleanup', { enabled });
    
    if (!enabled) {
      // Cancel all pending cleanups
      this.pendingCleanups.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      this.pendingCleanups.clear();
    }
  }

  /**
   * Check if cleanup is enabled
   */
  isCleanupEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Manually trigger cleanup for a specific show
   */
  async cleanupShow(showId: string, aggressive: boolean = false): Promise<void> {
    logger.info('Manual cleanup triggered for show', 'cleanup', { showId, aggressive });
    
    const rule: CleanupRule = {
      id: 'manual',
      name: 'Manual Cleanup',
      trigger: 'manual',
      delayMs: 0,
      dataTypes: ['dogs', 'people', 'classes', 'registrations', 'health', 'judging', 'analytics'],
      aggressive,
    };

    await this.executeCleanupRule(rule, showId, true);
  }

  /**
   * Cleanup service resources
   */
  destroy(): void {
    // Cancel all pending cleanups
    this.pendingCleanups.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.pendingCleanups.clear();

    // Clear rules and history
    this.rules.clear();
    this.cleanupHistory = [];

    logger.info('AutoCleanupService destroyed', 'cleanup');
  }
}

// Global singleton instance
export const autoCleanupService = new AutoCleanupService();

// Add debugging support in development
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__autoCleanup = {
    service: autoCleanupService,
    stats: () => autoCleanupService.getCleanupStats(),
    history: (limit?: number) => autoCleanupService.getCleanupHistory(limit),
    rules: () => autoCleanupService.getCleanupRules(),
    trigger: (trigger: string, showId?: string) => autoCleanupService.triggerCleanup(trigger as any, showId, true),
    cleanup: (showId: string, aggressive?: boolean) => autoCleanupService.cleanupShow(showId, aggressive),
  };
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    autoCleanupService.destroy();
  });
}