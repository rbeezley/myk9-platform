import { getClassStatusBadgeClasses, getClassStatusDisplay } from '@myk9/core';
import type { ElementSummary } from './schedule-timeline.types';
import { formatStartTime } from './schedule-timeline.utils';

interface ElementCardProps {
  element: ElementSummary;
  onClick?: () => void;
}

export function ElementCard({ element, onClick }: ElementCardProps) {
  const badgeClasses = getClassStatusBadgeClasses(element.status);
  const formattedTime = formatStartTime(element.startTime) ?? 'Start Time: TBD';

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-border bg-card p-2 text-left transition-colors hover:bg-accent"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-card-foreground">{element.element}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${badgeClasses}`}>
          {getClassStatusDisplay(element.status).label}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {formattedTime}
        {element.levelRange && ` · ${element.levelRange}`}
      </div>
    </button>
  );
}
