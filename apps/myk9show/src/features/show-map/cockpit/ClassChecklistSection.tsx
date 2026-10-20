import { useState } from 'react';
import { CheckCircle2, CircleHelp, Clock3, Printer, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCockpitResultsControlHref, getShowHomeHref } from './cockpitRoutes';
import { ClassPrintPanel } from './ClassPrintPanel';
import { CockpitPaperworkRow } from './CockpitPaperworkRow';
import {
  buildClassChecklist,
  summarizeClassChecklist,
  type ClassChecklistItem,
  type ClassChecklistState,
} from './classChecklist';
import type { SecretaryCockpitClass, SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

const STATE_TEXT: Record<ClassChecklistState, string> = {
  done: 'Done',
  todo: 'Not done',
  reprint: 'Needs reprint',
  unknown: 'Unknown',
};

function StateIcon({ state }: { state: ClassChecklistState }) {
  if (state === 'done') return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />;
  if (state === 'reprint') return <RefreshCw className="h-4 w-4 text-warning" aria-hidden="true" />;
  if (state === 'unknown')
    return <CircleHelp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  return <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

function ChecklistStepRow({ item }: { item: ClassChecklistItem }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3',
        item.state === 'done' && 'border-success/30 bg-success/10'
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <StateIcon state={item.state} />
        {item.href ? (
          <Link
            to={item.href}
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            aria-label={`${item.label} — open in Results`}
          >
            {item.label}
          </Link>
        ) : (
          item.label
        )}
      </div>
      <span className="text-xs text-muted-foreground">{item.detail ?? STATE_TEXT[item.state]}</span>
    </div>
  );
}

const NO_TICKS: ReadonlySet<string> = new Set();

export function ClassChecklistSection({
  showId,
  sourceClass,
  paperwork,
  timeZone,
  onCommand,
}: {
  showId: string;
  sourceClass: SecretaryCockpitClass;
  paperwork: readonly SecretaryCockpitPaperwork[];
  timeZone: string;
  onCommand: (commandId: string) => void;
}) {
  // MYK9-1032/1031: preliminary results, result labels and the judge's sign-off link to the class on Results.
  const resultsHref = getCockpitResultsControlHref({
    showId,
    trialId: sourceClass.trialId,
    classId: sourceClass.id,
    returnTo: getShowHomeHref({
      showId,
      state: { filter: 'all', focusedClassId: sourceClass.id },
    }),
  });
  const items = buildClassChecklist({ ...sourceClass, paperwork, resultsHref });
  const checklistIds = new Set<string>(items.map(item => item.id));
  const otherPaperwork = paperwork.filter(item => !checklistIds.has(item.reportId));
  const summary = summarizeClassChecklist(items);
  // Sheets ticked for one batch, and the sheets the open print panel is showing. Print on a row
  // previews just that sheet; "Print selected" previews every ticked sheet in one panel. Both
  // belong to the class they were made for: this section stays mounted while the focused class
  // changes on desktop, and a selection made for one class must never print another.
  const classId = sourceClass.id;
  const [tickedFor, setTickedFor] = useState<{ classId: string; ids: ReadonlySet<string> }>({
    classId,
    ids: new Set(),
  });
  const [printFor, setPrintFor] = useState<{ classId: string; ids: readonly string[] } | null>(
    null
  );
  // A class change spends both for good (reset during render), so returning to the class later
  // does not bring an old selection back either.
  if (tickedFor.classId !== classId) setTickedFor({ classId, ids: NO_TICKS });
  if (printFor && printFor.classId !== classId) setPrintFor(null);
  const ticked: ReadonlySet<string> = tickedFor.classId === classId ? tickedFor.ids : NO_TICKS;
  const printIds = printFor?.classId === classId ? printFor.ids : null;
  const setPrintIds = (ids: readonly string[] | null) =>
    setPrintFor(ids === null ? null : { classId, ids });
  const printable = [...items.map(item => item.paperwork), ...otherPaperwork].filter(
    (item): item is SecretaryCockpitPaperwork => Boolean(item?.printHref)
  );
  const labelFor = new Map<string, string>(items.map(item => [item.id, item.label]));
  const panelItems = printable
    .filter(item => printIds?.includes(item.reportId))
    .map(item => ({ ...item, label: labelFor.get(item.reportId) ?? item.label }));
  const tickedPrintable = printable.filter(item => ticked.has(item.reportId));
  const rowProps = (item: SecretaryCockpitPaperwork) =>
    item.printHref
      ? {
          onPrint: () => setPrintIds([item.reportId]),
          selected: ticked.has(item.reportId),
          onSelectedChange: (checked: boolean) =>
            setTickedFor(current => {
              const next = new Set(current.classId === classId ? current.ids : NO_TICKS);
              if (checked) next.add(item.reportId);
              else next.delete(item.reportId);
              return { classId, ids: next };
            }),
        }
      : {};

  return (
    <>
      {tickedPrintable.length > 0 && (
        <Button
          type="button"
          className="mt-2 min-h-11 w-full sm:w-auto"
          onClick={() => setPrintIds(tickedPrintable.map(item => item.reportId))}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {`Print selected (${tickedPrintable.length})`}
        </Button>
      )}
      {/* Armband labels first: exhibitors need them before check-in (owner, MYK9-1233). */}
      {otherPaperwork.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Other paperwork
          </h3>
          <div className="mt-2 space-y-2">
            {otherPaperwork.map(item => (
              <CockpitPaperworkRow
                key={item.reportId}
                item={item}
                timeZone={timeZone}
                onCommand={onCommand}
                {...rowProps(item)}
              />
            ))}
          </div>
        </section>
      )}
      {items.length > 0 && (
        <section aria-labelledby="class-checklist-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3
              id="class-checklist-heading"
              className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Class checklist
            </h3>
            <span className="text-xs font-medium text-muted-foreground">
              {summary.done} of {summary.total} done
              {summary.unknown > 0 ? ` · ${summary.unknown} unknown` : ''}
            </span>
          </div>
          <ol className="mt-2 space-y-2">
            {items.map(item => (
              <li key={item.id}>
                {item.paperwork ? (
                  <CockpitPaperworkRow
                    item={{ ...item.paperwork, label: item.label }}
                    timeZone={timeZone}
                    onCommand={onCommand}
                    {...rowProps(item.paperwork)}
                  />
                ) : (
                  <ChecklistStepRow item={item} />
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      <ClassPrintPanel
        open={printIds !== null && panelItems.length > 0}
        showId={showId}
        trialId={sourceClass.trialId}
        classId={sourceClass.id}
        classLabel={sourceClass.name}
        items={panelItems}
        onClose={() => {
          setPrintIds(null);
          setTickedFor(current => ({
            classId,
            ids: new Set(
              [...(current.classId === classId ? current.ids : NO_TICKS)].filter(
                id => !printIds?.includes(id)
              )
            ),
          }));
        }}
      />
    </>
  );
}
