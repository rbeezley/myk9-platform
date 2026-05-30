import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShowTodayBanner } from './useShowTodayBanner';
import type { ShowTodayBannerItem } from './showTodayBanner.helpers';

function formatTime(time: string | null): string {
  if (!time) return 'Time pending';
  const [hour = '', minute = ''] = time.split(':');
  const hourNumber = Number(hour);
  if (!Number.isFinite(hourNumber)) return time;
  const period = hourNumber >= 12 ? 'PM' : 'AM';
  const displayHour = hourNumber % 12 || 12;
  return `${displayHour}:${minute.padStart(2, '0')} ${period}`;
}

export function ShowTodayBanner() {
  const navigate = useNavigate();
  const { items, variant, isLoading, preFavoriteShow } = useShowTodayBanner();

  const openShow = useCallback(
    async (showId: string) => {
      try {
        await preFavoriteShow(showId);
      } catch {
        // Route anyway; /at-show mount makes the same pre-favorite attempt.
      }
      navigate(`/at-show/${showId}`);
    },
    [navigate, preFavoriteShow]
  );

  if (isLoading || variant === 'hidden') return null;

  const singleItem = items[0];
  if (variant === 'single' && singleItem) {
    return (
      <section className="border-b border-emerald-200 bg-emerald-50" aria-label="Show today">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
              <CalendarDays size={18} />
              Show today
            </div>
            <p className="mt-1 truncate text-lg font-semibold text-emerald-950">
              {singleItem.showName}
            </p>
            <p className="mt-1 flex items-center gap-1 text-sm text-emerald-800">
              <Clock size={14} />
              First class {formatTime(singleItem.earliestClassTime)}
            </p>
          </div>
          <Button type="button" onClick={() => void openShow(singleItem.showId)}>
            At the show
            <ChevronRight size={16} />
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-emerald-200 bg-emerald-50" aria-label="Shows today">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-emerald-800">
          <CalendarDays size={18} />
          Shows today
        </div>
        <div className="grid gap-2">
          {items.map(item => (
            <ShowTodayRow key={item.showId} item={item} onOpen={openShow} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ShowTodayRow({
  item,
  onOpen,
}: {
  item: ShowTodayBannerItem;
  onOpen: (showId: string) => Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={() => void onOpen(item.showId)}
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-md border border-emerald-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-emerald-950">{item.showName}</span>
        <span className="mt-0.5 flex items-center gap-1 text-sm text-emerald-800">
          <Clock size={14} />
          First class {formatTime(item.earliestClassTime)}
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-emerald-700" />
    </button>
  );
}
