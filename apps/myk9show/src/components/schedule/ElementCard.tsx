import { StatusBadge } from '@/components/status';
import type { ElementSummary } from './schedule-timeline.types';
import { formatStartTime } from './schedule-timeline.utils';

interface ElementCardProps {
  element: ElementSummary;
  onClick?: () => void;
}

export function ElementCard({ element, onClick }: ElementCardProps) {
  const formattedTime = formatStartTime(element.startTime) ?? 'Start Time: TBD';
  const destinationLabel = `Open trial details for ${element.element}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={destinationLabel}
      title={destinationLabel}
      className="w-full rounded-md border border-border bg-card p-2 text-left transition-colors hover:bg-accent"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-card-foreground">{element.element}</span>
        <StatusBadge
          family="class"
          status={element.status}
          className="rounded px-1.5 py-0.5 text-xs"
          variant="outline"
        />
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {formattedTime}
        {element.levelRange && ` · ${element.levelRange}`}
      </div>
      <div className="mt-1 text-sm font-medium text-muted-foreground">Opens trial details</div>
    </button>
  );
}
