import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/status';
import type { ElementSummary } from './schedule-timeline.types';
import { formatStartTime } from './schedule-timeline.utils';

interface ElementCardProps {
  element: ElementSummary;
  /** Canonical class (or trial, as a defensive fallback) destination for this card. */
  href: string;
  /** Accessible name describing the card's destination, e.g. "Open Container Novice". */
  ariaLabel: string;
  /** Sum of entries across the element's levels, when already available in loaded data. */
  entryCount?: number | undefined;
}

export function ElementCard({ element, href, ariaLabel, entryCount }: ElementCardProps) {
  const formattedTime = formatStartTime(element.startTime) ?? 'Start Time: TBD';

  return (
    <Link
      to={href}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="block w-full rounded-md border border-border bg-card p-2 text-left transition-colors hover:bg-accent"
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
        {typeof entryCount === 'number' &&
          ` · ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`}
      </div>
    </Link>
  );
}
