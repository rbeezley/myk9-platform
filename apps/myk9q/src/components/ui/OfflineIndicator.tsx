/**
 * Offline Indicator Component (Banner Version)
 *
 * Shows a persistent banner ONLY for failed sync states.
 * Other states (offline, pending, syncing) are handled by the
 * CompactOfflineIndicator component in page headers.
 *
 * This banner provides:
 * - High visibility for critical sync failures
 * - Retry functionality (via the banner)
 * - Connection quality hints
 */

import { useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import './shared-ui.css';

/**
 * Format count text (singular/plural)
 */
function formatScoreCount(count: number): string {
  return `${count} ${count === 1 ? 'score' : 'scores'}`;
}

/**
 * OfflineIndicator - Shows banner ONLY for failed sync states
 *
 * Other states (offline, pending, syncing, online) are now handled
 * by the CompactOfflineIndicator component in page headers.
 */
export function OfflineIndicator() {
  const [isRetrying, setIsRetrying] = useState(false);
  const { mode, counts, connection, retryFailed } = useOfflineStatus();

  // Handle retry button click
  const handleRetry = () => {
    setIsRetrying(true);
    retryFailed();
    // Reset after a short delay since retryFailed is synchronous
    setTimeout(() => setIsRetrying(false), 1000);
  };

  // Only render for failed states - other states handled by CompactOfflineIndicator
  if (mode !== 'failed' || counts.failed === 0) {
    return null;
  }

  const showConnectionHint = connection.quality === 'slow' && connection.type;

  return (
    <div className="offline-indicator failed-mode">
      <div className="offline-indicator-content">
        <AlertCircle
          className="offline-icon"
          size={20}
          style={{ width: '20px', height: '20px', flexShrink: 0 }}
        />
        <div className="offline-text">
          <strong>Sync Failed</strong>
          <span className="offline-count">
            {formatScoreCount(counts.failed)} failed to sync
            {showConnectionHint && ` - ${connection.type} may be too slow`}
          </span>
        </div>
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="offline-retry-btn"
          aria-label="Retry failed sync"
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'inherit',
            cursor: isRetrying ? 'not-allowed' : 'pointer',
            padding: '6px 12px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 500,
            opacity: isRetrying ? 0.7 : 1,
            transition: 'all 0.2s',
          }}
        >
          <RefreshCw
            size={14}
            style={{
              animation: isRetrying ? 'spin 1s linear infinite' : 'none',
            }}
          />
          {isRetrying ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    </div>
  );
}
