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
      <div className="mx-5 my-4 rounded-xl border border-green-700 bg-gradient-to-br from-green-950 to-green-900 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-green-300">
              Show Day
            </p>
            <h2 className="text-lg font-bold text-white">{todayShow.name}</h2>
            <p className="mt-1 text-xs text-green-300">
              {liveClassCount} classes live · {notStartedCount} not started · {closedCount} closed
            </p>
          </div>
          <Link
            to="/secretary/day-of"
            className="rounded-md bg-green-700 px-3 py-2 text-xs font-medium text-white hover:bg-green-600"
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
      <div className="mx-5 my-4 rounded-xl border border-slate-700 bg-slate-800 p-4">
        <p className="mb-1 text-xs text-slate-400">In {daysUntil} days</p>
        <h2 className="text-lg font-bold text-slate-100">{nextShow.name}</h2>
        {milestone && <p className="mt-1 text-xs text-slate-400">{milestone}</p>}
      </div>
    );
  }

  return (
    <div className="mx-5 my-4 rounded-xl border border-dashed border-slate-700 bg-slate-900 p-6 text-center">
      <p className="text-sm text-slate-400">
        No upcoming shows.{' '}
        <Link to="/secretary/create-show/wizard" className="text-blue-400 hover:underline">
          Ready to create one?
        </Link>
      </p>
    </div>
  );
}
