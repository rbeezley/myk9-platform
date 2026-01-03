/**
 * PrefetchManager - Intelligent prefetching based on navigation patterns
 * Day 23-24: Performance optimization
 *
 * Tracks user navigation patterns and preloads predicted next pages to reduce
 * perceived load times. Uses a simple Markov chain model to predict next navigation.
 *
 * Example patterns:
 * - Home → ClassList → EntryList (preload entries when on ClassList)
 * - EntryList → Scoresheet (preload scoresheet data when viewing entry)
 * - ClassList → ClassList (preload next class in list)
 */

import { logger } from '@/utils/logger';
import type { ReplicationManager } from './ReplicationManager';

interface NavigationPattern {
  fromPage: string;
  toPage: string;
  count: number;
  lastSeen: number;
}

interface PrefetchTask {
  tableName: string;
  filter?: Record<string, any>;
  priority: 'high' | 'medium' | 'low';
}

export class PrefetchManager {
  private patterns: Map<string, NavigationPattern[]> = new Map();
  private currentPage: string = '';
  private replicationManager: ReplicationManager | null = null;
  private isPrefetching: boolean = false;

  // Prefetch configuration
  private readonly PATTERN_THRESHOLD = 2; // Minimum count to trigger prefetch
  private readonly MAX_PATTERNS_PER_PAGE = 5; // Store top 5 patterns per page
  private readonly PREFETCH_DELAY_MS = 500; // Delay before prefetching (debounce user actions)
  private readonly STORAGE_KEY = 'myK9Q_prefetch_patterns';

  constructor(replicationManager: ReplicationManager) {
    this.replicationManager = replicationManager;
    this.loadPatterns();
  }

  /**
   * Track page navigation for pattern learning
   */
  trackNavigation(toPage: string): void {
    if (!this.currentPage || this.currentPage === toPage) {
      this.currentPage = toPage;
      return;
    }

    const fromPage = this.currentPage;
    this.currentPage = toPage;

    // Update pattern
    const patterns = this.patterns.get(fromPage) || [];
    const existingPattern = patterns.find(p => p.toPage === toPage);

    if (existingPattern) {
      existingPattern.count++;
      existingPattern.lastSeen = Date.now();
    } else {
      patterns.push({
        fromPage,
        toPage,
        count: 1,
        lastSeen: Date.now(),
      });
    }

    // Keep only top patterns
    patterns.sort((a, b) => b.count - a.count);
    this.patterns.set(fromPage, patterns.slice(0, this.MAX_PATTERNS_PER_PAGE));

    // Save patterns to localStorage
    this.savePatterns();

    // Trigger prefetch for likely next page
    this.schedulePrefetch(toPage);

}

  /**
   * Schedule prefetch based on current page
   */
  private schedulePrefetch(currentPage: string): void {
    // Debounce: wait for user to settle on page
    setTimeout(() => {
      const predictions = this.predictNextPages(currentPage);

      if (predictions.length > 0) {
this.executePrefetch(predictions);
      }
    }, this.PREFETCH_DELAY_MS);
  }

  /**
   * Predict likely next pages based on historical patterns
   */
  private predictNextPages(currentPage: string): NavigationPattern[] {
    const patterns = this.patterns.get(currentPage) || [];

    // Filter patterns that meet threshold
    return patterns.filter(p => p.count >= this.PATTERN_THRESHOLD);
  }

  /**
   * Execute prefetch for predicted pages
   */
  private async executePrefetch(predictions: NavigationPattern[]): Promise<void> {
    if (this.isPrefetching || !this.replicationManager) {
      return;
    }

    // Day 25-26 LOW Fix: Skip prefetch if sync is already in progress
    // This prevents duplicate fetches and wasted bandwidth
    if (this.replicationManager.isSyncInProgress()) {
      logger.log('[Prefetch] Sync in progress, skipping prefetch to avoid duplication');
      return;
    }

    this.isPrefetching = true;

    try {
      // Map page names to tables that should be prefetched
      const tasks: PrefetchTask[] = [];

      for (const prediction of predictions) {
        const pageTasks = this.getTasksForPage(prediction.toPage);
        tasks.push(...pageTasks);
      }

      // Execute prefetch tasks (high priority first)
      tasks.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      for (const task of tasks) {
        await this.prefetchTable(task);
      }
    } finally {
      this.isPrefetching = false;
    }
  }

  /**
   * Map page names to prefetch tasks
   */
  private getTasksForPage(pageName: string): PrefetchTask[] {
    const tasks: PrefetchTask[] = [];

    // Normalize page path for matching (handles /admin/myK9Q1-... patterns)
    const normalizedPath = this.normalizePath(pageName);

    // Define prefetch strategies per page
    switch (normalizedPath) {
      case '/class-list':
        // Prefetch classes and trials for class list
        tasks.push(
          { tableName: 'classes', priority: 'high' },
          { tableName: 'trials', priority: 'medium' }
        );
        break;

      case '/entry-list':
        // Prefetch entries and class data
        tasks.push(
          { tableName: 'entries', priority: 'high' },
          { tableName: 'classes', priority: 'medium' }
        );
        break;

      case '/scoresheet':
        // Prefetch entries and class requirements
        tasks.push(
          { tableName: 'entries', priority: 'high' },
          { tableName: 'class_requirements', priority: 'medium' }
        );
        break;

      case '/home':
        // Prefetch shows, trials, entries for dashboard
        tasks.push(
          { tableName: 'shows', priority: 'high' },
          { tableName: 'trials', priority: 'high' },
          { tableName: 'entries', priority: 'medium' }
        );
        break;

      case '/admin/release-control':
        // Admin: Release control (trial and class management)
        tasks.push(
          { tableName: 'trials', priority: 'high' },
          { tableName: 'classes', priority: 'high' }
        );
        break;

      case '/admin/statistics':
        // Admin: Statistics page (needs all data for summaries)
        tasks.push(
          { tableName: 'entries', priority: 'high' },
          { tableName: 'classes', priority: 'high' },
          { tableName: 'trials', priority: 'medium' }
        );
        break;

      case '/admin':
        // Admin home (show list)
        tasks.push(
          { tableName: 'shows', priority: 'high' },
          { tableName: 'trials', priority: 'medium' }
        );
        break;

      default:
        // No specific prefetch strategy
        break;
    }

    return tasks;
  }

