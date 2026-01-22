/**
 * SubscriptionMonitor UI Components
 *
 * Extracted from SubscriptionMonitor.tsx to reduce complexity.
 * Contains stat cards, subscription items, and history components.
 */

import React from 'react';
import { AlertTriangle, CheckCircle, Database, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { subscriptionCleanup, SubscriptionInfo } from '../../services/subscriptionCleanup';
import {
  calculateAgeMinutes,
  isSubscriptionOld,
  isActiveCountWarning,
  isOldestAgeWarning,
  isHeapWarning,
  formatLicenseKey
} from './subscriptionMonitorHelpers';
import { styles, getSubTypeStyle } from './subscriptionMonitorStyles';

// ============================================================================
// Types
// ============================================================================

interface HealthReport {
  activeCount: number;
  byType: Record<string, number>;
  oldestSubscription: { key: string; ageMinutes: number } | null;
  recentCleanups: number;
  averageCleanupSize: number;
}

interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  subscriptionCount: number;
  snapshotCount: number;
  warningCount: number;
}

interface LeakCheckResult {
  hasLeaks: boolean;
  count: number;
  oldestAge: number;
  details: SubscriptionInfo[];
}

// ============================================================================
// Stat Card Components
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  warning?: boolean;
  icon?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, sublabel, warning, icon }) => (
  <div className={styles.statCard}>
    <div className={styles.statLabel}>
      {icon}
      {label}
    </div>
    <div className={cn(styles.statValue, warning && styles.statValueWarning)}>
      {value}
    </div>
    {sublabel && <div className={styles.statSublabel}>{sublabel}</div>}
  </div>
);

// ============================================================================
// Health Summary
// ============================================================================

interface HealthSummaryProps {
  healthReport: HealthReport | null;
  memoryStats: MemoryStats | null;
}

export const HealthSummary: React.FC<HealthSummaryProps> = ({ healthReport, memoryStats }) => (
  <div className={styles.healthSummary}>
    <StatCard
      label="Active Subscriptions"
      value={healthReport?.activeCount || 0}
      warning={isActiveCountWarning(healthReport?.activeCount ?? 0)}
    />

    {healthReport?.oldestSubscription && (
      <StatCard
        label="Oldest Subscription"
        value={`${healthReport.oldestSubscription.ageMinutes}m`}
        sublabel={healthReport.oldestSubscription.key}
        warning={isOldestAgeWarning(healthReport.oldestSubscription.ageMinutes)}
      />
    )}

    <StatCard
      label="Recent Cleanups"
      value={healthReport?.recentCleanups || 0}
      sublabel="Last hour"
    />

    <StatCard
      label="Avg Cleanup Size"
      value={healthReport?.averageCleanupSize || 0}
    />

    {memoryStats && (
      <StatCard
        label="Heap Used"
        value={`${memoryStats.heapUsedMB}MB`}
        sublabel={`/ ${memoryStats.heapTotalMB}MB total`}
        warning={isHeapWarning(memoryStats.heapUsedMB)}
        icon={<Database size={12} style={{ display: 'inline', marginRight: '4px' }} />}
      />
    )}
  </div>
);

// ============================================================================
// Leak Alert
// ============================================================================

interface LeakAlertProps {
  leakCheck: LeakCheckResult | null;
}

export const LeakAlert: React.FC<LeakAlertProps> = ({ leakCheck }) => {
  if (!leakCheck?.hasLeaks) return null;

  return (
    <div className={styles.leakAlert}>
      <AlertTriangle size={20} />
      <div className={styles.leakDetails}>
        <strong className={styles.leakDetailsStrong}>Potential Memory Leak Detected</strong>
        <p className={styles.leakDetailsP}>
          {leakCheck.count} active subscriptions detected.
          Oldest subscription is {leakCheck.oldestAge} minutes old.
        </p>
      </div>
    </div>
  );
};

// ============================================================================
// Type Breakdown
// ============================================================================

interface TypeBreakdownProps {
  byType: Record<string, number> | undefined;
}

export const TypeBreakdown: React.FC<TypeBreakdownProps> = ({ byType }) => (
  <div className={styles.typeBreakdown}>
    <h4 className={styles.typeBreakdownTitle}>By Type</h4>
    <div className={styles.typeGrid}>
      {Object.entries(byType || {}).map(([type, count]) => (
        <div key={type} className={styles.typeItem}>
          <span className={styles.typeName}>{type}</span>
          <span className={styles.typeCount}>{count as number}</span>
        </div>
      ))}
    </div>
  </div>
);

// ============================================================================
// Subscription Item
// ============================================================================

interface SubscriptionItemProps {
  sub: SubscriptionInfo;
  now: number;
  onRemove: () => void;
}

export const SubscriptionItem: React.FC<SubscriptionItemProps> = ({ sub, now, onRemove }) => {
  const ageMinutes = calculateAgeMinutes(sub.createdAt, now);
  const isOld = isSubscriptionOld(ageMinutes);
  const displayLicenseKey = formatLicenseKey(sub.licenseKey);

  return (
    <div className={cn(styles.subscriptionItem, isOld && styles.subscriptionItemOld)}>
      <div className={styles.subInfo}>
        <div className={styles.subKey}>{sub.key}</div>
        <div className={styles.subMeta}>
          <span className={getSubTypeStyle(sub.type)}>{sub.type}</span>
          {displayLicenseKey && (
            <span className={styles.subLicense}>{displayLicenseKey}</span>
          )}
          <span className={cn(styles.subAge, isOld && styles.subAgeWarning)}>
            {ageMinutes}m old
          </span>
        </div>
      </div>
      <button
        className={styles.subRemove}
        onClick={onRemove}
        title="Remove subscription"
      >
        <X size={16} />
      </button>
    </div>
  );
};

// ============================================================================
// Subscriptions List
// ============================================================================

interface SubscriptionsListProps {
  subscriptions: SubscriptionInfo[];
  now: number;
  onRefresh: () => void;
}

export const SubscriptionsList: React.FC<SubscriptionsListProps> = ({
  subscriptions,
  now,
  onRefresh
}) => (
  <div className={styles.subscriptionsList}>
    <h4 className={styles.subscriptionsListTitle}>Active Subscriptions ({subscriptions.length})</h4>
    {subscriptions.length === 0 ? (
      <div className={styles.emptyState}>
        <CheckCircle size={32} className={styles.emptyStateIcon} />
        <p className={styles.emptyStateText}>No active subscriptions</p>
      </div>
    ) : (
      <div className={styles.subscriptionItems}>
        {subscriptions.map(sub => (
          <SubscriptionItem
            key={sub.key}
            sub={sub}
            now={now}
            onRemove={() => {
              subscriptionCleanup.unregister(sub.key);
              onRefresh();
            }}
          />
        ))}
      </div>
    )}
  </div>
);

// ============================================================================
// Cleanup History
// ============================================================================

interface CleanupHistoryItem {
  timestamp: Date;
  count: number;
  route?: string;
}

export const CleanupHistory: React.FC = () => {
  const history = subscriptionCleanup.getHistory() as CleanupHistoryItem[];

  return (
    <div className={styles.cleanupHistory}>
      <h4 className={styles.cleanupHistoryTitle}>Recent Cleanups</h4>
      <div className={styles.historyItems}>
        {history.slice(-10).reverse().map((h, i) => (
          <div key={i} className={styles.historyItem}>
            <span className={styles.historyTime}>
              {h.timestamp.toLocaleTimeString()}
            </span>
            <span className={styles.historyCount}>{h.count} subscriptions</span>
            {h.route && <span className={styles.historyRoute}>{h.route}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};
