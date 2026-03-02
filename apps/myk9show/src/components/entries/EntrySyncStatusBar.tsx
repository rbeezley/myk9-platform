import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  RefreshCw,
  Wifi,
  CreditCard,
  Users
} from 'lucide-react';
// import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator';
import { useEntryStore } from '@/store/entryStore';
// import type { SyncableShowEntry, EntryStatus } from '@/store/entryStore';

interface EntrySyncStatusBarProps {
  /** Show/Class/Entry IDs to filter entries for display */
  showId?: string;
  classId?: string;
  entryIds?: string[];
  /** Show compact view */
  compact?: boolean;
  /** Enable sync actions */
  enableActions?: boolean;
  /** Custom className */
  className?: string;
  /** Callback for retry actions */
  onRetrySync?: (entryIds: string[]) => void;
  /** Callback for payment actions */
  onRetryPayment?: (entryIds: string[]) => void;
}

interface EntryStats {
  total: number;
  synced: number;
  pending: number;
  error: number;
  conflict: number;
  paymentPending: number;
  paymentProcessing: number;
  paymentFailed: number;
}

/**
 * EntrySyncStatusBar - Displays comprehensive sync status for entries with Premium design
 * 
 * Shows real-time sync status, payment status, and provides quick actions for batch operations.
 * Integrates with entryStore for live updates and supports filtering by show/class/entry IDs.
 */
