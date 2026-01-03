/**
 * Sync Progress Component
 *
 * Displays detailed sync progress in a toast/snackbar style component.
 * Shows individual score sync status, retry attempts, and errors.
 */

import { useState } from 'react';
import { X, CheckCircle, XCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import './shared-ui.css';

interface SyncProgressProps {
  /** Whether to show the detailed progress */
  showDetailed?: boolean;
  /** Position of the toast */
  position?: 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left';
}

export function SyncProgress({
  showDetailed = false,
  position = 'bottom-right'
}: SyncProgressProps) {
  const { queue, isSyncing, failedItems } = useOfflineQueueStore();
  const [isManuallyHidden, setIsManuallyHidden] = useState(false);

  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const syncingCount = queue.filter(q => q.status === 'syncing').length;
  const failedCount = failedItems.length;
  const totalCount = pendingCount + syncingCount + failedCount;

  // Determine visibility based on activity
  const hasActivity = isSyncing || syncingCount > 0 || failedCount > 0 || pendingCount > 0;
  const isVisible = hasActivity && !isManuallyHidden;

  if (!isVisible) return null;

  const syncingItems = queue.filter(q => q.status === 'syncing');

  return (
    <div className={`sync-progress sync-progress-${position}`}>
      <div className="sync-progress-header">
        <div className="sync-progress-title">
          {isSyncing || syncingCount > 0 ? (
            <>
              <RefreshCw className="sync-progress-icon syncing" size={18}  style={{ width: '18px', height: '18px', flexShrink: 0 }} />
              <span>Syncing...</span>
            </>
          ) : failedCount > 0 ? (
            <>
              <XCircle className="sync-progress-icon failed" size={18}  style={{ width: '18px', height: '18px', flexShrink: 0 }} />
              <span>Sync Failed</span>
            </>
          ) : pendingCount > 0 ? (
            <>
              <AlertCircle className="sync-progress-icon pending" size={18}  style={{ width: '18px', height: '18px', flexShrink: 0 }} />
              <span>Pending Sync</span>
            </>
          ) : (
            <>
              <CheckCircle className="sync-progress-icon success" size={18}  style={{ width: '18px', height: '18px', flexShrink: 0 }} />
              <span>Synced</span>
            </>
          )}
        </div>
        <button
          className="sync-progress-close"
          onClick={() => setIsManuallyHidden(true)}
          aria-label="Close"
        >
          <X size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
        </button>
      </div>

      <div className="sync-progress-body">
        {/* Summary */}
        <div className="sync-progress-summary">
          {syncingCount > 0 && (
            <div className="sync-progress-stat syncing">
              <span className="sync-progress-stat-value">{syncingCount}</span>
              <span className="sync-progress-stat-label">Syncing</span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className="sync-progress-stat pending">
              <span className="sync-progress-stat-value">{pendingCount}</span>
              <span className="sync-progress-stat-label">Pending</span>
            </div>
          )}
          {failedCount > 0 && (
            <div className="sync-progress-stat failed">
              <span className="sync-progress-stat-value">{failedCount}</span>
              <span className="sync-progress-stat-label">Failed</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="sync-progress-bar">
            <div
              className="sync-progress-bar-fill"
              style={{
                width: `${((totalCount - pendingCount - syncingCount) / totalCount) * 100}%`
              }}
            />
          </div>
        )}

        {/* Detailed list */}
        {showDetailed && (syncingItems.length > 0 || failedItems.length > 0) && (
          <div className="sync-progress-list">
            {syncingItems.slice(0, 3).map(item => (
              <div key={item.id} className="sync-progress-item syncing">
                <RefreshCw size={14} className="syncing"  style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                <span>
                  #{item.armband} - {item.className}
                  {item.retryCount > 0 && ` (Retry ${item.retryCount})`}
                </span>
              </div>
            ))}
            {failedItems.slice(0, 3).map(item => (
              <div key={item.id} className="sync-progress-item failed">
                <XCircle size={14}  style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                <span>
                  #{item.armband} - {item.className}
                  {item.lastError && (
                    <small className="sync-progress-error">{item.lastError}</small>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
