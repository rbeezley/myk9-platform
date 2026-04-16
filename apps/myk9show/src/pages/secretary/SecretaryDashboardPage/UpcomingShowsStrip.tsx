import { differenceInDays } from 'date-fns';

interface UpcomingShow {
  id: string;
  name: string;
  startDate: string;
  entryCloseDate?: string | null;
}

interface UpcomingShowsStripProps {
  shows: UpcomingShow[];
}

export function UpcomingShowsStrip({ shows }: UpcomingShowsStripProps) {
  if (shows.length < 2) return null;

  const displayed = shows.slice(0, 3);

  return (
    <div className="flex gap-2 px-5 pb-3">
      {displayed.map(show => {
        const daysUntil = differenceInDays(new Date(show.startDate), new Date());
        const daysUntilClose = show.entryCloseDate
          ? differenceInDays(new Date(show.entryCloseDate), new Date())
          : null;
        const deadlineUrgent =
          daysUntilClose !== null && daysUntilClose <= 7 && daysUntilClose >= 0;

        return (
          <div
            key={show.id}
            className={`flex-1 rounded-lg border bg-slate-800 p-3 ${
              deadlineUrgent ? 'border-amber-500' : 'border-slate-700'
            }`}
          >
            <p className="text-xs text-slate-400">In {daysUntil} days</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-100">{show.name}</p>
            {deadlineUrgent && (
              <p className="mt-1 text-xs text-amber-400">Entry closes in {daysUntilClose} days</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
