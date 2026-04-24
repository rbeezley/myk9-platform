import { Link } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import { ArrowRight, Pencil, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/base/Chip';
import { formatDateRange, toLocalDate } from '@/utils/date-format';
import type { Show } from '@/types/show-types';
import type { ShowPhase } from '@/hooks/useMyShows';

interface ShowPhaseCardProps {
  show: Show;
  phase: ShowPhase;
  /** Class stats — only used for the today phase */
  liveClassCount?: number | undefined;
  notStartedCount?: number | undefined;
  closedCount?: number | undefined;
}

function TodayCard({
  show,
  liveClassCount = 0,
  notStartedCount = 0,
  closedCount = 0,
}: Pick<ShowPhaseCardProps, 'show' | 'liveClassCount' | 'notStartedCount' | 'closedCount'>) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Chip color="red" size="sm">
            Live today
          </Chip>
        </div>
        <p className="text-base font-semibold text-foreground truncate">{show.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {liveClassCount} live · {notStartedCount} not started · {closedCount} closed
        </p>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link to={`/shows/${show.id}`}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Go to show
        </Link>
      </Button>
    </div>
  );
}

function UpcomingCard({ show }: Pick<ShowPhaseCardProps, 'show'>) {
  const daysUntil = differenceInDays(toLocalDate(show.startDate), new Date());
  const daysUntilClose = show.entryCloseDate
    ? differenceInDays(toLocalDate(show.entryCloseDate), new Date())
    : null;
  const deadlineUrgent = daysUntilClose !== null && daysUntilClose <= 7 && daysUntilClose >= 0;
  const entriesOpen = show.status === 'published';

  return (
    <div
      className={`flex items-center gap-4 rounded-xl border bg-card px-5 py-4 ${deadlineUrgent ? 'border-warning-orange/50' : 'border-border'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Chip color="green" size="sm">
            {entriesOpen ? 'Entries open' : 'Entries closed'}
          </Chip>
          <span className="text-xs text-muted-foreground">In {daysUntil} {daysUntil === 1 ? 'day' : 'days'}</span>
          {deadlineUrgent && (
            <Chip color="amber" size="sm">
              Closes in {daysUntilClose}d
            </Chip>
          )}
          {!deadlineUrgent &&
            daysUntilClose !== null &&
            daysUntilClose <= 14 &&
            daysUntilClose >= 0 && (
              <span className="text-xs text-warning-orange">
                Entries close in {daysUntilClose} {daysUntilClose === 1 ? 'day' : 'days'}
              </span>
            )}
        </div>
        <p className="text-base font-semibold text-foreground truncate">{show.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDateRange(show.startDate, show.endDate, 'short', false)} · {show.location}
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link to={`/shows/${show.id}`}>
          Manage
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function DraftCard({ show }: Pick<ShowPhaseCardProps, 'show'>) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-5 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Chip color="amber" size="sm">
            Draft
          </Chip>
          <span className="text-xs text-muted-foreground">
            {toLocalDate(show.startDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
        <p className="text-base font-semibold text-foreground truncate">{show.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Not visible to exhibitors until published
        </p>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link to={`/shows/${show.id}`}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Continue setup
        </Link>
      </Button>
    </div>
  );
}

function PastCard({ show }: Pick<ShowPhaseCardProps, 'show'>) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{show.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDateRange(show.startDate, show.endDate, 'short', false)} · {show.location}
        </p>
      </div>
      <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
        <Link to={`/shows/${show.id}`}>
          View
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

export function ShowPhaseCard({
  show,
  phase,
  liveClassCount,
  notStartedCount,
  closedCount,
}: ShowPhaseCardProps) {
  switch (phase) {
    case 'today':
      return (
        <TodayCard
          show={show}
          liveClassCount={liveClassCount}
          notStartedCount={notStartedCount}
          closedCount={closedCount}
        />
      );
    case 'upcoming':
      return <UpcomingCard show={show} />;
    case 'draft':
      return <DraftCard show={show} />;
    case 'past':
      return <PastCard show={show} />;
  }
}
