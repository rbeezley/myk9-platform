/**
 * OfflineIndicator Component - Migrated to Tailwind CSS
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
import { cn } from '../../lib/utils';

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
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'px-4 py-3',
        'bg-[var(--error-red)] text-white',
        'shadow-lg'
      )}
    >
      <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm">
            <strong className="font-semibold">Sync Failed</strong>
            <span className="ml-2 opacity-90">
              {formatScoreCount(counts.failed)} failed to sync
              {showConnectionHint && ` - ${connection.type} may be too slow`}
            </span>
          </div>
        </div>
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className={cn(
            'inline-flex items-center gap-1.5',
            'px-3 py-1.5 rounded-md',
            'bg-white/20 border border-white/30',
            'text-white text-sm font-medium',
            'cursor-pointer',
            'transition-all duration-200',
            'hover:bg-white/30',
            'disabled:opacity-70 disabled:cursor-not-allowed'
          )}
          aria-label="Retry failed sync"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRetrying && 'animate-spin')} />
          {isRetrying ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    </div>
  );
}
