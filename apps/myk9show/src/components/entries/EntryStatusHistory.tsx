import { useState } from 'react';
import { AlertCircle, History, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getStatusDescriptor, StatusIcon } from '@/components/status';
import { useEntryStatusHistory } from '@/hooks/useEntryStatusHistory';

interface EntryStatusHistoryProps {
  entryId: string;
  currentStatus?: string | null | undefined;
  createdAt?: string | null | undefined;
}

function entryStatusLabel(status: string): string {
  return getStatusDescriptor('entry', status).label;
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return 'Time not recorded';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Time not recorded';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function EntryStatusHistory({ entryId, currentStatus, createdAt }: EntryStatusHistoryProps) {
  const [open, setOpen] = useState(false);
  const history = useEntryStatusHistory(entryId, open);

  if (!history.canViewHistory) return null;

  return (
    <section
      className="space-y-3 border-t border-border pt-4"
      aria-labelledby="entry-history-title"
    >
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full justify-start gap-2 sm:w-auto"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <History className="h-4 w-4" />
        {open ? 'Hide entry status history' : 'View entry status history'}
      </Button>

      {open && (
        <div className="space-y-3">
          <div>
            <h3 id="entry-history-title" className="text-base font-semibold">
              Entry status history
            </h3>
            <p className="text-sm text-muted-foreground">
              Lifecycle changes only. Payment, email, check-in, and score activity are not included.
            </p>
          </div>

          {history.isOffline && !history.data && (
            <Alert>
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span>History is available when this device is connected.</span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => history.refetch()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!history.isOffline && history.isPending && (
            <div role="status" aria-label="Loading entry status history" className="text-sm">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Loading history…
            </div>
          )}

          {!history.isOffline && history.isError && !history.data && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span>History is temporarily unavailable. Entry work remains usable.</span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => history.refetch()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {history.data && history.data.length > 0 && (
            <>
              {history.isOffline && (
                <p className="text-sm text-muted-foreground">
                  Showing history saved before connection was lost.
                </p>
              )}
              <ol className="space-y-3 border-l border-border pl-4">
                {history.data.map(item => (
                  <li key={item.id} className="relative space-y-1">
                    <StatusIcon
                      family="entry"
                      status={item.newStatus}
                      size="sm"
                      decorative
                      className="absolute -left-[1.65rem] top-1 bg-card"
                    />
                    <p className="font-medium">
                      {item.previousStatus
                        ? `${entryStatusLabel(item.previousStatus)} → ${entryStatusLabel(item.newStatus)}`
                        : `Created as ${entryStatusLabel(item.newStatus)}`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatTimestamp(item.changedAt)} ·{' '}
                      {item.actorName ?? 'Staff member not recorded'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.reason || 'No reason recorded'}
                    </p>
                  </li>
                ))}
              </ol>
            </>
          )}

          {history.data && history.data.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              <p>No status changes have been recorded for this entry.</p>
              {createdAt && currentStatus && (
                <p className="mt-1">
                  Created {formatTimestamp(createdAt)} · current status{' '}
                  {entryStatusLabel(currentStatus)}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
