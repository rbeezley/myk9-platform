/**
 * Subscription Cleanup Service
 *
 * Centralized service for managing real-time subscription lifecycle
 * and preventing memory leaks in long-lived applications.
 *
 * This service:
 * - Tracks all active subscriptions across the app
 * - Provides cleanup on route changes
 * - Monitors subscription health
 * - Prevents duplicate subscriptions
 */

import { syncManager } from './syncManager';
import { useAnnouncementStore } from '../stores/announcementStore';
import { useNationalsStore } from '../stores/nationalsStore';
import { logger } from '@/utils/logger';

export interface SubscriptionInfo {
  key: string;
  type: 'announcement' | 'nationals' | 'entry' | 'sync' | 'other';
  createdAt: Date;
  licenseKey?: string;
  active: boolean;
}

class SubscriptionCleanupService {
  private subscriptions: Map<string, SubscriptionInfo> = new Map();
  private cleanupHistory: Array<{ timestamp: Date; count: number; route?: string }> = [];
  private maxHistorySize = 50;

  /**
   * Register a subscription for tracking
   */
  register(key: string, type: SubscriptionInfo['type'], licenseKey?: string): void {
    const info: SubscriptionInfo = {
      key,
      type,
      createdAt: new Date(),
      licenseKey,
      active: true
    };

    if (this.subscriptions.has(key)) {
      logger.warn(`⚠️ Subscription ${key} already registered - possible duplicate!`);
    }

    this.subscriptions.set(key, info);
}

  /**
   * Unregister a subscription
   */
  unregister(key: string): void {
    const info = this.subscriptions.get(key);
    if (info) {
      info.active = false;
      this.subscriptions.delete(key);
}
  }

  /**
   * Clean up subscriptions for a specific license key
   */
  cleanupByLicenseKey(licenseKey: string): number {
    let count = 0;

    this.subscriptions.forEach((info, key) => {
      if (info.licenseKey === licenseKey && info.active) {
        this.unregister(key);
        count++;
      }
    });

    return count;
  }

  /**
   * Clean up all subscriptions
   */
  cleanupAll(): number {
    const count = this.subscriptions.size;

    // Clean up syncManager subscriptions
    syncManager.unsubscribeAll();

    // Clean up announcement store subscriptions
    const announcementStore = useAnnouncementStore.getState();
    if (announcementStore.realtimeChannel) {
      announcementStore.disableRealtime();
    }

    // Clean up nationals store subscriptions
    const nationalsStore = useNationalsStore.getState();
    if (nationalsStore.realtimeChannel) {
      nationalsStore.disableRealtime();
    }

    // Clear tracking
    this.subscriptions.clear();

// Record in history
    this.recordCleanup(count);

    return count;
  }

  /**
   * Clean up subscriptions on route change
   */
  cleanupOnRouteChange(fromRoute: string, toRoute: string): number {
// Don't cleanup if navigating within the same context
    // (e.g., different entries in same class)
    if (this.isSameContext(fromRoute, toRoute)) {
return 0;
    }

    // Cleanup stale subscriptions
    const count = this.cleanupStaleSubscriptions();

    // Record in history
    this.recordCleanup(count, toRoute);

    return count;
  }

  /**
   * Check if two routes are in the same context
   */
  private isSameContext(fromRoute: string, toRoute: string): boolean {
    // Extract base routes (without IDs)
    const getBaseRoute = (route: string) => {
      return route.split('/').slice(0, 3).join('/');
    };

    return getBaseRoute(fromRoute) === getBaseRoute(toRoute);
  }

  /**
   * Clean up subscriptions that are older than threshold
   */
  private cleanupStaleSubscriptions(maxAgeMinutes: number = 30): number {
    const now = new Date();
    const maxAge = maxAgeMinutes * 60 * 1000;
    let count = 0;

    this.subscriptions.forEach((info, key) => {
      const age = now.getTime() - info.createdAt.getTime();
      if (age > maxAge && info.active) {
        logger.warn(`⏰ Stale subscription detected: ${key} (${Math.round(age / 60000)} minutes old)`);
        this.unregister(key);
        count++;
      }
    });

    return count;
  }

  /**
   * Get current subscription count
   */
  getActiveCount(): number {
    return Array.from(this.subscriptions.values()).filter(s => s.active).length;
  }

