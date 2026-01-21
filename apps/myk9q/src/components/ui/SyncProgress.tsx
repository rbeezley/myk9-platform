/**
 * Sync Progress Component
 *
 * Displays detailed sync progress in a toast/snackbar style component.
 * Shows individual score sync status, retry attempts, and errors.
 */

import { useState } from 'react';
import { X, CheckCircle, XCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import { cn } from '../../lib/utils';

/** Position styles for the toast */
const positionStyles = {
  'top-right': 'top-20 right-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-left': 'top-20 left-4',
} as const;

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
    <div className={cn(
      "fixed z-[var(--token-z-toast)] min-w-[320px] max-w-[400px]",
      "bg-white dark:bg-[var(--card)] rounded-xl overflow-hidden",
      "shadow-[0_4px_24px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]",
      "animate-slide-in-bottom",
      positionStyles[position]
    )}>
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 font-semibold text-sm text-[var(--foreground)]">
          {isSyncing || syncingCount > 0 ? (
            <>
              <RefreshCw className="shrink-0 text-[var(--primary)] animate-spin" size={18} />
              <span>Syncing...</span>
            </>
          ) : failedCount > 0 ? (
            <>
              <XCircle className="shrink-0 text-[var(--token-error)]" size={18} />
              <span>Sync Failed</span>
            </>
          ) : pendingCount > 0 ? (
            <>
              <AlertCircle className="shrink-0 text-[var(--status-conflict)]" size={18} />
              <span>Pending Sync</span>
            </>
          ) : (
            <>
              <CheckCircle className="shrink-0 text-[var(--token-success)]" size={18} />
              <span>Synced</span>
            </>
          )}
        </div>
        <button
          className={cn(
            "bg-transparent border-none p-1 cursor-pointer",
            "text-[var(--muted-foreground)] rounded transition-all duration-150",
            "hover:bg-[var(--input)] hover:text-[var(--foreground)]"
          )}
          onClick={() => setIsManuallyHidden(true)}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Summary */}
        <div className="flex gap-4">
          {syncingCount > 0 && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl font-bold leading-none text-[var(--primary)]">{syncingCount}</span>
              <span className="text-[11px] uppercase tracking-wide font-semibold opacity-80">Syncing</span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl font-bold leading-none text-[var(--status-conflict)]">{pendingCount}</span>
              <span className="text-[11px] uppercase tracking-wide font-semibold opacity-80">Pending</span>
            </div>
          )}
          {failedCount > 0 && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl font-bold leading-none text-[var(--token-error)]">{failedCount}</span>
              <span className="text-[11px] uppercase tracking-wide font-semibold opacity-80">Failed</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="w-full h-1 bg-[var(--border)] rounded-sm overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--status-checked-in)] to-teal-500 rounded-sm transition-[width] duration-300 ease-out"
              style={{
                width: `${((totalCount - pendingCount - syncingCount) / totalCount) * 100}%`
              }}
            />
          </div>
        )}

        {/* Detailed list */}
        {showDetailed && (syncingItems.length > 0 || failedItems.length > 0) && (
          <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
            {syncingItems.slice(0, 3).map(item => (
              <div key={item.id} className="flex items-start gap-2 text-xs text-[var(--primary)]">
                <RefreshCw className="shrink-0 animate-spin" size={14} />
                <span>
                  #{item.armband} - {item.className}
                  {item.retryCount > 0 && ` (Retry ${item.retryCount})`}
                </span>
              </div>
            ))}
            {failedItems.slice(0, 3).map(item => (
              <div key={item.id} className="flex items-start gap-2 text-xs text-[var(--token-error)]">
                <XCircle className="shrink-0" size={14} />
                <span>
                  #{item.armband} - {item.className}
                  {item.lastError && (
                    <small className="block mt-1 text-[var(--muted-foreground)] truncate max-w-[200px]">
                      {item.lastError}
                    </small>
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
