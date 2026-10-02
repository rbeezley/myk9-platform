import { useState } from 'react';
import { CheckCircle2, Clock3, Printer, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { formatTime } from '@/lib/format/dates';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { replicatedPaperworkPrintsTable } from '@/services/replication';
import { recordPaperworkPrinted } from './paperworkPrintActions';
import type { PaperworkDescriptor } from './paperworkPrintState';
import { CockpitActionLink } from './CockpitActionLink';
import { PaperworkPrintConfirmationDialog } from './PaperworkPrintConfirmationDialog';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

export function CockpitPaperworkRow({
  item,
  timeZone,
  onCommand,
}: {
  item: SecretaryCockpitPaperwork;
  timeZone: string;
  onCommand: (commandId: string) => void;
}) {
  const { user } = useAuthContext();
  const [isRecording, setIsRecording] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const current = item.state === 'current';
  const stale = item.state === 'stale';
  /** The print records could not be read, so absence of a record proves nothing. */
  const printStateUnknown = item.state === 'unknown';
  const recordAsPrinted = async () => {
    if (!user || !item.confirmation) return;
    setIsRecording(true);
    try {
      await recordPaperworkPrinted({
        descriptor: {
          reportId: item.reportId,
          scope: item.confirmation.scope,
          coverage: item.confirmation.coverage as PaperworkDescriptor['coverage'],
          fingerprint: item.confirmation.fingerprint,
        },
        user,
        message: `${item.label} recorded as printed.`,
        undoReason: 'Undid print confirmation',
        undoFailureMessage: 'Print confirmation could not be undone.',
      });
    } catch {
      toast.error('Print confirmation could not be saved.');
    } finally {
      setIsRecording(false);
    }
  };
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        current && 'border-success/30 bg-success/10',
        stale && 'border-warning/30 bg-warning/10'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            {current ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : stale ? (
              <RefreshCw className="h-4 w-4 text-warning" />
            ) : (
              <Clock3 className="h-4 w-4 text-muted-foreground" />
            )}
            {item.label}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {item.printedAt
              ? `${stale ? 'Stale · ' : ''}Printed ${formatTime(item.printedAt, timeZone)}${item.printedBy ? ` by ${item.printedBy}` : ''}${item.coveredByScope ? ` · ${item.coveredByScope[0]?.toUpperCase()}${item.coveredByScope.slice(1)} scope` : ''}`
              : printStateUnknown
                ? 'Print history unavailable'
                : 'Not confirmed printed'}
            {stale ? ' · Class data changed after printing' : ''}
          </div>
        </div>
        {item.printHref && (
          <CockpitActionLink
            destination={{ kind: 'href', href: item.printHref }}
            onCommand={onCommand}
            variant={item.printedAt ? 'outline' : 'default'}
          >
            <span className="inline-flex items-center gap-2">
              <Printer className="h-4 w-4" />
              {stale
                ? 'Review and reprint'
                : item.printedAt
                  ? 'Reprint'
                  : printStateUnknown
                    ? 'Print anyway'
                    : 'Print'}
            </span>
          </CockpitActionLink>
        )}
      </div>
      {item.confirmation && user && (
        <button
          type="button"
          className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60"
          disabled={isRecording}
          onClick={() => setConfirmOpen(true)}
        >
          {isRecording ? 'Recording…' : 'Record as printed'}
        </button>
      )}
      <PaperworkPrintConfirmationDialog
        open={confirmOpen}
        reportLabel={item.label}
        isSaving={isRecording}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          setConfirmOpen(false);
          void recordAsPrinted();
        }}
      />
      {item.history && item.history.length > 0 && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            Print history ({item.history.length})
          </summary>
          <div className="mt-2 space-y-2 border-l pl-3">
            {item.history.map(record => (
              <div key={record.id} className={cn(record.voidedAt && 'line-through opacity-60')}>
                <span>
                  {formatTime(record.printedAt, timeZone)} by {record.printedBy}
                  {record.voidedAt ? ' · marked incorrect' : ''}
                </span>
                {!record.voidedAt && user && (
                  <button
                    type="button"
                    className="ml-2 inline-flex min-h-11 items-center text-destructive underline-offset-4 hover:underline"
                    onClick={() => {
                      if (!window.confirm('Mark this print confirmation as incorrect?')) return;
                      void replicatedPaperworkPrintsTable
                        .voidPrint({
                          id: record.id,
                          voidedBy: user.id,
                          reason: 'Marked incorrect from Show Desk print history',
                        })
                        .then(() => toast.success('Print confirmation marked incorrect.'))
                        .catch(() => toast.error('Print confirmation could not be changed.'));
                    }}
                  >
                    Mark incorrect
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
