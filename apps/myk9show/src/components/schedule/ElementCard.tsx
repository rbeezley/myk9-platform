import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/status';
import type { ElementSummary } from './schedule-timeline.types';
import { formatStartTime } from './schedule-timeline.utils';
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
  /**
   * When true (manager Setup surface only), start times render as inline
   * editors writing through the replication layer. Defaults to false so any
   * consumer that forgets the prop gets the safe read-only card.
   */
  canEditSchedule?: boolean | undefined;
}

function ElementTitleRow({ element }: { element: ElementSummary }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-card-foreground">{element.element}</span>
      <StatusBadge
        family="class"
        status={element.status}
        className="rounded px-1.5 py-0.5 text-xs"
        variant="outline"
      />
    </div>
  );
}

export function ElementCard({
  element,
  href,
  ariaLabel,
  entryCount,
  showId,
  trialId,
  canEditSchedule = false,
}: ElementCardProps) {
  if (!canEditSchedule) {
    // Read-only surfaces (exhibitor/public show overview): the whole card is
    // the Link and start times are plain text. Multi-level elements list each
    // level's own time — element.startTime is only the earliest, and hiding
    // the later class times would misinform exhibitors planning their day.
    const distinctLevelTimes = new Set(element.levels.map(level => level.startTime ?? ''));
    const showPerLevelTimes = element.levels.length > 1 && distinctLevelTimes.size > 1;
    const summaryParts = [
      ...(showPerLevelTimes ? [] : [formatStartTime(element.startTime) ?? 'Start Time: TBD']),
      ...(element.levelRange ? [element.levelRange] : []),
      ...(typeof entryCount === 'number'
        ? [`${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`]
        : []),
    ];

    return (
      <Link
        to={href}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="block w-full rounded-md border border-border bg-card p-2 text-left transition-colors hover:bg-accent"
      >
        <ElementTitleRow element={element} />
        {summaryParts.length > 0 && (
          <div className="mt-0.5 text-xs text-muted-foreground">{summaryParts.join(' · ')}</div>
        )}
        {showPerLevelTimes && (
          <ul className="mt-0.5 text-xs text-muted-foreground" data-testid="per-level-times">
            {element.levels.map(level => (
              <li key={level.classId}>
                {level.level}: {formatStartTime(level.startTime) ?? 'TBD'}
              </li>
            ))}
          </ul>
        )}
      </Link>
    );
  }

  const hasMultipleLevels = element.levels.length > 1;

  return (
    <div className="w-full rounded-md border border-border bg-card p-2 transition-colors hover:bg-accent">
      {/* Link wraps only the title/status area — the start-time rows below have
          their own interactive controls, and a button can't nest inside an anchor. */}
      <Link
        to={href}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="block rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ElementTitleRow element={element} />
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
