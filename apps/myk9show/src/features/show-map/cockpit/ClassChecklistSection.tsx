import { CheckCircle2, CircleHelp, Clock3, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { getCockpitResultsControlHref, getShowHomeHref } from './cockpitRoutes';
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
  // MYK9-1032/1031: preliminary results, ribbon labels and the judge's sign-off link to the class on Results.
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

  return (
    <>
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
                  />
                ) : (
                  <ChecklistStepRow item={item} />
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

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
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