export const EntrySyncStatusBar: React.FC<EntrySyncStatusBarProps> = ({
  showId,
  classId,
  entryIds,
  compact = false,
  enableActions = true,
  className = '',
  onRetrySync,
  onRetryPayment
}) => {
  // Get entries from store
  const entries = useEntryStore((state) => state.entries);
  const getSyncStatus = useEntryStore((state) => state.getSyncStatus);

  // Filter entries based on props
  const filteredEntries = useMemo(() => {
    let filtered = entries;

    if (showId) {
      filtered = filtered.filter(entry => entry.showId === showId);
    }
    if (classId) {
      filtered = filtered.filter(entry => entry.classId === classId);
    }
    if (entryIds) {
      filtered = filtered.filter(entry => entryIds.includes(entry.id));
    }

    return filtered;
  }, [entries, showId, classId, entryIds]);

  // Calculate statistics
  const stats: EntryStats = useMemo(() => {
    const result: EntryStats = {
      total: filteredEntries.length,
      synced: 0,
      pending: 0,
      error: 0,
      conflict: 0,
      paymentPending: 0,
      paymentProcessing: 0,
      paymentFailed: 0
    };

    filteredEntries.forEach(entry => {
      const syncStatus = getSyncStatus(entry.id);
      
      // Count sync status
      switch (syncStatus) {
        case 'synced':
          result.synced++;
          break;
        case 'pending':
          result.pending++;
          break;
        case 'error':
          result.error++;
          break;
        case 'conflict':
          result.conflict++;
          break;
      }

      // Count payment status
      if (entry.registrationData?.paymentStatus) {
        switch (entry.registrationData.paymentStatus) {
          case 'pending':
            result.paymentPending++;
            break;
          case 'paid':
            // Already counted in sync status
            break;
          case 'refunded':
            // Consider as resolved
            break;
        }
      }
    });

    return result;
  }, [filteredEntries, getSyncStatus]);

  // Get entries with specific issues for batch actions
  const entriesWithSyncErrors = filteredEntries.filter(entry => 
    getSyncStatus(entry.id) === 'error'
  );
  const entriesWithConflicts = filteredEntries.filter(entry => 
    getSyncStatus(entry.id) === 'conflict'
  );
  const entriesWithPaymentIssues = filteredEntries.filter(entry => 
    entry.registrationData?.paymentStatus === 'pending'
  );

  // Calculate sync progress percentage
  const syncProgress = stats.total > 0 
    ? Math.round(((stats.synced + stats.error + stats.conflict) / stats.total) * 100)
    : 100;

  const paymentProgress = stats.total > 0
    ? Math.round(((stats.total - stats.paymentPending) / stats.total) * 100)
    : 100;

  // Handle batch retry actions
  const handleRetrySyncErrors = () => {
    if (onRetrySync && entriesWithSyncErrors.length > 0) {
      onRetrySync(entriesWithSyncErrors.map(e => e.id));
    }
  };

  const handleRetryPayments = () => {
    if (onRetryPayment && entriesWithPaymentIssues.length > 0) {
      onRetryPayment(entriesWithPaymentIssues.map(e => e.id));
    }
  };

  // Compact view for limited space
  if (compact) {
    return (
      <div className={`flex items-center gap-3 px-4 py-2 bg-card/50 backdrop-blur-sm 
                       border border-border/50 rounded-xl shadow-sm ${className}`}>
        {/* Entry count */}
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{stats.total}</span>
        </div>

        {/* Sync status indicators */}
        <div className="flex items-center gap-1">
          {stats.synced > 0 && (
            <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
              <CheckCircle className="h-3 w-3 mr-1" />
              {stats.synced}
            </Badge>
          )}
          {stats.pending > 0 && (
            <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
              <Clock className="h-3 w-3 mr-1" />
              {stats.pending}
            </Badge>
          )}
          {stats.error > 0 && (
            <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {stats.error}
            </Badge>
          )}
          {stats.conflict > 0 && (
            <Badge variant="destructive" className="bg-yellow-50 text-yellow-700 border-yellow-200">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {stats.conflict}
            </Badge>
          )}
        </div>

        {/* Payment indicators */}
        {stats.paymentPending > 0 && (
          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
            <CreditCard className="h-3 w-3 mr-1" />
            {stats.paymentPending}
          </Badge>
        )}

        {/* Quick actions */}
        {enableActions && (
          <div className="flex items-center gap-1">
            {entriesWithSyncErrors.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRetrySyncErrors}
                className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
            {entriesWithPaymentIssues.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRetryPayments}
                className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
              >
                <CreditCard className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full view with detailed information
  return (
    <div className={`space-y-4 p-6 bg-card/95 backdrop-blur-sm border border-border/50 
                     rounded-xl shadow-sm ${className}`}>
      {/* Header with title and entry count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Entry Sync Status</h3>
            <p className="text-sm text-muted-foreground">
              {stats.total} {stats.total === 1 ? 'entry' : 'entries'} tracked
            </p>
          </div>
        </div>

        {/* Network status indicator */}
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-green-600" />
          <span className="text-xs text-muted-foreground">Online</span>
        </div>
      </div>

      {/* Sync progress overview */}
      <div className="space-y-3">
        {/* Sync progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Sync Progress</span>
            <span className="text-sm text-muted-foreground">{syncProgress}%</span>
          </div>
          <Progress 
            value={syncProgress} 
            className="h-2 bg-muted"
          />
        </div>

        {/* Payment progress bar */}
        {stats.paymentPending > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Payment Progress</span>
              <span className="text-sm text-muted-foreground">{paymentProgress}%</span>
            </div>
            <Progress 
              value={paymentProgress} 
              className="h-2 bg-muted [&>div]:bg-blue-500"
            />
          </div>
        )}
      </div>

      {/* Detailed status breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Synced entries */}
        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-sm font-medium text-green-800">{stats.synced}</p>
            <p className="text-xs text-green-600">Synced</p>
          </div>
        </div>

        {/* Pending entries */}
        {stats.pending > 0 && (
          <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <Clock className="h-5 w-5 text-orange-600" />
            <div>
              <p className="text-sm font-medium text-orange-800">{stats.pending}</p>
              <p className="text-xs text-orange-600">Pending</p>
            </div>
          </div>
        )}

        {/* Error entries */}
        {stats.error > 0 && (
          <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-800">{stats.error}</p>
              <p className="text-xs text-red-600">Errors</p>
            </div>
          </div>
        )}

        {/* Conflict entries */}
        {stats.conflict > 0 && (
          <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-sm font-medium text-yellow-800">{stats.conflict}</p>
              <p className="text-xs text-yellow-600">Conflicts</p>
            </div>
          </div>
        )}

        {/* Payment pending */}
        {stats.paymentPending > 0 && (
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-800">{stats.paymentPending}</p>
              <p className="text-xs text-blue-600">Payment Pending</p>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {enableActions && (stats.error > 0 || stats.conflict > 0 || stats.paymentPending > 0) && (
        <div className="flex items-center gap-3 pt-2 border-t border-border/50">
          {entriesWithSyncErrors.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetrySyncErrors}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Sync ({entriesWithSyncErrors.length})
            </Button>
          )}

          {entriesWithConflicts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-yellow-600 border-yellow-200 hover:bg-yellow-50"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Resolve Conflicts ({entriesWithConflicts.length})
            </Button>
          )}

          {entriesWithPaymentIssues.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryPayments}
              className="text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Retry Payments ({entriesWithPaymentIssues.length})
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// Convenience components for specific contexts
export const ShowEntrySyncBar: React.FC<Omit<EntrySyncStatusBarProps, 'showId'> & { showId: string }> = (props) => (
  <EntrySyncStatusBar {...props} />
);

export const ClassEntrySyncBar: React.FC<Omit<EntrySyncStatusBarProps, 'classId'> & { classId: string }> = (props) => (
  <EntrySyncStatusBar {...props} />
);

export default EntrySyncStatusBar;