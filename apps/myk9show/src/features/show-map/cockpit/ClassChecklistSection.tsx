import { CheckCircle2, CircleHelp, Clock3, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

function ChecklistStepRow({
  item,
  onCommand,
}: {
  item: ClassChecklistItem;
  onCommand: (commandId: string) => void;
}) {
  const command = item.command;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3',
        item.state === 'done' && 'border-success/30 bg-success/10'
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <StateIcon state={item.state} />
        {item.label}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {item.detail ?? STATE_TEXT[item.state]}
        </span>
        {command && (
          <Button
            type="button"
            variant="outline"
            size="touch"
            aria-label={`${command.label} — ${item.label}`}
            onClick={() => onCommand(command.commandId)}
          >
            {command.label}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ClassChecklistSection({
  sourceClass,
  paperwork,
  timeZone,
  onCommand,
}: {
  sourceClass: SecretaryCockpitClass;
  paperwork: readonly SecretaryCockpitPaperwork[];
  timeZone: string;
  onCommand: (commandId: string) => void;
}) {
  const items = buildClassChecklist({ ...sourceClass, paperwork });
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
                  <ChecklistStepRow item={item} onCommand={onCommand} />
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
