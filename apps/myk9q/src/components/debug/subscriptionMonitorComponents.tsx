/**
 * SubscriptionMonitor UI Components
 *
 * Extracted from SubscriptionMonitor.tsx to reduce complexity.
 * Contains stat cards, subscription items, and history components.
 */

import React from 'react';
import { AlertTriangle, CheckCircle, Database, X } from 'lucide-react';
import { subscriptionCleanup, SubscriptionInfo } from '../../services/subscriptionCleanup';
import {
  calculateAgeMinutes,
  isSubscriptionOld,
  isActiveCountWarning,
  isOldestAgeWarning,
  isHeapWarning,
  formatLicenseKey
} from './subscriptionMonitorHelpers';

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
  <div className="stat-card">
    <div className="stat-label">
      {icon}
      {label}
    </div>
    <div className={`stat-value ${warning ? 'warning' : ''}`}>
      {value}
    </div>
    {sublabel && <div className="stat-sublabel">{sublabel}</div>}
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
  <div className="health-summary">
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
    <div className="leak-alert">
      <AlertTriangle size={20} />
      <div className="leak-details">
        <strong>Potential Memory Leak Detected</strong>
        <p>
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
  <div className="type-breakdown">
    <h4>By Type</h4>
    <div className="type-grid">
      {Object.entries(byType || {}).map(([type, count]) => (
        <div key={type} className="type-item">
          <span className="type-name">{type}</span>
          <span className="type-count">{count as number}</span>
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
    <div className={`subscription-item ${isOld ? 'old' : ''}`}>
      <div className="sub-info">
        <div className="sub-key">{sub.key}</div>
        <div className="sub-meta">
          <span className={`sub-type type-${sub.type}`}>{sub.type}</span>
          {displayLicenseKey && (
            <span className="sub-license">{displayLicenseKey}</span>
          )}
          <span className={`sub-age ${isOld ? 'warning' : ''}`}>
            {ageMinutes}m old
          </span>
        </div>
      </div>
      <button
        className="sub-remove"
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
  <div className="subscriptions-list">
    <h4>Active Subscriptions ({subscriptions.length})</h4>
    {subscriptions.length === 0 ? (
      <div className="empty-state">
        <CheckCircle size={32} />
        <p>No active subscriptions</p>
      </div>
    ) : (
      <div className="subscription-items">
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
    <div className="cleanup-history">
      <h4>Recent Cleanups</h4>
      <div className="history-items">
        {history.slice(-10).reverse().map((h, i) => (
          <div key={i} className="history-item">
            <span className="history-time">
              {h.timestamp.toLocaleTimeString()}
            </span>
            <span className="history-count">{h.count} subscriptions</span>
            {h.route && <span className="history-route">{h.route}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};
