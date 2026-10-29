import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import { ArrowRight, Pencil, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/base/Chip';
import { toLocalDate } from '@/lib/format/dates';
import { ShowDateVenueLine } from './ShowDateVenueLine';
import { ShowPinButton, type ShowPin } from './ShowPinButton';
import type { TodayClassCounts } from './todayClassCounts';
import type { Show } from '@/types/show-types';
import type { ShowPhase } from '@/hooks/useMyShows';

interface ShowPhaseCardProps {
  show: Show;
  phase: ShowPhase;
  /** This show's class stats, today phase only; null/omitted hides the line. */
  classCounts?: TodayClassCounts | null | undefined;
  /** The show's live entry count (MYK9-1311); null/omitted when unknown, never a placeholder 0. */
  entryCount?: number | null | undefined;
  /** The rail pin, for a show still in Managing (MYK9-1490); omitted offers none. */
  pin?: ShowPin | undefined;
}

function EntryCountLine({ entryCount }: { entryCount: number | null | undefined }) {
  if (entryCount == null) return null;
  return (
    <p data-testid="show-card-entry-count" className="text-xs text-muted-foreground mt-0.5">
      {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
    </p>
  );
}

// Setup and Show Day are the show home now (MYK9-957).
const workbenchHref = (showId: string) => `/shows/${showId}`;

/** The card's buttons: the pin (when offered) beside its one action. */
function CardActions({
  show,
  pin,
  children,
}: Pick<ShowPhaseCardProps, 'show' | 'pin'> & { children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {pin && <ShowPinButton showName={show.name} pin={pin} />}
      {children}
    </div>
  );
}

function TodayCard({
  show,
  classCounts,
  entryCount,
  pin,
}: Pick<ShowPhaseCardProps, 'show' | 'classCounts' | 'entryCount' | 'pin'>) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Chip color="red" size="sm">
            Live today
          </Chip>
        </div>
        <p className="text-base font-semibold text-foreground truncate">{show.name}</p>
        <ShowDateVenueLine show={show} />
        {classCounts && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {classCounts.live} live · {classCounts.notStarted} not started · {classCounts.closed}{' '}
            closed
          </p>
        )}
        <EntryCountLine entryCount={entryCount} />
      </div>
      <CardActions show={show} pin={pin}>
        <Button asChild size="touch" className="shrink-0">
          <Link to={workbenchHref(show.id)}>
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Go to show
          </Link>
        </Button>
      </CardActions>
    </div>
  );
}

function UpcomingCard({
  show,
  entryCount,
  pin,
}: Pick<ShowPhaseCardProps, 'show' | 'entryCount' | 'pin'>) {
  const daysUntil = differenceInDays(toLocalDate(show.startDate), new Date());
  const daysUntilClose = show.entryCloseDate
    ? differenceInDays(toLocalDate(show.entryCloseDate), new Date())
    : null;
  const deadlineUrgent = daysUntilClose !== null && daysUntilClose <= 7 && daysUntilClose >= 0;
  const entriesOpen = show.status === 'published';

  return (
    <div
      className={`flex items-center gap-4 rounded-xl border bg-card px-5 py-4 ${deadlineUrgent ? 'border-warning/50' : 'border-border'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Chip color="green" size="sm">
            {entriesOpen ? 'Entries open' : 'Entries closed'}
          </Chip>
          <span className="text-xs text-muted-foreground">
            In {daysUntil} {daysUntil === 1 ? 'day' : 'days'}
          </span>
          {deadlineUrgent && (
            <Chip color="amber" size="sm">
              Closes in {daysUntilClose}d
            </Chip>
          )}
          {!deadlineUrgent &&
            daysUntilClose !== null &&
            daysUntilClose <= 14 &&
            daysUntilClose >= 0 && (
              <span className="text-xs text-warning">
                Entries close in {daysUntilClose} {daysUntilClose === 1 ? 'day' : 'days'}
              </span>
            )}
        </div>
        <p className="text-base font-semibold text-foreground truncate">{show.name}</p>
        <ShowDateVenueLine show={show} />
        <EntryCountLine entryCount={entryCount} />
      </div>
      <CardActions show={show} pin={pin}>
        <Button asChild variant="outline" size="touch" className="shrink-0">
          <Link to={workbenchHref(show.id)}>
            Manage
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardActions>
    </div>
  );
}

function DraftCard({
  show,
  entryCount,
  pin,
}: Pick<ShowPhaseCardProps, 'show' | 'entryCount' | 'pin'>) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-5 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Chip color="amber" size="sm">
            Draft
          </Chip>
        </div>
        <p className="text-base font-semibold text-foreground truncate">{show.name}</p>
        <ShowDateVenueLine show={show} />
        <EntryCountLine entryCount={entryCount} />
        <p className="text-xs text-muted-foreground mt-0.5">
          Not visible to exhibitors until published
        </p>
      </div>
      <CardActions show={show} pin={pin}>
        <Button asChild size="touch" className="shrink-0">
          <Link to={workbenchHref(show.id)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Continue setup
          </Link>
        </Button>
      </CardActions>
    </div>
  );
}

function PastCard({ show, entryCount }: Pick<ShowPhaseCardProps, 'show' | 'entryCount'>) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{show.name}</p>
        <ShowDateVenueLine show={show} />
        <EntryCountLine entryCount={entryCount} />
      </div>
      <Button asChild variant="ghost" size="touch" className="shrink-0 text-muted-foreground">
        <Link to={workbenchHref(show.id)}>
          View
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

export function ShowPhaseCard({ show, phase, classCounts, entryCount, pin }: ShowPhaseCardProps) {
  switch (phase) {
    case 'today':
      return <TodayCard show={show} classCounts={classCounts} entryCount={entryCount} pin={pin} />;
    case 'upcoming':
      return <UpcomingCard show={show} entryCount={entryCount} pin={pin} />;
    case 'draft':
      return <DraftCard show={show} entryCount={entryCount} pin={pin} />;
    case 'past':
      return <PastCard show={show} entryCount={entryCount} />;
  }
}
