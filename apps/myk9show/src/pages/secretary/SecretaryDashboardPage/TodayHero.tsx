import { Link } from 'react-router-dom';
import { differenceInDays } from 'date-fns';

interface ShowRef {
  id: string;
  name: string;
  startDate: string;
  entryCloseDate?: string | null;
  entryOpenDate?: string | null;
}

interface TodayHeroProps {
  todayShow: ShowRef | null;
  nextShow: ShowRef | null;
  liveClassCount: number;
  notStartedCount: number;
  closedCount: number;
}

export function TodayHero({
  todayShow,
  nextShow,
  liveClassCount,
  notStartedCount,
  closedCount,
}: TodayHeroProps) {
  if (todayShow) {
    return (
      <div className="mx-5 my-4 rounded-xl border border-success-green/30 bg-success-green/10 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-success-green">
              Show Day
            </p>
            <h2 className="text-lg font-bold text-foreground">{todayShow.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {liveClassCount} classes live · {notStartedCount} not started · {closedCount} closed
            </p>
          </div>
          <Link
            to="/secretary/day-of"
            className="rounded-md bg-success-green px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            Go to Day-of →
          </Link>
        </div>
      </div>
    );
  }

  if (nextShow) {
    const daysUntil = differenceInDays(new Date(nextShow.startDate), new Date());
    const milestone = nextShow.entryCloseDate
      ? `Entry closes ${new Date(nextShow.entryCloseDate).toLocaleDateString()}`
      : nextShow.entryOpenDate
        ? `Entries open ${new Date(nextShow.entryOpenDate).toLocaleDateString()}`
        : null;

    return (
      <div className="mx-5 my-4 rounded-xl border border-border bg-card p-4">
        <p className="mb-1 text-xs text-muted-foreground">In {daysUntil} days</p>
        <h2 className="text-lg font-bold text-foreground">{nextShow.name}</h2>
        {milestone && <p className="mt-1 text-xs text-muted-foreground">{milestone}</p>}
      </div>
    );
  }

  return (
    <div className="mx-5 my-4 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        No upcoming shows.{' '}
        <Link to="/secretary/create-show/wizard" className="text-primary hover:underline">
          Ready to create one?
        </Link>
      </p>
    </div>
  );
}
