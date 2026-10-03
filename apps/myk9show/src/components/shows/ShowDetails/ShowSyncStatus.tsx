import { AlertCircle, CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';

import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';

/**
 * Whether this device's show changes are saved, in calm, truthful words. Moved
 * from the deleted Show Day header to the show home (MYK9-957).
 */
export function ShowSyncStatus() {
  const sync = useGlobalSyncStatus();
  const isOffline = sync.status === 'offline';
  const needsAttention = sync.status === 'error' || sync.status === 'conflict';
  const isPending = sync.status === 'pending';
  const Icon = isOffline
    ? WifiOff
    : needsAttention
      ? AlertCircle
      : isPending
        ? RefreshCw
        : CheckCircle2;
  const label = isOffline
    ? 'Offline · changes saved on this device'
    : needsAttention
      ? 'Sync needs attention'
      : isPending
        ? `${sync.queueSize} ${sync.queueSize === 1 ? 'change' : 'changes'} saved on this device`
        : 'All changes saved';

  return (
    <span
      className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-muted/35 px-3 text-sm text-muted-foreground"
      role="status"
    >
      <Icon className={isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
      {label}
    </span>
  );
}
