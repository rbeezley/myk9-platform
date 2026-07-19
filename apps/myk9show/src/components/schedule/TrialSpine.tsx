import { Link } from 'react-router-dom';
import type { TrialTimelineData, ElementSummary } from './schedule-timeline.types';
import { formatStartTime } from './schedule-timeline.utils';
import { StatusDot } from './StatusDot';
import { ElementCard } from './ElementCard';
import { getShowMapClassHref, getShowMapTrialHref } from '@/features/show-map/showMapRoutes';

interface TrialSpineProps {
  trial: TrialTimelineData;
  showId: string;
}

/**
 * Resolves the class-details destination for an element card.
 *
 * An "element" (e.g. Container) can roll up more than one level's class
 * within a trial (Novice, Advanced, ...); the compact card can only link to
 * one place, so it targets the earliest-progression level's class. When no
 * level/classId is available (defensive — shouldn't happen for real data),
 * it falls back to the trial page so the card is never a dead link.
 */
function getElementDestination(
  trialHref: string,
  showId: string,
  trialId: string,
  el: ElementSummary
) {
  const primaryLevel = el.levels[0];
  if (!primaryLevel) {
    return { href: trialHref, ariaLabel: `Open ${el.element}` };
  }

  const href = getShowMapClassHref(showId, trialId, primaryLevel.classId);
  const levelSuffix =
    primaryLevel.level && primaryLevel.level !== el.element ? ` ${primaryLevel.level}` : '';
  const ariaLabel = `Open ${el.element}${levelSuffix}`;
  const entryCount = el.levels.reduce((sum, l) => sum + l.entryCount, 0);

  return { href, ariaLabel, entryCount };
}

export function TrialSpine({ trial, showId }: TrialSpineProps) {
  const formattedStartTime = formatStartTime(trial.plannedStartTime);
  const trialHref = getShowMapTrialHref(showId, trial.trialId);

  const trialLabel = trial.trialNumber
    ? /^\d+$/.test(trial.trialNumber)
      ? `Trial ${trial.trialNumber}`
      : trial.trialNumber
    : 'Trial';

  return (
    <div>
      <Link
        to={trialHref}
        className="mb-2 block w-fit rounded-sm text-xs uppercase tracking-wide text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {trialLabel}
        {formattedStartTime && ` · ${formattedStartTime}`}
      </Link>

      {trial.elements.length === 0 ? (
        <p className="text-xs text-muted-foreground">No classes scheduled</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {trial.elements.map((el, i) => {
            const { href, ariaLabel, entryCount } = getElementDestination(
              trialHref,
              showId,
              trial.trialId,
              el
            );

            return (
              <div key={el.element} className="flex items-center gap-3">
                {/* Dot + connecting line segments (0.375rem = half of parent gap-1.5, bridges the gap between rows) */}
                <div className="relative flex shrink-0 items-center self-stretch justify-center w-2.5">
                  <StatusDot status={el.status} className="relative z-10" />
                  {i < trial.elements.length - 1 && (
                    <div className="absolute top-1/2 bottom-[-0.375rem] left-1/2 w-0.5 -translate-x-1/2 bg-border" />
                  )}
                  {i > 0 && (
                    <div className="absolute top-[-0.375rem] bottom-1/2 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
                  )}
                </div>
                <div className="flex-1">
                  <ElementCard
                    element={el}
                    href={href}
                    ariaLabel={ariaLabel}
                    entryCount={entryCount}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
