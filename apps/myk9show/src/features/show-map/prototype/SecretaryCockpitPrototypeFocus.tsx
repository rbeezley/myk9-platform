import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  CockpitClassPrototype,
  CockpitPrototypeAction,
  CockpitPrototypeStatus,
  PaperworkPrototype,
} from './secretaryCockpitPrototypeData';
import {
  buildCockpitClassWorkActions,
  COCKPIT_STATUS_LABELS,
} from './secretaryCockpitPrototypeData';
import {
  SecretaryCockpitPrototypeLifecycleTime,
  SecretaryCockpitPrototypeStatusControl,
} from './SecretaryCockpitPrototypeStatusControl';

export interface PrototypePrintRecord {
  actor: string;
  time: string;
  pendingSync: boolean;
}

interface SecretaryCockpitPrototypeFocusProps {
  classItem: CockpitClassPrototype;
  printedRecords: Readonly<Record<string, PrototypePrintRecord>>;
  onNavigate: (action: CockpitPrototypeAction, classId: string) => void;
  onPrint: (classItem: CockpitClassPrototype, paperwork: PaperworkPrototype) => void;
  onRecordPrinted: (classItem: CockpitClassPrototype, paperwork: PaperworkPrototype) => void;
  onStatusChange: (classItem: CockpitClassPrototype, status: CockpitPrototypeStatus) => void;
  compact?: boolean;
}

function paperworkKey(classId: string, paperworkId: string) {
  return `${classId}:${paperworkId}`;
}

function PaperworkRow({
  classItem,
  paperwork,
  printedRecord,
  onPrint,
  onRecordPrinted,
}: {
  classItem: CockpitClassPrototype;
  paperwork: PaperworkPrototype;
  printedRecord?: PrototypePrintRecord;
  onPrint: SecretaryCockpitPrototypeFocusProps['onPrint'];
  onRecordPrinted: SecretaryCockpitPrototypeFocusProps['onRecordPrinted'];
}) {
  const state = printedRecord ? 'current' : paperwork.state;
  const detail = printedRecord
    ? `Printed ${printedRecord.time} by ${printedRecord.actor}${printedRecord.pendingSync ? ' · saved on this device' : ''}`
    : paperwork.detail;
  const history = printedRecord
    ? [`${printedRecord.time} · ${printedRecord.actor} · Class print`, ...paperwork.history]
    : paperwork.history;

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        state === 'stale' && 'border-warning/40 bg-warning/10',
        state === 'unconfirmed' && 'border-border bg-muted/35',
        state === 'current' && 'border-success/30 bg-success/10'
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            {state === 'current' ? (
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            ) : state === 'stale' ? (
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            ) : (
              <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
            {paperwork.label}
          </div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p>
        </div>
        <Button
          type="button"
          variant={state === 'stale' ? 'default' : 'outline'}
          className="min-h-11 shrink-0"
          onClick={() => onPrint(classItem, paperwork)}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {state === 'current' ? 'Reprint' : state === 'stale' ? 'Review & reprint' : 'Print'}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {state === 'unconfirmed' && (
          <button
            type="button"
            className="min-h-11 font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => onRecordPrinted(classItem, paperwork)}
          >
            Already printed? Record it
          </button>
        )}
        {history.length > 0 && (
          <details className="text-muted-foreground">
            <summary className="min-h-11 cursor-pointer content-center font-medium text-primary">
              Print history ({history.length})
            </summary>
            <ul className="mt-2 space-y-1 border-l border-border pl-3">
              {history.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

export function SecretaryCockpitPrototypeFocus({
  classItem,
  printedRecords,
  onNavigate,
  onPrint,
  onRecordPrinted,
  onStatusChange,
  compact = false,
}: SecretaryCockpitPrototypeFocusProps) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card',
        !compact && 'lg:sticky lg:top-4'
      )}
      aria-label={`Focused class: ${classItem.name}`}
    >
      <header className="border-b border-border bg-accent/70 p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
            Focused class · Trial {classItem.trialNumber} ·{' '}
            {COCKPIT_STATUS_LABELS[classItem.status]}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {classItem.name}
          </h2>
        </div>
      </header>

      <div className="space-y-6 p-5">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span>{classItem.trialDate}</span>
          {classItem.revisedExpectedTime ? (
            <>
              <span className="font-semibold text-primary">
                Expected {classItem.revisedExpectedTime}
              </span>
              <span>Scheduled {classItem.time ?? 'not set'}</span>
            </>
          ) : (
            <span>Scheduled {classItem.time ?? 'not set'}</span>
          )}
          <span>{classItem.location ?? 'Operational area not assigned'}</span>
          <span>{classItem.judge}</span>
          <span>{classItem.total} entries</span>
          <span>{classItem.scored} results entered</span>
        </div>

        <nav aria-label={`Class work for ${classItem.name}`}>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Class work
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {buildCockpitClassWorkActions(classItem).map(action => (
              <Button
                key={action.label}
                type="button"
                variant="outline"
                className="min-h-11 justify-between px-3"
                onClick={() => onNavigate(action, classItem.id)}
              >
                {action.label}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            ))}
          </div>
        </nav>

        {classItem.issue && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{classItem.issue}</p>
                <p className="mt-1 text-sm text-destructive">
                  This is the primary work for this class.
                </p>
              </div>
              <Button
                type="button"
                className="min-h-12 shrink-0"
                onClick={() =>
                  classItem.primaryAction.kind === 'print'
                    ? onPrint(
                        classItem,
                        classItem.paperwork.find(
                          item => item.id === classItem.primaryAction.documentId
                        ) ?? classItem.paperwork[0]!
                      )
                    : onNavigate(classItem.primaryAction, classItem.id)
                }
              >
                {classItem.primaryAction.label}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        {!classItem.issue && (
          <Button
            type="button"
            className="min-h-12 w-full"
            onClick={() =>
              classItem.primaryAction.kind === 'print'
                ? onPrint(
                    classItem,
                    classItem.paperwork.find(
                      item => item.id === classItem.primaryAction.documentId
                    ) ?? classItem.paperwork[0]!
                  )
                : onNavigate(classItem.primaryAction, classItem.id)
            }
          >
            {classItem.primaryAction.label}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        )}

        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Paperwork
          </h3>
          <div className="mt-3 space-y-3">
            {classItem.paperwork.map(paperwork => (
              <PaperworkRow
                key={paperwork.id}
                classItem={classItem}
                paperwork={paperwork}
                printedRecord={printedRecords[paperworkKey(classItem.id, paperwork.id)]}
                onPrint={onPrint}
                onRecordPrinted={onRecordPrinted}
              />
            ))}
          </div>
        </div>

        {classItem.supportingActions.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Supporting actions
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {classItem.supportingActions.map(action => (
                <Button
                  key={action.label}
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => onNavigate(action, classItem.id)}
                >
                  {action.label}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <SecretaryCockpitPrototypeStatusControl
            classItem={classItem}
            onStatusChange={onStatusChange}
            prefix="Lifecycle:"
          />
          <SecretaryCockpitPrototypeLifecycleTime classItem={classItem} />
        </div>
      </div>
    </section>
  );
}
