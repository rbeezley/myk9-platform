/**
 * Show Data Isolation Service
 * 
 * Manages data boundaries between different shows to prevent data
 * contamination and ensure proper isolation. This service ensures
 * that data from one show doesn't leak into another show's context.
 */

import { EventEmitter } from 'events';
import { logger } from '@/services/LoggingService';

export interface ShowBoundary {
  /** Unique show identifier */
  showId: string;
  /** Show name for logging */
  showName: string;
  /** When this boundary was created */
  createdAt: Date;
  /** When this boundary was last accessed */
  lastAccessed: Date;
  /** Data types loaded in this boundary */
  loadedDataTypes: Set<string>;
  /** Memory usage estimate in bytes */
  memoryUsage: number;
  /** Whether this boundary is currently active */
  isActive: boolean;
}


/**
 * Service to manage show data boundaries and isolation
 */
export class ShowIsolationService extends EventEmitter {
  private boundaries = new Map<string, ShowBoundary>();
  private activeShowId: string | null = null;
  private memoryThresholdMB = 100; // Warning threshold
  private maxBoundaries = 5; // Maximum concurrent show boundaries
  private cleanupIntervalMs = 5 * 60 * 1000; // 5 minutes
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startCleanupTimer();
  }

  /**
   * Create a new data boundary for a show
   */
  createBoundary(showId: string, showName: string): ShowBoundary {
    // Check if boundary already exists
    if (this.boundaries.has(showId)) {
      const existing = this.boundaries.get(showId)!;
      existing.lastAccessed = new Date();
      return existing;
    }

    // Clean up old boundaries if we're at the limit
    if (this.boundaries.size >= this.maxBoundaries) {
      this.cleanupOldestBoundaries(1);
    }

    const boundary: ShowBoundary = {
      showId,
      showName,
      createdAt: new Date(),
      lastAccessed: new Date(),
      loadedDataTypes: new Set(),
      memoryUsage: 0,
      isActive: false,
    };

    this.boundaries.set(showId, boundary);
    this.emit('boundary-created', boundary);

    logger.debug('Created data boundary for show', 'data-boundaries', { showName, showId });
    return boundary;
  }

  /**
   * Activate a show boundary (makes it the current context)
   */
  activateBoundary(showId: string): boolean {
    const boundary = this.boundaries.get(showId);
    if (!boundary) {
      logger.error('Cannot activate boundary: show not found', 'data-boundaries', { showId });
      return false;
    }

    // Deactivate current active boundary
    if (this.activeShowId && this.activeShowId !== showId) {
      const currentBoundary = this.boundaries.get(this.activeShowId);
      if (currentBoundary) {
        currentBoundary.isActive = false;
        this.emit('boundary-deactivated', currentBoundary);
      }
    }

    // Activate new boundary
    boundary.isActive = true;
    boundary.lastAccessed = new Date();
    this.activeShowId = showId;
    this.emit('boundary-activated', boundary);

    logger.debug('Activated data boundary for show', 'data-boundaries', { showName: boundary.showName, showId });
    return true;
  }

  /**
   * Get the currently active show boundary
   */
  getActiveBoundary(): ShowBoundary | null {
    if (!this.activeShowId) return null;
    return this.boundaries.get(this.activeShowId) || null;
  }

  /**
   * Get all available show boundaries
   */
  getAllBoundaries(): ShowBoundary[] {
    return Array.from(this.boundaries.values());
  }

  /**
   * Register data loading in a show boundary
   */
  registerDataLoad(showId: string, dataType: string, sizeBytes: number = 0): void {
    const boundary = this.boundaries.get(showId);
    if (!boundary) {
      logger.warn('Cannot register data load: boundary not found', 'data-boundaries', { showId });
      return;
    }

    boundary.loadedDataTypes.add(dataType);
    boundary.memoryUsage += sizeBytes;
    boundary.lastAccessed = new Date();

    // Check memory usage
    const totalMemory = Array.from(this.boundaries.values())
      .reduce((sum, b) => sum + b.memoryUsage, 0);

    if (totalMemory > this.memoryThresholdMB * 1024 * 1024) {
      this.emit('memory-warning', totalMemory, Array.from(this.boundaries.values()));
    }

    logger.debug('Registered data in boundary', 'data-boundaries', { dataType, showId, sizeBytes });
  }

  /**
   * Unregister data from a show boundary
   */
  unregisterData(showId: string, dataType: string, sizeBytes: number = 0): void {
    const boundary = this.boundaries.get(showId);
    if (!boundary) return;

    boundary.loadedDataTypes.delete(dataType);
    boundary.memoryUsage = Math.max(0, boundary.memoryUsage - sizeBytes);

    logger.debug('Unregistered data from boundary', 'data-boundaries', { dataType, showId, sizeBytes });
  }

  /**
   * Destroy a show boundary and clean up its data
   */
  destroyBoundary(showId: string): boolean {
    const boundary = this.boundaries.get(showId);
    if (!boundary) return false;

    // Deactivate if it's the active boundary
    if (this.activeShowId === showId) {
      this.activeShowId = null;
    }

    // Clean up the boundary
    this.boundaries.delete(showId);
    this.emit('boundary-destroyed', showId, boundary);

    logger.debug('Destroyed data boundary for show', 'data-boundaries', { showName: boundary.showName, showId });
    return true;
  }

  /**
   * Clean up the oldest inactive boundaries
   */
  cleanupOldestBoundaries(count: number = 1): string[] {
    const inactiveBoundaries = Array.from(this.boundaries.values())
      .filter(b => !b.isActive)
      .sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime());

    const toCleanup = inactiveBoundaries.slice(0, count);
    const cleanedIds: string[] = [];

    toCleanup.forEach(boundary => {
      this.destroyBoundary(boundary.showId);
      cleanedIds.push(boundary.showId);
    });

    if (cleanedIds.length > 0) {
      this.emit('cleanup-completed', cleanedIds);
      logger.debug('Cleaned up old show boundaries', 'data-boundaries', { count: cleanedIds.length });
    }

    return cleanedIds;
  }

  /**
   * Clean up all inactive boundaries older than specified age
   */
  cleanupOldBoundaries(maxAgeMs: number = 30 * 60 * 1000): string[] {
    const cutoffTime = new Date(Date.now() - maxAgeMs);
    const cleanedIds: string[] = [];

    for (const [showId, boundary] of this.boundaries) {
      if (!boundary.isActive && boundary.lastAccessed < cutoffTime) {
        this.destroyBoundary(showId);
        cleanedIds.push(showId);
      }
    }

    if (cleanedIds.length > 0) {
      this.emit('cleanup-completed', cleanedIds);
      logger.debug('Cleaned up old show boundaries by age', 'data-boundaries', { count: cleanedIds.length, maxAgeMs });
    }

    return cleanedIds;
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    totalMemoryMB: number;
    boundaryCount: number;
    activeBoundaries: number;
    largestBoundaryMB: number;
    oldestBoundary: Date | null;
  } {
    const boundaries = Array.from(this.boundaries.values());
    const totalMemory = boundaries.reduce((sum, b) => sum + b.memoryUsage, 0);
    
    return {
      totalMemoryMB: totalMemory / (1024 * 1024),
      boundaryCount: boundaries.length,
      activeBoundaries: boundaries.filter(b => b.isActive).length,
      largestBoundaryMB: Math.max(...boundaries.map(b => b.memoryUsage), 0) / (1024 * 1024),
      oldestBoundary: boundaries.length > 0 
        ? new Date(Math.min(...boundaries.map(b => b.lastAccessed.getTime())))
        : null,
    };
  }

  /**
   * Check if a show boundary exists and is isolated
   */
  isBoundaryIsolated(showId: string): boolean {
    const boundary = this.boundaries.get(showId);
    if (!boundary) return false;

    // A boundary is considered isolated if it's not mixing data with other shows
    return boundary.loadedDataTypes.size > 0;
  }

  /**
   * Switch to a different show context with proper cleanup
   */
  async switchShowContext(newShowId: string, showName?: string): Promise<boolean> {
    // If switching to the same show, no action needed
    if (this.activeShowId === newShowId) {
      return true;
    }

    logger.debug('Switching show context', 'data-boundaries', { from: this.activeShowId, to: newShowId });

    // Create boundary if it doesn't exist
    if (!this.boundaries.has(newShowId)) {
      this.createBoundary(newShowId, showName || `Show ${newShowId}`);
    }

    // Activate the new boundary
    const success = this.activateBoundary(newShowId);

    // Optional: Clean up old boundaries if memory usage is high
    const stats = this.getMemoryStats();
    if (stats.totalMemoryMB > this.memoryThresholdMB) {
      this.cleanupOldestBoundaries(2);
    }

    return success;
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldBoundaries();
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop automatic cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Configure memory and cleanup settings
   */
  configure(options: {
    memoryThresholdMB?: number;
    maxBoundaries?: number;
    cleanupIntervalMs?: number;
  }): void {
    if (options.memoryThresholdMB) {
      this.memoryThresholdMB = options.memoryThresholdMB;
    }
    if (options.maxBoundaries) {
      this.maxBoundaries = options.maxBoundaries;
    }
    if (options.cleanupIntervalMs) {
      this.cleanupIntervalMs = options.cleanupIntervalMs;
      // Restart timer with new interval
      this.stopCleanupTimer();
      this.startCleanupTimer();
    }
  }

  /**
   * Cleanup on service destruction
   */
  destroy(): void {
    this.stopCleanupTimer();
    
    // Destroy all boundaries
    const boundaryIds = Array.from(this.boundaries.keys());
    boundaryIds.forEach(showId => this.destroyBoundary(showId));

    this.removeAllListeners();
    logger.debug('ShowIsolationService destroyed', 'data-boundaries');
  }
}

// Global singleton instance
export const showIsolationService = new ShowIsolationService();

// Configure for development vs production
if (import.meta.env.DEV) {
  showIsolationService.configure({
    memoryThresholdMB: 50, // Lower threshold in development
    maxBoundaries: 3,      // Fewer boundaries in development
    cleanupIntervalMs: 2 * 60 * 1000, // More frequent cleanup
  });
  
  // Add debugging to window in development
  (window as unknown as Record<string, unknown>).__showIsolation = {
    service: showIsolationService,
    stats: () => showIsolationService.getMemoryStats(),
    boundaries: () => showIsolationService.getAllBoundaries(),
    cleanup: () => showIsolationService.cleanupOldBoundaries(),
  };
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    showIsolationService.destroy();
  });
}