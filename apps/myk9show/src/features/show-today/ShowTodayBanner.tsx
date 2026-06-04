import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShowTodayBanner } from './useShowTodayBanner';
import { formatClassTime, type ShowTodayBannerItem } from './showTodayBanner.helpers';

const bannerClassName =
  'border-b border-[#b9dcc7] bg-[#f2faf5] dark:border-[#2b5d45] dark:bg-[#16221b]';
const bannerLabelClassName = 'text-[#1f6b49] dark:text-[#95d7b1]';
const bannerTitleClassName = 'text-[#143825] dark:text-[#f0fff6]';

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
      <section className={bannerClassName} aria-label="Show today">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className={`flex items-center gap-2 text-sm font-medium ${bannerLabelClassName}`}>
              <CalendarDays size={18} />
              Show today
            </div>
            <p className={`mt-1 truncate text-lg font-semibold ${bannerTitleClassName}`}>
              {singleItem.showName}
            </p>
            <p className={`mt-1 flex items-center gap-1 text-sm ${bannerLabelClassName}`}>
              <Clock size={14} />
              First class {formatClassTime(singleItem.earliestClassTime)}
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
    <section className={bannerClassName} aria-label="Shows today">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className={`mb-3 flex items-center gap-2 text-sm font-medium ${bannerLabelClassName}`}>
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
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-md border border-[#b9dcc7] bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#55a878] focus:outline-none focus:ring-2 focus:ring-[#2f7d53] focus:ring-offset-2 dark:border-[#2b5d45] dark:bg-[#101814] dark:hover:border-[#65bf88] dark:focus:ring-[#95d7b1] dark:focus:ring-offset-background"
    >
      <span className="min-w-0">
        <span className={`block truncate font-semibold ${bannerTitleClassName}`}>
          {item.showName}
        </span>
        <span className={`mt-0.5 flex items-center gap-1 text-sm ${bannerLabelClassName}`}>
          <Clock size={14} />
          First class {formatClassTime(item.earliestClassTime)}
        </span>
      </span>
      <ChevronRight size={18} className={`shrink-0 ${bannerLabelClassName}`} />
    </button>
  );
}
