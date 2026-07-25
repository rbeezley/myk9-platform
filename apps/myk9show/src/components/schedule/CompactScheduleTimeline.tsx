import { useMemo, useState } from 'react';
import { ChevronDown, Clock3, ExternalLink, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { StatusBadge } from '@/components/status';
import { getShowMapClassHref, getShowMapTrialHref } from '@/features/show-map/showMapRoutes';
import { useScheduleTimeline } from '@/hooks/queries/useScheduleTimeline';
import { cn } from '@/lib/utils';
import { ClassStartTimeEditor } from './ClassStartTimeEditor';
import { formatStartTime } from './schedule-timeline.utils';
import type { DayTimelineData, LevelDetail, TrialTimelineData } from './schedule-timeline.types';

const MAX_VISIBLE_CLASSES_PER_TRIAL = 6;

interface CompactScheduleTimelineProps {
  showId: string;
  canEditSchedule?: boolean | undefined;
}

interface CompactClassRow extends LevelDetail {
  element: string;
}

function formatScheduleDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function trialLabel(trial: TrialTimelineData): string {
  return trial.trialNumber ? `Trial ${trial.trialNumber}` : 'Trial';
}

function flattenTrialClasses(trial: TrialTimelineData): CompactClassRow[] {
  return trial.elements.flatMap(element =>
    element.levels.map(level => ({ ...level, element: element.element }))
  );
}

function CompactClassRowView({
  row,
  showId,
  trialId,
  trialLevels,
  canEditSchedule,
}: {
  row: CompactClassRow;
  showId: string;
  trialId: string;
  trialLevels: readonly LevelDetail[];
  canEditSchedule: boolean;
}) {
  const classHref = getShowMapClassHref(showId, trialId, row.classId);
  const timeLabel = formatStartTime(row.startTime) ?? 'Start time TBD';
  const judgeLabel = row.judgeName || 'Judge TBD';

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <Link
        to={classHref}
        aria-label={`Open ${row.className}`}
        className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-card-foreground">{row.className}</span>
          <StatusBadge
            family="class"
            status={row.status}
            variant="outline"
            className="px-1.5 py-0.5 text-xs"
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            {canEditSchedule ? 'Scheduled' : timeLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            {judgeLabel}
          </span>
          <span>
            {row.entryCount} {row.entryCount === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </Link>

      {canEditSchedule ? (
        <ClassStartTimeEditor
          classId={row.classId}
          startTime={row.startTime}
          showId={showId}
          trialId={trialId}
          judgeId={row.judgeId}
          judgeName={row.judgeName}
          trialLevels={trialLevels}
          label="Start"
          className="self-start sm:self-auto"
        />
      ) : (
        <span className="shrink-0 text-sm font-medium text-foreground sm:min-w-24 sm:text-right">
          {timeLabel}
        </span>
      )}
    </div>
  );
}

function CompactTrialGroup({
  day,
  trial,
  showId,
  canEditSchedule,
  defaultOpen,
}: {
  day: DayTimelineData;
  trial: TrialTimelineData;
  showId: string;
  canEditSchedule: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rows = useMemo(() => flattenTrialClasses(trial), [trial]);
  const visibleRows = rows.slice(0, MAX_VISIBLE_CLASSES_PER_TRIAL);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);
  const trialHref = getShowMapTrialHref(showId, trial.trialId);
  const trialLevels = trial.elements.flatMap(element => element.levels);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border border-border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          aria-label={`${open ? 'Collapse' : 'Expand'} ${trialLabel(trial)} on ${formatScheduleDate(day.date)}`}
        >
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 transition-transform', !open && '-rotate-90')}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">{trialLabel(trial)}</span>
            <span className="block text-sm text-muted-foreground">
              {formatScheduleDate(day.date)}
              {trial.plannedStartTime ? ` · Starts ${formatStartTime(trial.plannedStartTime)}` : ''}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'class' : 'classes'}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-3 py-3 sm:px-4">
        {rows.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">No classes scheduled.</p>
        ) : (
          <div className="space-y-2">
            {visibleRows.map(row => (
              <CompactClassRowView
                key={row.classId}
                row={row}
                showId={showId}
                trialId={trial.trialId}
                trialLevels={trialLevels}
                canEditSchedule={canEditSchedule}
              />
            ))}
            {hiddenCount > 0 && (
              <Link
                to={`/shows/${showId}?tab=classes`}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                View {hiddenCount} more {hiddenCount === 1 ? 'class' : 'classes'}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            <Link
              to={trialHref}
              className="inline-flex min-h-11 items-center gap-1 px-1 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View trial details
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CompactScheduleTimeline({
  showId,
  canEditSchedule = false,
}: CompactScheduleTimelineProps) {
  const { data, isLoading, error, refetch } = useScheduleTimeline(showId);
  const trialCount = data?.reduce((count, day) => count + day.trials.length, 0) ?? 0;

  if (isLoading) {
    return (
      <Card className="space-y-3 p-4" data-testid="compact-schedule-skeleton" aria-busy="true">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-semibold">Show schedule</h2>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-destructive">We couldn’t load the schedule.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-11 rounded px-2 text-sm font-medium text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again
          </button>
        </div>
      </Card>
    );
  }

  if (!data || trialCount === 0) {
    return (
      <Card className="space-y-2 p-4">
        <h2 className="text-lg font-semibold">Show schedule</h2>
        <p className="text-sm text-muted-foreground">No schedule is available yet.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Show schedule</h2>
          <p className="text-sm text-muted-foreground">
            Classes are grouped by trial. Select a class for details.
          </p>
        </div>
        <Link
          to={`/shows/${showId}?tab=classes`}
          className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all classes
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="space-y-3">
        {data.map(day =>
          day.trials.map((trial, index) => (
            <CompactTrialGroup
              key={trial.trialId}
              day={day}
              trial={trial}
              showId={showId}
              canEditSchedule={canEditSchedule}
              defaultOpen={trialCount === 1 || index === 0}
            />
          ))
        )}
      </div>
    </Card>
  );
}
