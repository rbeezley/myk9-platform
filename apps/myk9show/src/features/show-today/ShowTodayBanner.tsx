import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShowTodayBanner } from './useShowTodayBanner';
import { formatClassTime, type ShowTodayBannerItem } from './showTodayBanner.helpers';

const bannerClassName =
  'overflow-hidden rounded-lg border border-l-4 border-emerald-500/20 border-l-emerald-500 bg-emerald-500/8 text-left shadow-sm ring-1 ring-emerald-500/10 dark:bg-emerald-500/10';
const bannerLabelClassName = 'text-emerald-700 dark:text-emerald-300';
const bannerTitleClassName = 'text-emerald-950 dark:text-emerald-50';
const iconClassName =
  'flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300';

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
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
      <section className={bannerClassName} aria-label="Show today">
        <div className="flex items-center justify-between gap-4 px-4 py-3 max-[720px]:flex-col max-[720px]:items-start">
          <div className="flex min-w-0 items-center gap-3 max-[720px]:items-start">
            <span className={iconClassName} aria-hidden="true">
              <CalendarDays size={20} />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className={`text-xs font-semibold uppercase tracking-wider ${bannerLabelClassName}`}
                >
                  Show day is here
                </span>
                <span aria-hidden="true" className="text-muted-foreground/70">
                  ·
                </span>
                <span
                  className={`min-w-0 truncate text-lg font-semibold leading-tight ${bannerTitleClassName}`}
                >
                  {singleItem.showName}
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <Clock size={14} />
                <span>First class {formatClassTime(singleItem.earliestClassTime)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {singleItem.entryCount} {pluralize(singleItem.entryCount, 'entry', 'entries')}
                </span>
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => void openShow(singleItem.showId)}
            className="shrink-0 max-[720px]:self-start"
          >
            Go to show day
            <ChevronRight size={16} />
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className={bannerClassName} aria-label="Shows today">
      <div className="px-4 py-4">
        <div className="mb-3 flex items-center gap-3">
          <span className={iconClassName} aria-hidden="true">
            <CalendarDays size={20} />
          </span>
          <div>
            <div
              className={`text-xs font-semibold uppercase tracking-wider ${bannerLabelClassName}`}
            >
              Show day is here
            </div>
            <p className={`text-lg font-semibold ${bannerTitleClassName}`}>Your shows today</p>
          </div>
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
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-md border border-emerald-500/20 bg-background/80 px-4 py-3 text-left shadow-sm transition hover:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-emerald-300 dark:focus:ring-offset-background"
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
