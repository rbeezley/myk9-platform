import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/status';
import type { ElementSummary } from './schedule-timeline.types';
import { ClassStartTimeEditor } from './ClassStartTimeEditor';

interface ElementCardProps {
  element: ElementSummary;
  /** Canonical class (or trial, as a defensive fallback) destination for this card. */
  href: string;
  /** Accessible name describing the card's destination, e.g. "Open Container Novice". */
  ariaLabel: string;
  /** Sum of entries across the element's levels, when already available in loaded data. */
  entryCount?: number | undefined;
  showId: string;
  trialId: string;
}

export function ElementCard({
  element,
  href,
  ariaLabel,
  entryCount,
  showId,
  trialId,
}: ElementCardProps) {
  const hasMultipleLevels = element.levels.length > 1;

  return (
    <div className="w-full rounded-md border border-border bg-card p-2 transition-colors hover:bg-accent">
      {/* Link wraps only the title/status area — the start-time row below has its
          own interactive controls, and a button can't nest inside an anchor. */}
      <Link
        to={href}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="block rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        {(element.levelRange || typeof entryCount === 'number') && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {element.levelRange}
            {typeof entryCount === 'number' &&
              ` · ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`}
          </div>
        )}
      </Link>
      <div className="flex flex-col">
        {element.levels.map(level => (
          <ClassStartTimeEditor
            key={level.classId}
            classId={level.classId}
            startTime={level.startTime}
            showId={showId}
            trialId={trialId}
            label={hasMultipleLevels ? level.level : undefined}
          />
        ))}
      </div>
    </div>
  );
}
