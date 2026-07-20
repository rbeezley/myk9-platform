import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Printer, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { formatTime } from '@/lib/format/dates';
import { showUndoToast } from '@/lib/undoToast';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { replicatedPaperworkPrintsTable } from '@/services/replication';

import { CockpitActionLink } from './CockpitActionLink';
import { ClassStatusControl, ExpectedStartControl } from './ClassOperationalControls';
import { formatTrialIdentity } from './secretaryCockpitModel';
import type {
  FocusedClassModel,
  SecretaryCockpitAttention,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

function PaperworkRow({
  item,
  onCommand,
}: {
  item: FocusedClassModel['paperwork'][number];
  onCommand: (commandId: string) => void;
}) {
  const { user } = useAuthContext();
  const [isRecording, setIsRecording] = useState(false);
  const current = item.state === 'current';
  const stale = item.state === 'stale';
  const recordAsPrinted = async () => {
    if (!user || !item.confirmation) return;
    if (!window.confirm(`Record ${item.label} as printed now?`)) return;
    const metadata = user.user_metadata ?? {};
    const printedByName =
      (metadata.full_name as string | undefined)?.trim() ||
      [metadata.first_name, metadata.last_name].filter(Boolean).join(' ').trim() ||
      user.email ||
      'Secretary';
    setIsRecording(true);
    try {
      const record = await replicatedPaperworkPrintsTable.confirmPrinted({
        scope: item.confirmation.scope,
        reportId: item.reportId,
        coverage: item.confirmation.coverage,
        fingerprint: item.confirmation.fingerprint,
        printedBy: user.id,
        printedByName,
      });
      showUndoToast({
        message: `${item.label} recorded as printed.`,
        onUndo: () => {
          void replicatedPaperworkPrintsTable
            .voidPrint({
              id: record.id,
              voidedBy: user.id,
              reason: 'Undid print confirmation',
            })
            .catch(() => toast.error('Print confirmation could not be undone.'));
        },
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
              ? `Printed ${formatTime(item.printedAt)}${item.printedBy ? ` by ${item.printedBy}` : ''}${item.coveredByScope ? ` · ${item.coveredByScope[0]?.toUpperCase()}${item.coveredByScope.slice(1)} scope` : ''}`
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
              {stale ? 'Review and reprint' : item.printedAt ? 'Reprint' : 'Print'}
            </span>
          </CockpitActionLink>
        )}
      </div>
      {item.confirmation && user && (
        <button
          type="button"
          className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60"
          disabled={isRecording}
          onClick={() => void recordAsPrinted()}
        >
          {isRecording ? 'Recording…' : 'Record as printed'}
        </button>
      )}
      {item.history && item.history.length > 0 && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            Print history ({item.history.length})
          </summary>
          <div className="mt-2 space-y-2 border-l pl-3">
            {item.history.map(record => (
              <div key={record.id} className={cn(record.voidedAt && 'line-through opacity-60')}>
                <span>
                  {formatTime(record.printedAt)} by {record.printedBy}
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

export function SecretaryCockpitFocusedClass({
  focused,
  sourceClass,
  trial,
  attention,
  timeZone,
  canManageShow,
  onCommand,
}: {
  focused: FocusedClassModel | null;
  sourceClass: SecretaryCockpitClass | null;
  trial: SecretaryCockpitTrial | null;
  attention: readonly SecretaryCockpitAttention[];
  timeZone: string;
  canManageShow: boolean;
  onCommand: (commandId: string) => void;
}) {
  if (!focused || !sourceClass || !trial) {
    return (
      <aside className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Select a Class from the schedule to see its work and paperwork.
      </aside>
    );
  }

  return (
    <aside className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm xl:sticky xl:top-4">
      <div className="border-b p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Focused Class · {formatTrialIdentity(trial.number)}
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{focused.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ClassStatusControl
                classId={focused.id}
                lifecycle={focused.lifecycle.value}
                unenteredScoreCount={
                  focused.progress.value === null
                    ? 0
                    : Math.max(0, focused.progress.value.total - focused.progress.value.completed)
                }
                canManageShow={canManageShow}
              />
              {focused.progress.value && (
                <span className="text-xs text-muted-foreground">
                  {focused.progress.value.completed} of {focused.progress.value.total} scored
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Expected start
            </div>
            <div className="mt-1">
              <ExpectedStartControl
                classId={focused.id}
                scheduledStart={sourceClass.scheduledStart ?? null}
                revisedExpectedStart={sourceClass.revisedExpectedStart ?? null}
                trialDate={trial.date}
                timeZone={timeZone}
                canManageShow={canManageShow}
              />
            </div>
            {sourceClass.revisedExpectedStart && sourceClass.scheduledStart && (
              <div className="mt-1 text-xs text-muted-foreground">
                Scheduled {sourceClass.scheduledStart}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actual timing
            </div>
            <div className="mt-1 font-medium">
              {focused.actualStart.value
                ? `Started ${formatTime(focused.actualStart.value, timeZone)}`
                : 'Not started'}
              {focused.actualFinish.value
                ? ` · Finished ${formatTime(focused.actualFinish.value, timeZone)}`
                : ''}
            </div>
          </div>
        </div>

        {attention.length > 0 && (
          <div className="space-y-2">
            {attention.slice(0, 2).map(item => (
              <div
                key={item.id}
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-destructive">{item.label}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{item.reason}</div>
                  </div>
                </div>
                {item.destination && (
                  <CockpitActionLink
                    destination={item.destination}
                    onCommand={onCommand}
                    className="mt-3 w-full"
                  >
                    {item.label}
                  </CockpitActionLink>
                )}
              </div>
            ))}
          </div>
        )}

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Class work
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {focused.classWorkActions.map(action => (
              <CockpitActionLink
                key={action.id}
                destination={action.destination}
                onCommand={onCommand}
                variant="outline"
                className="w-full"
              >
                {action.label}
              </CockpitActionLink>
            ))}
          </div>
        </section>

        {focused.paperwork.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Paperwork
            </h3>
            <div className="mt-2 space-y-2">
              {focused.paperwork.map(item => (
                <PaperworkRow key={item.reportId} item={item} onCommand={onCommand} />
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
