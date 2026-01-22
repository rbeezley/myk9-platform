/**
 * Subscription Monitor Component
 *
 * Developer tool for monitoring real-time subscription health and detecting memory leaks.
 * Only visible in development mode.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { subscriptionCleanup, SubscriptionInfo } from '../../services/subscriptionCleanup';
import { memoryLeakDetector } from '../../utils/memoryLeakDetector';
import { Activity, AlertTriangle, RefreshCw, Trash2, X } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import {
  cleanupAllSubscriptions,
  cleanupStaleSubscriptions,
} from './subscriptionMonitorHelpers';
import {
  HealthSummary,
  LeakAlert,
  TypeBreakdown,
  SubscriptionsList,
  CleanupHistory
} from './subscriptionMonitorComponents';
import { styles } from './subscriptionMonitorStyles';

/** Health report returned by subscriptionCleanup.generateHealthReport() */
interface HealthReport {
  activeCount: number;
  byType: Record<string, number>;
  oldestSubscription: { key: string; ageMinutes: number } | null;
  recentCleanups: number;
  averageCleanupSize: number;
}

/** Leak check result returned by subscriptionCleanup.checkForLeaks() */
interface LeakCheckResult {
  hasLeaks: boolean;
  count: number;
  oldestAge: number;
  details: SubscriptionInfo[];
}

/** Memory stats returned by memoryLeakDetector.getCurrentStats() */
interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  subscriptionCount: number;
  snapshotCount: number;
  warningCount: number;
}

export const SubscriptionMonitor: React.FC = () => {
  const { settings } = useSettingsStore();
  const [isOpen, setIsOpen] = useState(false);
  const [subscriptions, setSubscriptions] = useState<SubscriptionInfo[]>([]);
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [leakCheck, setLeakCheck] = useState<LeakCheckResult | null>(null);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Refresh data
  const refreshData = () => {
    setSubscriptions(subscriptionCleanup.getAll());
    setHealthReport(subscriptionCleanup.generateHealthReport());
    setLeakCheck(subscriptionCleanup.checkForLeaks());
    setMemoryStats(memoryLeakDetector.getCurrentStats());
  };

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (autoRefresh) {
      refreshData();
      const interval = setInterval(refreshData, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Manual refresh
  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen]);

  // Compute current time once per render for age calculations
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), [subscriptions]);

  // Only show in development AND when developer mode is enabled - check AFTER all hooks
  if (import.meta.env.PROD || !settings.developerMode) {
    return null;
  }

  const handleCleanupAll = () => {
    const count = cleanupAllSubscriptions();
    alert(`Cleaned up ${count} subscriptions`);
    refreshData();
  };

  const handleCleanupStale = () => {
    const count = cleanupStaleSubscriptions(subscriptions, 5);
    alert(`Cleaned up ${count} stale subscriptions (>5 minutes old)`);
    refreshData();
  };

  if (!isOpen) {
    return (
      <button
        className={styles.toggle}
        onClick={() => setIsOpen(true)}
        title="Subscription Monitor"
      >
        <Activity size={20} />
        {leakCheck?.hasLeaks && (
          <span className={styles.leakIndicator}>!</span>
        )}
        <span className={styles.countBadge}>{healthReport?.activeCount || 0}</span>
      </button>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Activity size={20} />
          <h3 className={styles.headerTitle}>Subscription Monitor</h3>
          {leakCheck?.hasLeaks && (
            <span className={styles.leakWarning}>
              <AlertTriangle size={16} />
              LEAK DETECTED
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          <button
            className={cn(styles.refreshBtn, autoRefresh && styles.refreshBtnActive)}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
          >
            <RefreshCw size={16} className={autoRefresh ? styles.spinning : ''} />
          </button>
          <button
            className={styles.actionBtn}
            onClick={handleCleanupStale}
            title="Cleanup stale subscriptions"
          >
            <Trash2 size={16} />
            Cleanup Stale
          </button>
          <button
            className={cn(styles.actionBtn, styles.actionBtnDanger)}
            onClick={handleCleanupAll}
            title="Cleanup all subscriptions"
          >
            <Trash2 size={16} />
            Cleanup All
          </button>
          <button
            className={styles.closeBtn}
            onClick={() => setIsOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {/* Health Summary - Extracted Component */}
        <HealthSummary healthReport={healthReport} memoryStats={memoryStats} />

        {/* Leak Detection - Extracted Component */}
        <LeakAlert leakCheck={leakCheck} />

        {/* By Type - Extracted Component */}
        <TypeBreakdown byType={healthReport?.byType} />

        {/* Active Subscriptions List - Extracted Component */}
        <SubscriptionsList
          subscriptions={subscriptions}
          now={now}
          onRefresh={refreshData}
        />

        {/* Cleanup History - Extracted Component */}
        <CleanupHistory />
      </div>
    </div>
  );
};
