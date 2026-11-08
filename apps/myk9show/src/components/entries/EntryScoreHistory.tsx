import { useState } from 'react';
import { AlertCircle, ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useEntryScoreAudit } from '@/hooks/useEntryScoreAudit';
import {
  formatScoreAuditTime,
  formatScoreAuditValue,
  scoreAuditActorLabel,
  scoreAuditFieldLabel,
} from './scoreAuditFormat';

interface EntryScoreHistoryProps {
  entryId: string;
}

/**
 * Who entered or changed a result, and when (MYK9-1754). Sits in the entry detail
 * the secretary already opens, beside the status history. Online-only audit read.
 */
export function EntryScoreHistory({ entryId }: EntryScoreHistoryProps) {
  const [open, setOpen] = useState(false);
  const audit = useEntryScoreAudit(entryId, open);

  if (!audit.canViewScoreHistory) return null;

  return (
    <section
      className="space-y-3 border-t border-border pt-4"
      aria-labelledby="entry-score-history-title"
    >
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full justify-start gap-2 sm:w-auto"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <ClipboardList className="h-4 w-4" />
        {open ? 'Hide score history' : 'View score history'}
      </Button>

      {open && (
        <div className="space-y-3">
          <div>
            <h3 id="entry-score-history-title" className="text-base font-semibold">
              Score history
            </h3>
            <p className="text-sm text-muted-foreground">
              Who entered or changed this result at the ring.
            </p>
          </div>

          {audit.isPending && audit.fetchStatus === 'paused' && (
            <Alert>
              <AlertDescription>
                Score history is available when this device is connected.
              </AlertDescription>
            </Alert>
          )}

          {audit.isPending && audit.fetchStatus === 'fetching' && (
            <div role="status" aria-label="Loading score history" className="text-sm">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Loading score history…
            </div>
          )}

          {audit.isError && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span>Score history is unavailable right now. Check your connection.</span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => void audit.refetch()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {audit.data && audit.data.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              No score changes recorded
            </div>
          )}

          {audit.data && audit.data.length > 0 && (
            <ol className="space-y-3 border-l border-border pl-4">
              {audit.data.map(item => {
                const saved = formatScoreAuditTime(item.clientSavedAt, item.timeZone);
                const reached = formatScoreAuditTime(item.changedAt, item.timeZone);
                return (
                  <li key={item.id} className="space-y-1">
                    <p className="font-medium">{scoreAuditActorLabel(item)}</p>
                    <p className="text-sm text-muted-foreground">
                      {saved ? `Saved on device ${saved} · ` : ''}
                      {saved ? 'Reached server' : 'Recorded'} {reached ?? 'time not recorded'}
                    </p>
                    {item.changes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No values changed</p>
                    ) : (
                      <ul className="text-sm">
                        {item.changes.map(change => (
                          <li key={change.field}>
                            {scoreAuditFieldLabel(change.field)}:{' '}
                            {formatScoreAuditValue(change.oldValue)} {'→'}{' '}
                            {formatScoreAuditValue(change.newValue)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
