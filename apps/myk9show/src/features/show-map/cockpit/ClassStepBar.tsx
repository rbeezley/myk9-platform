import type { Ref } from 'react';
import { CheckCircle2, CircleHelp, Clock3, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import type { ClassChecklistState } from './classChecklist';
import type { ClassStep } from './classStepBarModel';
import { classStepAccessibleName, STEP_STATE_TEXT, type ClassStepAction } from './classStepActions';

function StateIcon({ state }: { state: ClassChecklistState }) {
  if (state === 'done') return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />;
  if (state === 'reprint') return <RefreshCw className="h-4 w-4 text-warning" aria-hidden="true" />;
  if (state === 'unknown')
    return <CircleHelp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  return <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

const STEP_CLASS =
  'flex h-[6.5rem] w-full flex-col items-start gap-0.5 overflow-hidden rounded-lg border p-2.5 text-left text-sm';
const TARGET_CLASS =
  'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function StepFace({ item, isNext }: { item: ClassStep; isNext: boolean }) {
  return (
    <>
      <span className="flex w-full min-w-0 items-center gap-1.5 font-medium">
        <StateIcon state={item.state} />
        <span className="min-w-0 line-clamp-2" title={item.label}>
          {item.label}
        </span>
        {isNext && (
          // Spoken as aria-current on the step, so the word stays out of the accessible name.
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full bg-primary px-1.5 text-[0.65rem] font-semibold uppercase leading-5 tracking-wide text-primary-foreground"
          >
            Next
          </span>
        )}
      </span>
      <span
        className="w-full truncate text-xs text-muted-foreground"
        title={item.detail ?? STEP_STATE_TEXT[item.state]}
      >
        {item.detail ?? STEP_STATE_TEXT[item.state]}
      </span>
    </>
  );
}

/** The class's checklist as a row of steps; each openable step is a real button or link. */
export function ClassStepBar({
  steps,
  actionFor,
  onPrint,
  onOpenRecords,
  onEditStart,
  editorTriggerRef,
}: {
  steps: readonly ClassStep[];
  actionFor: (step: ClassStep) => ClassStepAction | null;
  onPrint: (reportId: string) => void;
  /** The Print paperwork card: reveal the print records for this class. */
  onOpenRecords: () => void;
  onEditStart: () => void;
  /** Lands on the editor step's button so closing the editor returns focus to it. */
  editorTriggerRef?: Ref<HTMLButtonElement>;
}) {
  // The first step not yet done is the one to do next; the rest stay quiet.
  const nextId = steps.find(item => item.state !== 'done')?.id;
  return (
    <ol className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
      {steps.map(item => {
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
        return (
          <li key={item.id} className="min-w-0">
            {item.opensRecords ? (
              <button
                type="button"
                className={cn(className, TARGET_CLASS)}
                aria-label={name}
                onClick={onOpenRecords}
                {...current}
              >
                <StepFace item={item} isNext={item.id === nextId} />
              </button>
            ) : action?.kind === 'link' ? (
              <Link to={action.href} className={className} aria-label={name} {...current}>
                <StepFace item={item} isNext={item.id === nextId} />
              </Link>
            ) : action && action.kind !== 'blocked' ? (
              <button
                type="button"
                ref={action.kind === 'editor' ? editorTriggerRef : undefined}
                className={className}
                aria-label={name}
                onClick={() => (action.kind === 'print' ? onPrint(action.reportId) : onEditStart())}
                {...current}
              >
                <StepFace item={item} isNext={item.id === nextId} />
              </button>
            ) : (
              <div className={className} role="group" aria-label={name} {...current}>
                <StepFace item={item} isNext={item.id === nextId} />
                {action?.kind === 'blocked' && (
                  <span
                    className="w-full truncate text-xs text-muted-foreground"
                    title={action.label}
                  >
                    {action.label}
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
