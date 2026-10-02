import { useMemo, useState } from 'react';
import { ChevronDown, Clock3, ExternalLink, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatTrialLabel } from '@myk9/core';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { StatusBadge } from '@/components/status';
import { NotSet } from '@/components/common/NotSet';
import { getShowMapClassHref, getShowMapTrialHref } from '@/features/show-map/showMapRoutes';
import { useScheduleTimeline } from '@/hooks/queries/useScheduleTimeline';
import { cn } from '@/lib/utils';
import { countLabel } from '@/utils/pluralize';
import { getSetupClassesHref } from '@/pages/secretary/showSetupSections';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import { ClassEntryBreakdownLine } from './ClassEntryBreakdownLine';
import { ClassStartTimeEditor } from './ClassStartTimeEditor';
import { AddTrialLink, TrialManagerLinks } from './CompactScheduleManagerLinks';
import { formatStartTime } from './schedule-timeline.utils';
import type { DayTimelineData, LevelDetail, TrialTimelineData } from './schedule-timeline.types';

// Visitors only: managers see every class, since a hidden class can't be started from here (MYK9-942).
const MAX_VISIBLE_CLASSES_PER_TRIAL = 6;

interface CompactScheduleTimelineProps {
  showId: string;
  canEditSchedule?: boolean | undefined;
  /** Manager-only and only once entries loaded; absent means show the plain entry count. */
  entryBreakdownByClassId?: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
}

const NO_ENTRIES: ClassEntryBreakdown = { entered: 0, pending: 0 };

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
  return formatTrialLabel({ name: trial.trialName, trialNumber: trial.trialNumber });
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
  breakdown,
}: {
  row: CompactClassRow;
  showId: string;
  trialId: string;
  trialLevels: readonly LevelDetail[];
  canEditSchedule: boolean;
  breakdown: ClassEntryBreakdown | undefined;
}) {
  const classHref = getShowMapClassHref(showId, trialId, row.classId);
  const timeLabel = formatStartTime(row.startTime) ?? <NotSet />;
  const judgeLabel = row.judgeName || <NotSet />;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <Link
          to={classHref}
          aria-label={`Open ${row.className}`}
          className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            {!breakdown && <span>{countLabel(row.entryCount, 'entry', 'entries')}</span>}
          </div>
        </Link>
        {breakdown && (
          <ClassEntryBreakdownLine
            breakdown={breakdown}
            showId={showId}
            trialId={trialId}
            classId={row.classId}
            className={row.className}
          />
        )}
      </div>

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
  entryBreakdownByClassId,
}: {
  day: DayTimelineData;
  trial: TrialTimelineData;
  showId: string;
  canEditSchedule: boolean;
  defaultOpen: boolean;
  entryBreakdownByClassId: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rows = useMemo(() => flattenTrialClasses(trial), [trial]);
  const visibleRows = canEditSchedule ? rows : rows.slice(0, MAX_VISIBLE_CLASSES_PER_TRIAL);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);
  const trialHref = getShowMapTrialHref(showId, trial.trialId);
  const trialLevels = trial.elements.flatMap(element => element.levels);
  const label = trialLabel(trial);
  const classCount = countLabel(rows.length, 'class', 'classes');
  const breakdownFor = (classId: string) =>
    entryBreakdownByClassId ? (entryBreakdownByClassId.get(classId) ?? NO_ENTRIES) : undefined;
  // With a breakdown, the total is the rows' entered + pending, so the header and rows agree.
  const entryTotal = rows.reduce((sum, row) => {
    const breakdown = breakdownFor(row.classId);
    return sum + (breakdown ? breakdown.entered + breakdown.pending : row.entryCount);
  }, 0);
  const trialCountLabel = canEditSchedule
    ? `${classCount} · ${countLabel(entryTotal, 'entry', 'entries')}`
    : classCount;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border border-border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:flex-nowrap"
          aria-label={`${open ? 'Collapse' : 'Expand'} ${label} on ${formatScheduleDate(day.date)}`}
        >
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 transition-transform', !open && '-rotate-90')}
            aria-hidden="true"
          />
          {/* At phone width the count pill wraps under the date instead of squeezing it; 1.75rem
              and the pill's ml-7 are the chevron (1rem) plus gap-x-3. */}
          <span className="min-w-0 flex-1 basis-[calc(100%-1.75rem)] sm:basis-0">
            <span className="block font-semibold text-foreground">{label}</span>
            <span className="block text-sm text-muted-foreground">
              {formatScheduleDate(day.date)}
              {trial.plannedStartTime ? ` · Starts ${formatStartTime(trial.plannedStartTime)}` : ''}
            </span>
          </span>
          <span className="ml-7 shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground sm:ml-0">
            {trialCountLabel}
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
                breakdown={breakdownFor(row.classId)}
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
          </div>
        )}
        {(rows.length > 0 || canEditSchedule) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4">
            {canEditSchedule && (
              <TrialManagerLinks showId={showId} trialId={trial.trialId} trialLabel={label} />
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
  entryBreakdownByClassId,
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
        {canEditSchedule && <AddTrialLink showId={showId} />}
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
        <div className="flex flex-wrap items-center gap-2">
          {canEditSchedule && <AddTrialLink showId={showId} />}
          <Link
            to={canEditSchedule ? getSetupClassesHref(showId) : `/shows/${showId}?tab=classes`}
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View all classes
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
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
              entryBreakdownByClassId={entryBreakdownByClassId}
            />
          ))
        )}
      </div>
    </Card>
  );
}
