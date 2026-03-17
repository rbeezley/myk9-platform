import { CLASS_STATUS } from '@myk9/core';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import type { ElementSummary } from './schedule-timeline.types';
import { LevelRow } from './LevelRow';

interface ElementAccordionProps {
  element: ElementSummary;
  showId?: string;
  trialId?: string;
  onNavigateToClass?: (classId: string) => void;
}

export function ElementAccordion({ element, onNavigateToClass }: ElementAccordionProps) {
  const isInProgress = element.status === CLASS_STATUS.IN_PROGRESS;
  const isComplete = element.status === CLASS_STATUS.COMPLETED;
  const completedCount = element.levels.filter(l => l.status === CLASS_STATUS.COMPLETED).length;
  const totalCount = element.levels.filter(l => l.status !== CLASS_STATUS.CANCELLED).length;
  const progressLabel = isComplete
    ? `${totalCount}/${totalCount} ✓`
    : `${completedCount}/${totalCount}`;

  const formattedTime = element.startTime
    ? new Date(`1970-01-01T${element.startTime}`).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'TBD';

  return (
    <Collapsible defaultOpen={isInProgress}>
      <div className="rounded-md border border-border bg-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-2.5 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground transition-transform [[data-open]_&]:rotate-90">
              ▶
            </span>
            <span className="text-sm font-medium text-card-foreground">{element.element}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{formattedTime}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                isComplete
                  ? 'bg-green-500/10 text-green-500'
                  : isInProgress
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {progressLabel}
            </span>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="ml-4 border-l-2 border-border pb-2 pl-2.5">
            {element.levels.map(level => (
              <LevelRow
                key={level.classId}
                level={level}
                onClick={() => onNavigateToClass?.(level.classId)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
