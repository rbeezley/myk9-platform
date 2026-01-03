/**
 * Memory Leak Detector
 *
 * Monitors memory usage and detects potential memory leaks in development mode.
 * Tracks heap size, subscription count, and provides warnings when thresholds are exceeded.
 */

import { subscriptionCleanup } from '../services/subscriptionCleanup';
import { logger } from '@/utils/logger';

/** Performance with Chrome memory API */
interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

interface MemorySnapshot {
  timestamp: Date;
  heapUsed: number;
  heapTotal: number;
  subscriptionCount: number;
}

interface LeakWarningDetails {
  heapUsedMB?: string;
  heapTotalMB?: string;
  count?: number;
  breakdown?: Record<string, number>;
  oldHeapMB?: string;
  newHeapMB?: string;
  growthRate?: string;
}

interface LeakWarning {
  type: 'heap' | 'subscriptions' | 'heap_growth';
  severity: 'low' | 'medium' | 'high';
  message: string;
  details: LeakWarningDetails;
  timestamp: Date;
}

class MemoryLeakDetector {
  private snapshots: MemorySnapshot[] = [];
  private warnings: LeakWarning[] = [];
  private maxSnapshots = 100;
  private maxWarnings = 20;
  private monitoringInterval: number | null = null;
  private listeners: Set<(warnings: LeakWarning[]) => void> = new Set();

  // Thresholds
  private readonly HEAP_WARNING_MB = 100; // Warn if heap exceeds 100MB
  private readonly HEAP_CRITICAL_MB = 200; // Critical if heap exceeds 200MB
  private readonly SUBSCRIPTION_WARNING = 15; // Warn if subscriptions exceed 15
  private readonly SUBSCRIPTION_CRITICAL = 30; // Critical if subscriptions exceed 30
  private readonly GROWTH_RATE_WARNING = 1.5; // Warn if heap grows 50% in 5 minutes

