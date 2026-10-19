import { useState } from 'react';
import { CheckCircle2, Clock3, Printer, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatTime } from '@/lib/format/dates';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { replicatedPaperworkPrintsTable } from '@/services/replication';
import { recordPaperworkPrinted, voidPaperworkPrint } from './paperworkPrintActions';
import type { PaperworkDescriptor } from './paperworkPrintState';
import { CockpitActionLink } from './CockpitActionLink';
import { PaperworkPrintConfirmationDialog } from './PaperworkPrintConfirmationDialog';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

export function CockpitPaperworkRow({
  item,
  timeZone,
  onCommand,
  onPrint,
  selected,
  onSelectedChange,
}: {
  item: SecretaryCockpitPaperwork;
  timeZone: string;
  onCommand: (commandId: string) => void;
  /**
   * Previews and prints beside the page instead of linking to Reports. When set, the row also
   * records the print itself (the print panel does, on afterprint), so the manual "Record as
   * printed" step is gone.
   */
  onPrint?: () => void;
  /** With `onSelectedChange`, shows a checkbox so several sheets print together. */
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}) {
  const { user } = useAuthContext();
  const [isRecording, setIsRecording] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voidRecordId, setVoidRecordId] = useState<string | null>(null);
  const current = item.state === 'current';
  const stale = item.state === 'stale';
  /** The print records could not be read, so absence of a record proves nothing. */
  const printStateUnknown = item.state === 'unknown';
  // Undo marks the class's own record not printed. A trial- or show-wide record covers other
  // classes too, so it is undone where it was made (Reports), not from one class's row.
  const printLabel = stale
    ? 'Review and reprint'
    : item.printedAt
      ? 'Reprint'
      : printStateUnknown
        ? 'Print anyway'
        : 'Print';
  const canUndo = Boolean(user && item.recordId && item.coveredByScope === 'class');
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
        {onSelectedChange && (
          <label className="-m-2 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
            <Checkbox
              checked={selected ?? false}
              onCheckedChange={onSelectedChange}
              aria-label={`Select ${item.label} to print`}
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
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
              ? `${stale ? 'Stale · ' : ''}Printed ${formatTime(item.printedAt, timeZone)}${item.printedBy ? ` by ${item.printedBy}` : ''}${item.coveredByScope === 'trial' || item.coveredByScope === 'show' ? ` · Printed with the whole ${item.coveredByScope}` : ''}`
              : printStateUnknown
                ? 'Print history unavailable'
                : 'Not confirmed printed'}
            {stale ? ' · Class data changed after printing' : ''}
            {canUndo && (
              <>
                {' · '}
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
                  aria-label={`Mark ${item.label} not printed`}
                  onClick={() =>
                    void voidPaperworkPrint({
                      recordId: item.recordId!,
                      user: user!,
                      reason: 'Marked not printed from the Overview',
                      failureMessage: 'Could not mark that not printed.',
                    })
                  }
                >
                  Undo
                </button>
              </>
            )}
          </div>
        </div>
        {item.printHref && onPrint && (
          <Button
            type="button"
            variant={item.printedAt ? 'outline' : 'default'}
            className="min-h-11"
            onClick={onPrint}
          >
            <span className="inline-flex items-center gap-2">
              <Printer className="h-4 w-4" aria-hidden="true" />
              {printLabel}
            </span>
          </Button>
        )}
        {item.printHref && !onPrint && (
          <CockpitActionLink
            destination={{ kind: 'href', href: item.printHref }}
            onCommand={onCommand}
            variant={item.printedAt ? 'outline' : 'default'}
          >
            <span className="inline-flex items-center gap-2">
              <Printer className="h-4 w-4" />
              {printLabel}
            </span>
          </CockpitActionLink>
        )}
      </div>
      {item.confirmation && user && !onPrint && (
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
                    onClick={() => setVoidRecordId(record.id)}
                  >
                    Mark incorrect
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
      <ConfirmDialog
        open={voidRecordId !== null}
        onOpenChange={open => !open && setVoidRecordId(null)}
        title="Mark this print confirmation as incorrect?"
        description="The record stays in the print history, struck through."
        confirmLabel="Mark incorrect"
        destructive
        onConfirm={() => {
          if (!user || !voidRecordId) return;
          void replicatedPaperworkPrintsTable
            .voidPrint({
              id: voidRecordId,
              voidedBy: user.id,
              reason: 'Marked incorrect from Show Desk print history',
            })
            .then(() => toast.success('Print confirmation marked incorrect.'))
            .catch(() => toast.error('Print confirmation could not be changed.'));
        }}
      />
    </div>
  );
}
