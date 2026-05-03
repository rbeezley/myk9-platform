/**
 * ShowDayHero — Orchestrator component for live show day display.
 *
 * Composes NextUpCard + ClassTimelineCard list with show header,
 * stats row, and stale data indicator.
 */

import { forwardRef, useCallback, useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CheckInStatus } from '@myk9/core';
import type { ShowDayData } from '@/types/show-day-types';
import { NextUpCard } from './NextUpCard';
import { ClassTimelineCard } from './ClassTimelineCard';
import { Activity, ChevronDown, ChevronUp, Clock, PartyPopper, CalendarCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ShowDayHeroProps {
  data: ShowDayData;
  onClassNavigate?: ((classId: string) => void) | undefined;
  /** Called when user selects a different show (multi-show day) */
  onShowSelect?: ((showId: string) => void) | undefined;
  /** Called when the user changes check-in status for an entry */
  onCheckInChange?: ((entryId: string, newStatus: CheckInStatus) => void) | undefined;
  /** Map of classId → whether self-check-in is enabled */
  selfCheckinEnabledMap?: Record<string, boolean> | undefined;
  /** Navigates to the full check-in management page for an entry */
  onManage?: ((entryId: string) => void) | undefined;
  className?: string | undefined;
}

export const ShowDayHero = forwardRef<HTMLDivElement, ShowDayHeroProps>(function ShowDayHero(
  {
    data,
    onClassNavigate,
    onShowSelect,
    onCheckInChange,
    selfCheckinEnabledMap,
    onManage,
    className,
  },
  ref
) {
  const isAllDone =
    data.stats.total > 0 && data.stats.completed === data.stats.total && !data.nextUp;

  // Edge case: show date is today but show hasn't started yet (status != 'in_progress')
  const isPreview =
    data.isShowDay && data.activeShow != null && data.activeShow.showStatus !== 'in_progress';

  // Edge case: show is in_progress but no classes have started (all pending, no scoring data)
  const isWaitingForClasses =
    !isPreview &&
    !isAllDone &&
    data.stats.total > 0 &&
    data.stats.completed === 0 &&
    data.myClasses.every(c => c.scoredEntries === 0 && !c.currentDogInRing);

  // User toggle state: null = no manual toggle yet (use default based on isAllDone)
  const [completedToggled, setCompletedToggled] = useState<boolean | null>(null);
  const completedExpanded = completedToggled ?? isAllDone;
  const toggleCompleted = () => setCompletedToggled(prev => !(prev ?? isAllDone));

  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);

  // Reset selectedShowId if it's no longer in the active shows list
  const validShowIds = useMemo(
    () => new Set(data.activeShows.map(s => s.showId)),
    [data.activeShows]
  );
  const activeShowId =
    selectedShowId && validShowIds.has(selectedShowId)
      ? selectedShowId
      : (data.activeShow?.showId ?? null);

  // Memoize filtered lists to avoid re-computing on every render
  const laterToday = useMemo(
    () =>
      data.myClasses.filter(
        c => !c.isScored && c !== data.nextUp && (activeShowId ? c.showId === activeShowId : true)
      ),
    [data.myClasses, data.nextUp, activeShowId]
  );
  const completedClasses = useMemo(
    () => data.completedToday.filter(c => (activeShowId ? c.showId === activeShowId : true)),
    [data.completedToday, activeShowId]
  );

  const handleShowSelect = useCallback(
    (showId: string) => {
      setSelectedShowId(showId);
      onShowSelect?.(showId);
    },
    [onShowSelect]
  );

  const completedSectionId = useId();

  // Pre-compute stale label to avoid calling formatDistanceToNow twice
  const staleLabel =
    data.isStale && data.lastUpdated
      ? formatDistanceToNow(data.lastUpdated, { addSuffix: true })
      : null;

  return (
    <div
      ref={ref}
      className={cn('space-y-4', className)}
      role="region"
      aria-label="Show day status"
    >
      {/* Show header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isAllDone ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full">
              <PartyPopper className="h-3.5 w-3.5" />
              <span className="text-xs font-bold uppercase tracking-wider">Done</span>
            </div>
          ) : isPreview ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full">
              <CalendarCheck className="h-3.5 w-3.5" />
              <span className="text-xs font-bold uppercase tracking-wider">Today</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-success-green/10 text-success-green rounded-full">
              <Activity className="h-3.5 w-3.5" />
              <span className="text-xs font-bold uppercase tracking-wider">Live</span>
            </div>
          )}
          <h2 className="text-lg font-bold text-foreground truncate">
            {data.activeShow?.showName ?? 'Show Day'}
          </h2>
        </div>
        {staleLabel && (
          <span
            className="flex items-center gap-1 text-xs text-warning-orange"
            role="status"
            aria-label={`Data may be outdated, last updated ${staleLabel}`}
          >
            <Clock className="h-3 w-3" />
            {staleLabel}
          </span>
        )}
      </div>

      {/* Show location */}
      {data.activeShow?.location && (
        <p className="text-sm text-muted-foreground -mt-2">{data.activeShow.location}</p>
      )}

      {/* Multi-show tabs */}
      {data.activeShows.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Show selector">
          {data.activeShows.map(show => (
            <button
              key={show.showId}
              role="tab"
              aria-selected={show.showId === activeShowId}
              onClick={() => handleShowSelect(show.showId)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors min-h-[48px]',
                show.showId === activeShowId
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {show.showName}
            </button>
          ))}
        </div>
      )}

      {/* Preview mode: show is today but hasn't started yet */}
      {isPreview && (
        <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-5 text-center">
          <h3 className="text-xl font-bold text-foreground">Your show is today!</h3>
          <p className="mt-2 text-muted-foreground">
            {data.stats.total} class{data.stats.total !== 1 ? 'es' : ''} scheduled. Live progress
            will appear once the show starts.
          </p>
        </div>
      )}

      {/* Show started but no classes in progress yet */}
      {isWaitingForClasses && (
        <div className="rounded-2xl border border-border bg-muted/30 p-5 text-center">
          <h3 className="text-lg font-semibold text-foreground">Show is starting</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No classes in progress yet. Make sure you&apos;re checked in!
          </p>
        </div>
      )}

      {/* All-completed celebration state */}
      {isAllDone && (
        <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-5 text-center">
          <h3 className="text-2xl sm:text-3xl font-bold text-foreground">All Done!</h3>
          <p className="mt-2 text-muted-foreground">
            {data.stats.total} class{data.stats.total !== 1 ? 'es' : ''} completed
            {data.stats.qualified > 0 && (
              <span className="text-success-green font-semibold">
                {' '}
                &mdash; {data.stats.qualified} Q{data.stats.qualified !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Next Up */}
      {data.nextUp && (
        <NextUpCard
          classData={data.nextUp}
          onNavigate={onClassNavigate}
          onCheckInChange={onCheckInChange}
          selfCheckinEnabled={selfCheckinEnabledMap?.[data.nextUp.classId] ?? true}
          onManage={onManage}
        />
      )}

      {/* Later Today */}
      {laterToday.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Later Today
          </h3>
          {laterToday.map(c => (
            <ClassTimelineCard
              key={c.entryId}
              classData={c}
              onNavigate={onClassNavigate}
              onCheckInChange={onCheckInChange}
              selfCheckinEnabled={selfCheckinEnabledMap?.[c.classId] ?? true}
              onManage={onManage}
            />
          ))}
        </div>
      )}

      {/* Completed (collapsed by default, expanded when all done) */}
      {completedClasses.length > 0 && (
        <div>
          <button
            type="button"
            onClick={toggleCompleted}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors min-h-[48px] w-full text-left"
            aria-expanded={completedExpanded}
            aria-controls={completedSectionId}
          >
            Completed ({completedClasses.length})
            {completedExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {completedExpanded && (
            <div id={completedSectionId} className="space-y-2 mt-2">
              {completedClasses.map(c => (
                <ClassTimelineCard key={c.entryId} classData={c} onNavigate={onClassNavigate} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mini stats row */}
      <div
        className="flex items-center gap-3 text-sm text-muted-foreground pt-1"
        role="status"
        aria-live="polite"
      >
        <span>
          {data.stats.completed} of {data.stats.total} classes done
        </span>
        {data.stats.qualified > 0 && (
          <span className="text-success-green font-medium">&bull; {data.stats.qualified} Q</span>
        )}
      </div>
    </div>
  );
});
