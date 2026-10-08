import { AlertCircle, CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';

import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';
import { cn } from '@/lib/utils';

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

  // On a phone the calm "all saved" state is just the check mark (the words stay for screen readers),
  // so it shares a row with the offline badge; anything that needs attention keeps its words.
  const calm = !isOffline && !needsAttention && !isPending;

  return (
    <span
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-md border bg-muted/35 px-3 text-sm text-muted-foreground',
        calm && 'max-sm:w-11 max-sm:justify-center max-sm:px-0'
      )}
      role="status"
    >
      <Icon className={isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
      <span className={calm ? 'sr-only sm:not-sr-only' : undefined}>{label}</span>
    </span>
  );
}
