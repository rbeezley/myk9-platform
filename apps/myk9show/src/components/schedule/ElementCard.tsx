import { Link } from 'react-router-dom';
import { CLASS_STATUS } from '@myk9/core';
import { StatusBadge } from '@/components/status';
import type { ElementSummary, LevelDetail } from './schedule-timeline.types';
import { formatStartTime } from './schedule-timeline.utils';
import { ClassStartTimeEditor } from './ClassStartTimeEditor';

/**
 * Display label for one level row. The bare level ("Novice") is ambiguous when
 * sectioned classes share it (Novice A vs Novice B, ASCA base vs Level C) —
 * fall back to the full class name whenever another level in the element
 * carries the same level string.
 */
function levelRowLabel(level: LevelDetail, levels: readonly LevelDetail[]): string {
  const duplicated = levels.filter(l => l.level === level.level).length > 1;
  return duplicated ? level.className : level.level;
}

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
  /** All class levels in the trial, used for judge/time conflict validation. */
  trialLevels?: readonly LevelDetail[] | undefined;
}

function judgeSummary(levels: readonly LevelDetail[]): string {
  const names = [...new Set(levels.map(level => level.judgeName).filter(Boolean))];
  if (names.length === 0) return 'Judge unassigned';
  return `${names.length === 1 ? 'Judge' : 'Judges'} ${names.join(', ')}`;
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
  trialLevels = element.levels,
}: ElementCardProps) {
  if (!canEditSchedule) {
    // Read-only surfaces (exhibitor/public show overview): the whole card is
    // the Link and start times are plain text. Multi-level elements list each
    // level's own time — element.startTime is only the earliest, and hiding
    // the later class times would misinform exhibitors planning their day.
    const distinctLevelTimes = new Set(element.levels.map(level => level.startTime ?? ''));
    // Per-level rows also render when any level is cancelled — the aggregate
    // badge ignores cancelled levels, so a cancelled class sharing the active
    // levels' time would otherwise present as scheduled with no signal.
    const hasCancelledLevel = element.levels.some(level => level.status === CLASS_STATUS.CANCELLED);
    const showPerLevelTimes =
      element.levels.length > 1 && (distinctLevelTimes.size > 1 || hasCancelledLevel);
    const summaryParts = [
      ...(showPerLevelTimes
        ? []
        : [
            element.status === CLASS_STATUS.CANCELLED
              ? 'Cancelled'
              : (formatStartTime(element.startTime) ?? 'Start Time: TBD'),
          ]),
      ...(element.levelRange ? [element.levelRange] : []),
      judgeSummary(element.levels),
      ...(typeof entryCount === 'number'
        ? [`${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`]
        : []),
    ];

    return (
      <Link
        to={href}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="block min-h-11 w-full rounded-md border border-border bg-card p-2 text-left transition-colors hover:bg-accent"
      >
        <ElementTitleRow element={element} />
        {summaryParts.length > 0 && (
          <div className="mt-0.5 text-xs text-muted-foreground">{summaryParts.join(' · ')}</div>
        )}
        {showPerLevelTimes && (
          <ul className="mt-0.5 text-xs text-muted-foreground" data-testid="per-level-times">
            {element.levels.map(level => (
              <li key={level.classId}>
                {/* A canceled class must not advertise a start time — the
                    aggregate badge ignores canceled levels, so this row is
                    the only honest signal. */}
                {levelRowLabel(level, element.levels)}:{' '}
                {level.status === CLASS_STATUS.CANCELLED
                  ? 'Cancelled'
                  : (formatStartTime(level.startTime) ?? 'TBD')}
              </li>
            ))}
          </ul>
        )}
      </Link>
    );
  }

  const hasMultipleLevels = element.levels.length > 1;
  const details = [
    ...(element.levelRange ? [element.levelRange] : []),
    judgeSummary(element.levels),
    ...(typeof entryCount === 'number'
      ? [`${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`]
      : []),
  ];

  return (
    <div className="w-full rounded-md border border-border bg-card p-2 transition-colors hover:bg-accent">
      {/* Link wraps only the title/status area — the start-time rows below have
          their own interactive controls, and a button can't nest inside an anchor. */}
      <Link
        to={href}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="flex min-h-11 flex-col justify-center rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ElementTitleRow element={element} />
        {details.length > 0 && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {details.join(' · ')}
          </div>
        )}
      </Link>
      <div className="flex flex-col">
        {element.levels.map(level => {
          const label = hasMultipleLevels ? levelRowLabel(level, element.levels) : undefined;
          if (level.status === CLASS_STATUS.CANCELLED) {
            return (
              <div
                key={level.classId}
                className="flex min-h-11 items-center px-1 text-xs text-muted-foreground"
              >
                {label && <span>{label}:&nbsp;</span>}
                <span>Cancelled</span>
              </div>
            );
          }

          return (
            <ClassStartTimeEditor
              key={level.classId}
              classId={level.classId}
              startTime={level.startTime}
              showId={showId}
              trialId={trialId}
              judgeId={level.judgeId}
              judgeName={level.judgeName}
              trialLevels={trialLevels}
              label={label}
            />
          );
        })}
      </div>
    </div>
  );
}
