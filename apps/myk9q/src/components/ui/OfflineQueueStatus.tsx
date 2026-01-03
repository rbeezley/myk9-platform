/**
 * Offline Queue Status Component
 *
 * Shows a toast notification when syncing queued scores after coming back online.
 * Displays progress and allows user to see what's being synced.
 */

import React from 'react';
import { Cloud, CloudOff, AlertCircle, CheckCircle } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';

export const OfflineQueueStatus: React.FC = () => {
  const { mode, isOnline, isSyncing, counts } = useOfflineStatus();
  const { queue } = useOfflineQueueStore();

  // Don't show if nothing in queue
  if (queue.length === 0 && counts.failed === 0) {
    return null;
  }

  // Don't show if online, not syncing, and nothing pending/failed
  if (isOnline && !isSyncing && counts.pending === 0 && counts.failed === 0) {
    return null;
  }

  const pluralize = (count: number, word: string) =>
    `${count} ${word}${count !== 1 ? 's' : ''}`;

  return (
    <div className="offline-queue-status">
      {/* Offline with pending items */}
      {mode === 'offline' && counts.pending > 0 && (
        <div className="queue-toast queue-toast-offline">
          <CloudOff size={20} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
          <div className="queue-message">
            <strong>Offline Mode</strong>
            <span>{pluralize(counts.pending, 'score')} queued for sync</span>
          </div>
        </div>
      )}

      {/* Syncing when back online */}
      {mode === 'syncing' && (
        <div className="queue-toast queue-toast-syncing">
          <Cloud size={20} style={{ width: '20px', height: '20px', flexShrink: 0 }} className="rotating" />
          <div className="queue-message">
            <strong>Syncing Scores</strong>
            <span>Uploading {pluralize(counts.pending + counts.syncing, 'queued score')}...</span>
          </div>
        </div>
      )}

      {/* Failed items (need manual retry) */}
      {mode === 'failed' && (
        <div className="queue-toast queue-toast-error">
          <AlertCircle size={20} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
          <div className="queue-message">
            <strong>Sync Failed</strong>
            <span>{pluralize(counts.failed, 'score')} failed to sync</span>
          </div>
        </div>
      )}

      {/* Success (briefly show then auto-hide) */}
      {isOnline && !isSyncing && counts.pending === 0 && counts.failed === 0 && queue.length > 0 && (
        <div className="queue-toast queue-toast-success">
          <CheckCircle size={20} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
          <div className="queue-message">
            <strong>Sync Complete</strong>
            <span>All scores uploaded successfully</span>
          </div>
        </div>
      )}
    </div>
  );
};