  /**
   * Normalize page path for pattern matching
   * Strips license keys and IDs from admin/dynamic routes
   */
  private normalizePath(pagePath: string): string {
    // Strip trailing slashes
    const cleaned = pagePath.replace(/\/$/, '');

    // Admin release control: /admin/myK9Q1-... → /admin/release-control
    if (/^\/admin\/[^/]+$/.test(cleaned)) {
      return '/admin/release-control';
    }

    // Admin statistics: /admin/myK9Q1-.../statistics → /admin/statistics
    if (/^\/admin\/[^/]+\/statistics$/.test(cleaned)) {
      return '/admin/statistics';
    }

    // Admin trial details: /admin/myK9Q1-.../trial/123 → /admin
    if (/^\/admin\/[^/]+\/trial\/\d+$/.test(cleaned)) {
      return '/admin';
    }

    // Class entry list: /admin/myK9Q1-.../trial/123/class/456 → /entry-list
    if (/^\/admin\/[^/]+\/trial\/\d+\/class\/\d+$/.test(cleaned)) {
      return '/entry-list';
    }

    // Scoresheet: /scoresheet/AKC/... → /scoresheet
    if (/^\/scoresheet\//.test(cleaned)) {
      return '/scoresheet';
    }

    // Class list: /class-list or /class-list/myK9Q1-... → /class-list
    if (/^\/class-list/.test(cleaned)) {
      return '/class-list';
    }

    return cleaned;
  }

  /**
   * Prefetch a specific table
   */
  private async prefetchTable(task: PrefetchTask): Promise<void> {
    if (!this.replicationManager) return;

    try {
      const table = this.replicationManager.getTable(task.tableName);
      if (!table) {
        logger.warn(`[Prefetch] Table not found: ${task.tableName}`);
        return;
      }

      // Check if table has recent data (< 1 minute old)
      const metadata = await table.getSyncMetadata();
      const isFresh = metadata && (Date.now() - metadata.lastIncrementalSyncAt < 60000);

      if (isFresh) {
        logger.log(`[Prefetch] Table ${task.tableName} is fresh, skipping prefetch`);
        return;
      }

// Trigger background sync (non-blocking)
      // The table's sync() method will handle the actual data fetch
      // We don't await here to prevent blocking the UI
      table.sync('', { forceFullSync: false }).catch(error => {
        logger.warn(`[Prefetch] Failed to prefetch ${task.tableName}:`, error);
      });
    } catch (error) {
      logger.warn(`[Prefetch] Error prefetching ${task.tableName}:`, error);
    }
  }

  /**
   * Manually trigger prefetch for a specific page
   */
  async prefetchForPage(pageName: string): Promise<void> {
    // Day 25-26 LOW Fix: Skip manual prefetch if sync is already in progress
    if (this.replicationManager?.isSyncInProgress()) {
      logger.log('[Prefetch] Sync in progress, skipping manual prefetch to avoid duplication');
      return;
    }

    const tasks = this.getTasksForPage(pageName);

    for (const task of tasks) {
      await this.prefetchTable(task);
    }
  }

  /**
   * Load navigation patterns from localStorage
   */
  private loadPatterns(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.patterns = new Map(Object.entries(data));
        logger.log(`[Prefetch] Loaded ${this.patterns.size} navigation patterns`);
      }
    } catch (error) {
      logger.warn('[Prefetch] Failed to load patterns:', error);
      this.patterns = new Map();
    }
  }

  /**
   * Save navigation patterns to localStorage
   */
  private savePatterns(): void {
    try {
      const data = Object.fromEntries(this.patterns);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      logger.warn('[Prefetch] Failed to save patterns:', error);
    }
  }

  /**
   * Clear all navigation patterns (for testing or reset)
   */
  clearPatterns(): void {
    this.patterns.clear();
    localStorage.removeItem(this.STORAGE_KEY);
    logger.log('[Prefetch] Patterns cleared');
  }

  /**
   * Get current navigation patterns (for debugging)
   */
  getPatterns(): Map<string, NavigationPattern[]> {
    return this.patterns;
  }

  /**
   * Get statistics about prefetch performance
   */
  getStats(): {
    totalPatterns: number;
    mostCommonTransition: string | null;
    currentPage: string;
  } {
    let maxCount = 0;
    let mostCommon: string | null = null;

    this.patterns.forEach((patterns, fromPage) => {
      patterns.forEach(pattern => {
        if (pattern.count > maxCount) {
          maxCount = pattern.count;
          mostCommon = `${fromPage} → ${pattern.toPage}`;
        }
      });
    });

    return {
      totalPatterns: Array.from(this.patterns.values()).reduce((sum, arr) => sum + arr.length, 0),
      mostCommonTransition: mostCommon,
      currentPage: this.currentPage,
    };
  }
}
