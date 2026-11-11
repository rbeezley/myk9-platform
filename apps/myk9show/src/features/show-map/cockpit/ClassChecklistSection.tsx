import { useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useTrialSecretaryOnlyReason } from '@/features/actions/TrialSecretaryAccessContext';
import {
  getCockpitPaperScoringHref,
  getCockpitResultsControlHref,
  getShowHomeHref,
} from './cockpitRoutes';
import { ClassActualStartEditor } from './ClassActualStartEditor';
import { ClassStepBar } from './ClassStepBar';
import { resolveClassStepAction } from './classStepActions';
import { ClassPrintPanel } from './ClassPrintPanel';
import { CockpitPaperworkRow } from './CockpitPaperworkRow';
import {
  buildClassChecklist,
  summarizeClassChecklist,
  type ClassChecklistItem,
} from './classChecklist';
import type { SecretaryCockpitClass, SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

const HEADING_CLASS = 'text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground';

const NO_TICKS: ReadonlySet<string> = new Set();

export function ClassChecklistSection({
  showId,
  sourceClass,
  paperwork,
  timeZone,
  onCommand,
  printTrackingInUse,
  canManageShow,
  trialDate,
  editingStart: controlledStart,
  onEditingStartChange,
}: {
  showId: string;
  sourceClass: SecretaryCockpitClass;
  paperwork: readonly SecretaryCockpitPaperwork[];
  timeZone: string;
  onCommand: (commandId: string) => void;
  /** From the cockpit snapshot (MYK9-1620). False drops "Not confirmed printed" on the rows. */
  printTrackingInUse: boolean;
  /** Class started opens the actual-start editor only for someone who can manage the show. */
  canManageShow: boolean;
  /** The trial's date, which the actual-start editor reads a typed clock time against. */
  trialDate: string;
  /**
   * The class whose actual-start editor is open. Held by the focused-class panel so the header's
   * Actual timing field opens the same editor the Class started step does.
   * Omit both and the section keeps the state itself.
   */
  editingStart?: string | null;
  onEditingStartChange?: (classId: string | null) => void;
}) {
  const returnTo = getShowHomeHref({
    showId,
    state: { statuses: [], focusedClassId: sourceClass.id },
  });
  // MYK9-1319: a complete class has ONE handoff to Results; the Judge signature step links there too.
  const resultsHref = getCockpitResultsControlHref({
    showId,
    trialId: sourceClass.trialId,
    classId: sourceClass.id,
    returnTo,
  });
  const scoringHref = getCockpitPaperScoringHref({ classId: sourceClass.id, returnTo });
  const secretaryOnlyReason = useTrialSecretaryOnlyReason();
  const items = buildClassChecklist({ ...sourceClass, paperwork });
  const checklistIds = new Set<string>(items.map(item => item.id));
  const otherPaperwork = paperwork.filter(item => !checklistIds.has(item.reportId));
  const summary = summarizeClassChecklist(items);
  const stepSheets = items.filter(item => item.paperwork);
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
  const printable = paperwork.filter(item => Boolean(item.printHref));
  const [localStart, setLocalStart] = useState<string | null>(null);
  const editingStart = onEditingStartChange ? (controlledStart ?? null) : localStart;
  const setEditingStart = onEditingStartChange ?? setLocalStart;
  // Same reset as the ticks above: the editor must not reopen on returning to a class.
  if (!onEditingStartChange && localStart !== null && localStart !== classId) setLocalStart(null);
  const startStepRef = useRef<HTMLButtonElement>(null);
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

  const actionFor = (item: ClassChecklistItem) =>
    resolveClassStepAction(item, {
      paperwork,
      canManageShow,
      scoringHref,
      resultsHref,
      secretaryOnlyReason,
    });

  return (
    <>
      {items.length > 0 && (
        <section aria-labelledby="class-checklist-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="class-checklist-heading" className={HEADING_CLASS}>
              Class checklist
            </h3>
            <span className="text-xs font-medium text-muted-foreground">
              {summary.done} of {summary.total} done
              {summary.unknown > 0 ? ` · ${summary.unknown} unknown` : ''}
            </span>
          </div>
          <ClassStepBar
            items={items}
            actionFor={actionFor}
            onPrint={reportId => setPrintIds([reportId])}
            onEditStart={() => setEditingStart(classId)}
            editorTriggerRef={startStepRef}
          />
          {canManageShow && (
            <ClassActualStartEditor
              classId={classId}
              className={sourceClass.name}
              trialDate={trialDate}
              timeZone={timeZone}
              hasStart={Boolean(sourceClass.actualStart)}
              open={editingStart === classId}
              onOpenChange={next => {
                setEditingStart(next ? classId : null);
                // Closing (save, clear or cancel) hands the keyboard back to the step that opened it.
                if (!next) startStepRef.current?.focus();
              }}
            />
          )}
        </section>
      )}
      {tickedPrintable.length > 0 && (
        <Button
          type="button"
          className="min-h-11 w-full sm:w-auto"
          onClick={() => setPrintIds(tickedPrintable.map(item => item.reportId))}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {`Print selected (${tickedPrintable.length})`}
        </Button>
      )}
      {/* Armband labels first: exhibitors need them before check-in (owner, MYK9-1233). The
          sheets behind the steps keep their print record here (Undo, history, tick to print
          together), because the step bar only opens the preview. */}
      {(otherPaperwork.length > 0 || stepSheets.length > 0) && (
        <details className="group">
          <summary className={`${HEADING_CLASS} flex min-h-11 cursor-pointer items-center`}>
            {otherPaperwork.length === 0
              ? 'Print records'
              : stepSheets.length === 0
                ? `Other paperwork (${otherPaperwork.length})`
                : `Other paperwork and print records (${otherPaperwork.length + stepSheets.length})`}
            <ChevronDown
              className="ml-2 h-4 w-4 -rotate-90 transition-transform group-open:rotate-0"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-2 space-y-2">
            {otherPaperwork.map(item => (
              <CockpitPaperworkRow
                key={item.reportId}
                item={item}
                timeZone={timeZone}
                onCommand={onCommand}
                printTrackingInUse={printTrackingInUse}
                {...rowProps(item)}
              />
            ))}
            {otherPaperwork.length > 0 && stepSheets.length > 0 && (
              <p className="pt-1 text-xs font-medium text-muted-foreground">Print records</p>
            )}
            {stepSheets.map(item => (
              <CockpitPaperworkRow
                key={item.id}
                item={{ ...item.paperwork!, label: item.label }}
                timeZone={timeZone}
                onCommand={onCommand}
                printTrackingInUse={printTrackingInUse}
                {...rowProps(item.paperwork!)}
              />
            ))}
          </div>
        </details>
      )}
      {/* INTENT: starting and scoring end on Overview; check, release, print and initials
          happen on Results. This is the one handoff between them, offered once the class is
          complete (MYK9-1319). The Judge signature step on the step bar also links to Results,
          by owner decision (MYK9-1783). It is always shown (MYK9-1620's collapsed checklist is
          gone from this view), so a class that never printed still has this handoff. */}
      {items.length > 0 && sourceClass.lifecycle === 'complete' && (
        <Button asChild variant="outline" className="min-h-11 gap-2">
          <Link to={resultsHref}>
            Continue on Results
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
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
