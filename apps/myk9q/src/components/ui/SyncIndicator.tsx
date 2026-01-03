import React from 'react';
import { Cloud as _Cloud, CloudOff, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import './shared-ui.css';

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

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({
  status,
  pendingCount = 0,
  errorMessage,
  onRetry,
  compact = false,
}) => {
  const getIcon = () => {
    switch (status) {
      case 'synced':
        return <CheckCircle className="sync-icon" size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />;
      case 'syncing':
        return <RefreshCw className="sync-icon spinning" size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />;
      case 'offline':
        return <CloudOff className="sync-icon" size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />;
      case 'error':
        return <AlertCircle className="sync-icon" size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />;
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

  const getClassName = () => {
    return `sync-indicator sync-indicator-${status} ${compact ? 'compact' : ''}`;
  };

  if (compact) {
    return (
      <div className={getClassName()} title={getLabel()}>
        {getIcon()}
        {pendingCount > 0 && (
          <span className="sync-badge">{pendingCount}</span>
        )}
      </div>
    );
  }

  return (
    <div className={getClassName()}>
      {getIcon()}
      <span className="sync-label">{getLabel()}</span>
      {pendingCount > 0 && (
        <span className="sync-count">{pendingCount}</span>
      )}
      {status === 'error' && onRetry && (
        <button
          className="sync-retry-btn"
          onClick={onRetry}
          title="Retry sync"
        >
          Retry
        </button>
      )}
      {status === 'error' && errorMessage && (
        <div className="sync-error-tooltip">
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
    <div className="global-sync-indicator">
      <CloudOff size={14}  style={{ width: '14px', height: '14px', flexShrink: 0 }} />
      <span>Offline Mode</span>
    </div>
  );
};
