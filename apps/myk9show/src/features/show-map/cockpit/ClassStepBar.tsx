import { CheckCircle2, CircleHelp, Clock3, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import type { ClassChecklistItem, ClassChecklistState } from './classChecklist';
import { classStepAccessibleName, STEP_STATE_TEXT, type ClassStepAction } from './classStepActions';

function StateIcon({ state }: { state: ClassChecklistState }) {
  if (state === 'done') return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />;
  if (state === 'reprint') return <RefreshCw className="h-4 w-4 text-warning" aria-hidden="true" />;
  if (state === 'unknown')
    return <CircleHelp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  return <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

const STEP_CLASS =
  'flex min-h-11 w-full flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left text-sm';
const TARGET_CLASS =
  'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function StepFace({ item }: { item: ClassChecklistItem }) {
  return (
    <>
      <span className="flex items-center gap-1.5 font-medium">
        <StateIcon state={item.state} />
        {item.label}
      </span>
      <span className="text-xs text-muted-foreground">
        {item.detail ?? STEP_STATE_TEXT[item.state]}
      </span>
    </>
  );
}

/** The class's checklist as a row of steps; each openable step is a real button or link. */
export function ClassStepBar({
  items,
  actionFor,
  onPrint,
  onEditStart,
}: {
  items: readonly ClassChecklistItem[];
  actionFor: (item: ClassChecklistItem) => ClassStepAction | null;
  onPrint: (reportId: string) => void;
  onEditStart: () => void;
}) {
  // The first step not yet done is the one to do next; the rest stay quiet.
  const nextId = items.find(item => item.state !== 'done')?.id;
  return (
    <ol className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {items.map(item => {
        const action = actionFor(item);
        const className = cn(
          STEP_CLASS,
          item.state === 'done' && 'border-success/30 bg-success/10',
          item.state === 'reprint' && 'border-warning/30 bg-warning/10',
          item.id === nextId && 'ring-2 ring-primary/40',
          action && TARGET_CLASS
        );
        const current = item.id === nextId ? ({ 'aria-current': 'step' } as const) : {};
        const name = classStepAccessibleName(item, action);
        return (
          <li key={item.id} className="min-w-0">
            {action?.kind === 'link' ? (
              <Link to={action.href} className={className} aria-label={name} {...current}>
                <StepFace item={item} />
              </Link>
            ) : action ? (
              <button
                type="button"
                className={className}
                aria-label={name}
                onClick={() => (action.kind === 'print' ? onPrint(action.reportId) : onEditStart())}
                {...current}
              >
                <StepFace item={item} />
              </button>
            ) : (
              <div className={className} role="group" aria-label={name} {...current}>
                <StepFace item={item} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
