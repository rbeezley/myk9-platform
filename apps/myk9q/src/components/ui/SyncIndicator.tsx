import React from 'react';
import { Cloud as _Cloud, CloudOff, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SyncIndicatorProps {
  /** Current sync status */
  status: 'synced' | 'syncing' | 'offline' | 'error';
  /** Number of pending actions */
  pendingCount?: number;
  /** Error message if status is 'error' */
  errorMessage?: string;
  /** Show retry button on error */
  onRetry?: () => void;
  /** Compact mode (icon only) */
  compact?: boolean;
}

const statusStyles = {
  synced: 'text-[var(--success)]',
  syncing: 'text-[var(--primary)]',
  offline: 'text-[var(--warning)]',
  error: 'text-[var(--error-red)]',
} as const;

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({
  status,
  pendingCount = 0,
  errorMessage,
  onRetry,
  compact = false,
}) => {
  const getIcon = () => {
    const iconClass = 'w-4 h-4 flex-shrink-0';
    switch (status) {
      case 'synced':
        return <CheckCircle className={iconClass} />;
      case 'syncing':
        return <RefreshCw className={cn(iconClass, 'animate-spin')} />;
      case 'offline':
        return <CloudOff className={iconClass} />;
      case 'error':
        return <AlertCircle className={iconClass} />;
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'synced':
        return 'Synced';
      case 'syncing':
        return pendingCount > 0 ? `Syncing (${pendingCount})` : 'Syncing...';
      case 'offline':
        return pendingCount > 0 ? `Offline (${pendingCount} pending)` : 'Offline';
      case 'error':
        return 'Sync failed';
    }
  };

  if (compact) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center',
          'w-8 h-8 rounded-full',
          statusStyles[status]
        )}
        title={getLabel()}
      >
        {getIcon()}
        {pendingCount > 0 && (
          <span
            className={cn(
              'absolute -top-1 -right-1',
              'min-w-4 h-4 px-1',
              'bg-[var(--primary)] text-white',
              'text-[10px] font-bold rounded-full',
              'flex items-center justify-center'
            )}
          >
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        'px-3 py-1.5 rounded-lg',
        'text-sm',
        statusStyles[status],
        status === 'error' && 'bg-[var(--error-red)]/10'
      )}
    >
      {getIcon()}
      <span className="font-medium">{getLabel()}</span>
      {pendingCount > 0 && (
        <span
          className={cn(
            'px-1.5 py-0.5 rounded-full',
            'bg-[var(--muted)] text-xs font-medium'
          )}
        >
          {pendingCount}
        </span>
      )}
      {status === 'error' && onRetry && (
        <button
          className={cn(
            'ml-2 px-2 py-1 rounded',
            'bg-[var(--error-red)]/20 text-[var(--error-red)]',
            'text-xs font-medium',
            'hover:bg-[var(--error-red)]/30 transition-colors'
          )}
          onClick={onRetry}
          title="Retry sync"
        >
          Retry
        </button>
      )}
      {status === 'error' && errorMessage && (
        <div
          className={cn(
            'absolute top-full left-0 mt-1',
            'px-2 py-1 rounded',
            'bg-[var(--card)] border border-[var(--border)]',
            'text-xs text-[var(--muted-foreground)]',
            'shadow-lg z-10'
          )}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
};

/**
 * Global sync indicator for header/navigation
 */
export const GlobalSyncIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null; // Only show when offline
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5',
        'px-2 py-1 rounded',
        'bg-[var(--warning)]/10 text-[var(--warning)]',
        'text-xs font-medium'
      )}
    >
      <CloudOff className="w-3.5 h-3.5 flex-shrink-0" />
      <span>Offline Mode</span>
    </div>
  );
};
