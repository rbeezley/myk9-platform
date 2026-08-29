import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShowTodayBanner } from './useShowTodayBanner';
import { formatClassTime, type ShowTodayBannerItem } from './showTodayBanner.helpers';
import { pluralize } from '@/utils/pluralize';

// Two DESIGN.md rules shape this banner.
//
// 1. No colored side-stripe borders (`border-left` > 1px) on cards or alerts —
//    the old `border-l-4 border-l-emerald-500` was a direct violation. A full
//    1px tinted border does the same containment job the system sanctions.
// 2. The accent must survive the theme. Every green here used to be raw
//    `emerald-500` (a COOL green, #10b981) sitting beside `text-success` (the
//    WARM #4e7c53), so one component rendered two different greens and the
//    palette never flipped for dark mode. `--success` is declared as an RGB
//    triplet, so unlike the var()-backed tokens its `/N` opacity modifiers
//    genuinely compile, and it carries a distinct light/dark value.
//
// Resting shadow and ring are gone too: Flat-by-Default says a surface earns
// elevation by being interacted with, not by sitting on the page.
const bannerClassName =
  'overflow-hidden rounded-lg border border-success/40 bg-success/10 text-left ';
const bannerLabelClassName = 'text-success ';
const bannerTitleClassName = 'text-success ';
const iconClassName =
  'flex size-10 shrink-0 items-center justify-center rounded-lg bg-success/20 text-success ';

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
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
                <span
                  className={`min-w-0 truncate text-lg font-semibold leading-tight ${bannerTitleClassName}`}
                >
                  {singleItem.showName}
                </span>
              </div>
              {/* `text-foreground`, not muted: on the `bg-success/10` fill the
                muted token measures 4.10:1 in dark mode, under the 4.5:1 floor.
                It is also the wrong weight for the content — on show day the
                first class time is primary information, and PRODUCT.md asks for
                high-contrast primary content for people reading outdoors. */}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
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
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-md border border-success/40 bg-background px-4 py-3 text-left transition hover:border-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