  /**
   * Get subscriptions by type
   */
  getByType(type: SubscriptionInfo['type']): SubscriptionInfo[] {
    return Array.from(this.subscriptions.values()).filter(s => s.type === type && s.active);
  }

  /**
   * Get all active subscriptions
   */
  getAll(): SubscriptionInfo[] {
    return Array.from(this.subscriptions.values()).filter(s => s.active);
  }

  /**
   * Get cleanup history
   */
  getHistory(): Array<{ timestamp: Date; count: number; route?: string }> {
    return [...this.cleanupHistory];
  }

  /**
   * Record a cleanup event
   */
  private recordCleanup(count: number, route?: string): void {
    this.cleanupHistory.push({
      timestamp: new Date(),
      count,
      route
    });

    // Trim history if too large
    if (this.cleanupHistory.length > this.maxHistorySize) {
      this.cleanupHistory = this.cleanupHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Check for subscription leaks
   */
  checkForLeaks(): {
    hasLeaks: boolean;
    count: number;
    oldestAge: number;
    details: SubscriptionInfo[];
  } {
    const now = new Date();
    const activeSubscriptions = this.getAll();
    const leakThreshold = 10; // More than 10 active subscriptions is suspicious
    const ageThreshold = 60 * 60 * 1000; // 1 hour

    const oldSubscriptions = activeSubscriptions.filter(s => {
      const age = now.getTime() - s.createdAt.getTime();
      return age > ageThreshold;
    });

    const hasLeaks = activeSubscriptions.length > leakThreshold || oldSubscriptions.length > 5;
    const oldestAge = oldSubscriptions.length > 0
      ? Math.max(...oldSubscriptions.map(s => now.getTime() - s.createdAt.getTime()))
      : 0;

    if (hasLeaks) {
      logger.warn(`🚨 Potential subscription leaks detected!`);
      logger.warn(`   Active subscriptions: ${activeSubscriptions.length}`);
      logger.warn(`   Old subscriptions: ${oldSubscriptions.length}`);
      logger.warn(`   Oldest age: ${Math.round(oldestAge / 60000)} minutes`);
    }

    return {
      hasLeaks,
      count: activeSubscriptions.length,
      oldestAge: Math.round(oldestAge / 60000),
      details: hasLeaks ? activeSubscriptions : []
    };
  }

  /**
   * Generate a health report
   */
  generateHealthReport(): {
    activeCount: number;
    byType: Record<string, number>;
    oldestSubscription: { key: string; ageMinutes: number } | null;
    recentCleanups: number;
    averageCleanupSize: number;
  } {
    const active = this.getAll();
    const now = new Date();

    // Count by type
    const byType: Record<string, number> = {};
    active.forEach(s => {
      byType[s.type] = (byType[s.type] || 0) + 1;
    });

    // Find oldest
    let oldestSubscription = null;
    if (active.length > 0) {
      const oldest = active.reduce((oldest, current) =>
        current.createdAt < oldest.createdAt ? current : oldest
      );
      const ageMinutes = Math.round((now.getTime() - oldest.createdAt.getTime()) / 60000);
      oldestSubscription = { key: oldest.key, ageMinutes };
    }

    // Recent cleanup stats
    const recentCleanups = this.cleanupHistory.filter(h =>
      now.getTime() - h.timestamp.getTime() < 60 * 60 * 1000 // Last hour
    ).length;

    const averageCleanupSize = this.cleanupHistory.length > 0
      ? Math.round(this.cleanupHistory.reduce((sum, h) => sum + h.count, 0) / this.cleanupHistory.length)
      : 0;

    return {
      activeCount: active.length,
      byType,
      oldestSubscription,
      recentCleanups,
      averageCleanupSize
    };
  }

  /**
   * Auto-cleanup timer (runs periodically)
   */
  startAutoCleanup(intervalMinutes: number = 30): () => void {
const interval = setInterval(() => {
      this.cleanupStaleSubscriptions(intervalMinutes);

      // Check for leaks
      const leakCheck = this.checkForLeaks();
      if (leakCheck.hasLeaks) {
        logger.error('🚨 Memory leak warning: Too many active subscriptions');
        logger.error('Consider cleaning up subscriptions manually');
      }
    }, intervalMinutes * 60 * 1000);

    return () => {
clearInterval(interval);
    };
  }
}

// Export singleton instance
export const subscriptionCleanup = new SubscriptionCleanupService();