  /**
   * Start monitoring memory usage
   */
  startMonitoring(intervalMs: number = 30000): () => void {
    if (this.monitoringInterval !== null) {
      logger.warn('Memory monitoring already running');
      return () => {};
    }

// Take initial snapshot
    this.takeSnapshot();

    // Set up periodic monitoring
    this.monitoringInterval = window.setInterval(() => {
      this.takeSnapshot();
      this.analyzeSnapshots();
    }, intervalMs);

    return () => this.stopMonitoring();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
}
  }

  /**
   * Take a memory snapshot
   */
  private takeSnapshot(): void {
    const perfWithMemory = performance as PerformanceWithMemory;
    const memoryInfo = perfWithMemory.memory;

    if (!memoryInfo) {
      // memory API not available (only in Chrome)
      return;
    }

    const snapshot: MemorySnapshot = {
      timestamp: new Date(),
      heapUsed: memoryInfo.usedJSHeapSize,
      heapTotal: memoryInfo.totalJSHeapSize,
      subscriptionCount: subscriptionCleanup.getActiveCount()
    };

    this.snapshots.push(snapshot);

    // Trim old snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots);
    }
  }

  /**
   * Analyze snapshots for memory leaks
   */
  private analyzeSnapshots(): void {
    if (this.snapshots.length < 2) return;

    const latest = this.snapshots[this.snapshots.length - 1];
    const heapUsedMB = latest.heapUsed / (1024 * 1024);

    // Check absolute heap size
    if (heapUsedMB > this.HEAP_CRITICAL_MB) {
      this.addWarning({
        type: 'heap',
        severity: 'high',
        message: `Critical: Heap size exceeds ${this.HEAP_CRITICAL_MB}MB`,
        details: {
          heapUsedMB: heapUsedMB.toFixed(2),
          heapTotalMB: (latest.heapTotal / (1024 * 1024)).toFixed(2)
        },
        timestamp: new Date()
      });
    } else if (heapUsedMB > this.HEAP_WARNING_MB) {
      this.addWarning({
        type: 'heap',
        severity: 'medium',
        message: `Warning: Heap size exceeds ${this.HEAP_WARNING_MB}MB`,
        details: {
          heapUsedMB: heapUsedMB.toFixed(2),
          heapTotalMB: (latest.heapTotal / (1024 * 1024)).toFixed(2)
        },
        timestamp: new Date()
      });
    }

    // Check subscription count
    if (latest.subscriptionCount > this.SUBSCRIPTION_CRITICAL) {
      this.addWarning({
        type: 'subscriptions',
        severity: 'high',
        message: `Critical: ${latest.subscriptionCount} active subscriptions`,
        details: {
          count: latest.subscriptionCount,
          breakdown: subscriptionCleanup.generateHealthReport().byType
        },
        timestamp: new Date()
      });
    } else if (latest.subscriptionCount > this.SUBSCRIPTION_WARNING) {
      this.addWarning({
        type: 'subscriptions',
        severity: 'medium',
        message: `Warning: ${latest.subscriptionCount} active subscriptions`,
        details: {
          count: latest.subscriptionCount,
          breakdown: subscriptionCleanup.generateHealthReport().byType
        },
        timestamp: new Date()
      });
    }

    // Check heap growth rate (last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentSnapshots = this.snapshots.filter(
      s => s.timestamp.getTime() > fiveMinutesAgo
    );

    if (recentSnapshots.length >= 2) {
      const oldest = recentSnapshots[0];
      const growthRate = latest.heapUsed / oldest.heapUsed;

      if (growthRate > this.GROWTH_RATE_WARNING) {
        this.addWarning({
          type: 'heap_growth',
          severity: 'medium',
          message: `Heap growing rapidly: ${((growthRate - 1) * 100).toFixed(1)}% in 5 minutes`,
          details: {
            oldHeapMB: (oldest.heapUsed / (1024 * 1024)).toFixed(2),
            newHeapMB: heapUsedMB.toFixed(2),
            growthRate: growthRate.toFixed(2)
          },
          timestamp: new Date()
        });
      }
    }
  }

  /**
   * Add a warning
   */
  private addWarning(warning: LeakWarning): void {
    // Check if similar warning exists recently (avoid spam)
    const recentDuplicate = this.warnings
      .slice(-5)
      .find(w =>
        w.type === warning.type &&
        w.severity === warning.severity &&
        Date.now() - w.timestamp.getTime() < 60000 // Within last minute
      );

    if (recentDuplicate) {
      return; // Skip duplicate warning
    }

    this.warnings.push(warning);

    // Trim old warnings
    if (this.warnings.length > this.maxWarnings) {
      this.warnings = this.warnings.slice(-this.maxWarnings);
    }

    // Log to console
    const emoji = warning.severity === 'high' ? '🚨' : warning.severity === 'medium' ? '⚠️' : 'ℹ️';
    logger.warn(`${emoji} Memory Leak Warning: ${warning.message}`, warning.details);

    // Notify listeners
    this.notifyListeners();
  }

  /**
   * Subscribe to warnings
   */
  subscribe(listener: (warnings: LeakWarning[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.warnings]));
  }

  /**
   * Get all warnings
   */
  getWarnings(): LeakWarning[] {
    return [...this.warnings];
  }

  /**
   * Get recent warnings (last hour)
   */
  getRecentWarnings(): LeakWarning[] {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return this.warnings.filter(w => w.timestamp.getTime() > oneHourAgo);
  }

  /**
   * Clear warnings
   */
  clearWarnings(): void {
    this.warnings = [];
    this.notifyListeners();
  }

  /**
   * Get current memory stats
   */
  getCurrentStats(): {
    heapUsedMB: number;
    heapTotalMB: number;
    subscriptionCount: number;
    snapshotCount: number;
    warningCount: number;
  } | null {
    const perfWithMemory = performance as PerformanceWithMemory;
    const memoryInfo = perfWithMemory.memory;

    if (!memoryInfo) {
      return null;
    }

    const latest = this.snapshots[this.snapshots.length - 1];

    return {
      heapUsedMB: parseFloat((memoryInfo.usedJSHeapSize / (1024 * 1024)).toFixed(2)),
      heapTotalMB: parseFloat((memoryInfo.totalJSHeapSize / (1024 * 1024)).toFixed(2)),
      subscriptionCount: latest?.subscriptionCount || 0,
      snapshotCount: this.snapshots.length,
      warningCount: this.warnings.length
    };
  }

  /**
   * Generate a memory report
   */
  generateReport(): {
    currentStats: {
      heapUsedMB: number;
      heapTotalMB: number;
      subscriptionCount: number;
      snapshotCount: number;
      warningCount: number;
    } | null;
    warnings: LeakWarning[];
    snapshots: MemorySnapshot[];
    analysis: {
      avgHeapUsedMB: number;
      maxHeapUsedMB: number;
      avgSubscriptions: number;
      maxSubscriptions: number;
      heapTrend: 'stable' | 'growing' | 'declining';
    };
  } {
    const currentStats = this.getCurrentStats();

    if (this.snapshots.length === 0) {
      return {
        currentStats,
        warnings: this.warnings,
        snapshots: [],
        analysis: {
          avgHeapUsedMB: 0,
          maxHeapUsedMB: 0,
          avgSubscriptions: 0,
          maxSubscriptions: 0,
          heapTrend: 'stable'
        }
      };
    }

    const heapSizes = this.snapshots.map(s => s.heapUsed / (1024 * 1024));
    const subscriptionCounts = this.snapshots.map(s => s.subscriptionCount);

    const avgHeapUsedMB = heapSizes.reduce((a, b) => a + b, 0) / heapSizes.length;
    const maxHeapUsedMB = Math.max(...heapSizes);
    const avgSubscriptions = subscriptionCounts.reduce((a, b) => a + b, 0) / subscriptionCounts.length;
    const maxSubscriptions = Math.max(...subscriptionCounts);

    // Determine heap trend
    let heapTrend: 'stable' | 'growing' | 'declining' = 'stable';
    if (this.snapshots.length >= 10) {
      const firstHalf = heapSizes.slice(0, Math.floor(heapSizes.length / 2));
      const secondHalf = heapSizes.slice(Math.floor(heapSizes.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (secondAvg > firstAvg * 1.2) {
        heapTrend = 'growing';
      } else if (secondAvg < firstAvg * 0.8) {
        heapTrend = 'declining';
      }
    }

    return {
      currentStats,
      warnings: this.warnings,
      snapshots: this.snapshots,
      analysis: {
        avgHeapUsedMB: parseFloat(avgHeapUsedMB.toFixed(2)),
        maxHeapUsedMB: parseFloat(maxHeapUsedMB.toFixed(2)),
        avgSubscriptions: parseFloat(avgSubscriptions.toFixed(1)),
        maxSubscriptions,
        heapTrend
      }
    };
  }

  /**
   * Check if memory API is available
   */
  isSupported(): boolean {
    return !!(performance as PerformanceWithMemory).memory;
  }
}

// Export singleton instance
export const memoryLeakDetector = new MemoryLeakDetector();

// Auto-start in development mode
if (import.meta.env.DEV && memoryLeakDetector.isSupported()) {
  memoryLeakDetector.startMonitoring(30000); // Check every 30 seconds
}
