import { useState, type Ref } from 'react';
import { CheckCircle2, ChevronDown, CircleHelp, Clock3, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ClassChecklistState, ClassChecklistSummary } from './classChecklist';
import type { ClassStep } from './classStepBarModel';
import { classStepAccessibleName, STEP_STATE_TEXT, type ClassStepAction } from './classStepActions';

function StateIcon({ state }: { state: ClassChecklistState }) {
  if (state === 'done')
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />;
  if (state === 'reprint')
    return <RefreshCw className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />;
  if (state === 'unknown')
    return <CircleHelp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  return <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

const STEP_CLASS =
  'flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border px-2.5 py-1.5 text-left text-sm';
const TARGET_CLASS =
  'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function StepFace({
  item,
  isNext,
  actionLabel,
}: {
  item: ClassStep;
  isNext: boolean;
  actionLabel?: string | undefined;
}) {
  const detail = item.detail ?? STEP_STATE_TEXT[item.state];
  return (
    <>
      <StateIcon state={item.state} />
      <span className="font-medium">{item.label}</span>
      {isNext && (
        // Spoken as aria-current on the step, so the word stays out of the accessible name.
        <span
          aria-hidden="true"
          className="shrink-0 rounded-full bg-primary px-1.5 text-[0.65rem] font-semibold uppercase leading-5 tracking-wide text-primary-foreground"
        >
          Next
        </span>
      )}
      <span
        className="min-w-0 basis-full text-xs text-muted-foreground sm:flex-1 sm:basis-0 sm:truncate"
        title={detail}
      >
        {detail}
      </span>
      {actionLabel && (
        <span aria-hidden="true" className="shrink-0 text-xs font-medium text-primary">
          {actionLabel}
        </span>
      )}
    </>
  );
}

/**
 * The class's checklist (MYK9-2380): one summary line ("Checklist · 2 of 7 done · Next: Print
 * paperwork") with the next step's own action on it, and a "Show all steps" toggle that opens
 * every step as a one-line row. Each openable step is a real button or link.
 */
export function ClassStepBar({
  steps,
  summary,
  actionFor,
  onPrint,
  onOpenRecords,
  recordsId,
  recordsOpen,
  onEditStart,
  editorTriggerRef,
}: {
  steps: readonly ClassStep[];
  /** The checklist items' count (the Print paperwork card stands for several of them). */
  summary: ClassChecklistSummary;
  actionFor: (step: ClassStep) => ClassStepAction | null;
  onPrint: (reportId: string) => void;
  /** The Print paperwork card: reveal the print records for this class. */
  onOpenRecords: () => void;
  /** The print records' element id and whether they are open, for the Print paperwork card. */
  recordsId: string;
  recordsOpen: boolean;
  onEditStart: () => void;
  /** Lands on the editor step's button so closing the editor returns focus to it. */
  editorTriggerRef?: Ref<HTMLButtonElement>;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = recordsId + '-steps';
  // The first step not yet done is the one to do next; the rest stay quiet.
  const next = steps.find(item => item.state !== 'done');
  const nextId = next?.id;
  const nextAction = next ? actionFor(next) : null;
  const nextOpenable = next && (next.opensRecords || (nextAction && nextAction.kind !== 'blocked'));
  const nextActionLabel = next?.opensRecords ? 'Show print records' : nextAction?.label;
  const press = (step: ClassStep, action: ClassStepAction | null) => {
    if (step.opensRecords) onOpenRecords();
    else if (action?.kind === 'print') onPrint(action.reportId);
    else onEditStart();
  };
  return (
    <>
      <div
        className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
        data-testid="class-checklist-summary"
      >
        <span aria-hidden="true" className="font-semibold">
          Checklist
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        {next ? (
          <>
            <span className="font-medium text-muted-foreground">
              {summary.done} of {summary.total} done
              {summary.unknown > 0 ? ` · ${summary.unknown} unknown` : ''}
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <span>Next: {next.label}</span>
            {nextOpenable && nextAction?.kind === 'link' && (
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <Link to={nextAction.href} aria-label={`${nextAction.label}: ${next.label}`}>
                  {nextAction.label}
                </Link>
              </Button>
            )}
            {nextOpenable && nextAction?.kind !== 'link' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                ref={!expanded && nextAction?.kind === 'editor' ? editorTriggerRef : undefined}
                aria-label={`${nextActionLabel}: ${next.label}`}
                {...(next.opensRecords && {
                  'aria-controls': recordsId,
                  'aria-expanded': recordsOpen,
                })}
                onClick={() => press(next, nextAction)}
              >
                {nextActionLabel}
              </Button>
            )}
            {nextAction?.kind === 'blocked' && (
              <span className="text-xs text-muted-foreground">{nextAction.label}</span>
            )}
          </>
        ) : (
          <span className="font-medium text-muted-foreground">all {summary.total} done</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto min-h-11 gap-1.5 px-2.5"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded(open => !open)}
        >
          {expanded ? 'Hide steps' : 'Show all steps'}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </Button>
      </div>
      <ol id={listId} hidden={!expanded} className="mt-1 space-y-1.5">
        {expanded &&
          steps.map(item => {
            const action = actionFor(item);
            const openable = action !== null && action.kind !== 'blocked';
            const className = cn(
              STEP_CLASS,
              item.state === 'done' && 'border-success/30 bg-success/10',
              item.state === 'reprint' && 'border-warning/30 bg-warning/10',
              item.id === nextId && 'ring-2 ring-primary/40',
              openable && TARGET_CLASS
            );
            const current = item.id === nextId ? ({ 'aria-current': 'step' } as const) : {};
            const name = item.accessibleName ?? classStepAccessibleName(item, action);
            const isNext = item.id === nextId;
            return (
              <li key={item.id} className="min-w-0">
                {item.opensRecords ? (
                  <button
                    type="button"
                    className={cn(className, TARGET_CLASS)}
                    aria-label={name}
                    aria-controls={recordsId}
                    aria-expanded={recordsOpen}
                    onClick={onOpenRecords}
                    {...current}
                  >
                    <StepFace item={item} isNext={isNext} actionLabel="Show print records" />
                  </button>
                ) : action?.kind === 'link' ? (
                  <Link to={action.href} className={className} aria-label={name} {...current}>
                    <StepFace item={item} isNext={isNext} actionLabel={action.label} />
                  </Link>
                ) : action && action.kind !== 'blocked' ? (
                  <button
                    type="button"
                    ref={action.kind === 'editor' ? editorTriggerRef : undefined}
                    className={className}
                    aria-label={name}
                    onClick={() => press(item, action)}
                    {...current}
                  >
                    <StepFace item={item} isNext={isNext} actionLabel={action.label} />
                  </button>
                ) : (
                  <div className={className} role="group" aria-label={name} {...current}>
                    <StepFace item={item} isNext={isNext} />
                    {action?.kind === 'blocked' && (
                      <span className="basis-full text-xs text-muted-foreground">
                        {action.label}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
      </ol>
    </>
  );
}
