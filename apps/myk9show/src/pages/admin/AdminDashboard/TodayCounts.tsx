import { Link } from 'react-router-dom';
import type { AdminOverviewCounts } from '@/features/admin-overview/useAdminOverview';
import { easternDayStartIso } from '@/features/admin-overview/easternDay';

interface TodayCountsProps {
  counts: AdminOverviewCounts | undefined;
  now: number;
}

const VALUE_CLASS = 'mt-0.5 font-mono text-[19px] font-semibold tabular-nums text-foreground';

/**
 * The "Today at a glance" numbers. A count is a link only when an existing page
 * applies the filter it describes: /admin/users reads `from` as an exact created-at
 * lower bound, so Signups can deep-link with the same Eastern day start the count
 * uses. /shows (BrowseShowsPage) reads no status or date filter and there is no
 * cross-show entries list, so Entries, Shows created and Live shows render static
 * rather than as cards that look clickable.
 */
export function TodayCounts({ counts, now }: TodayCountsProps) {
  const signupsHref = `/admin/users?${new URLSearchParams({ from: easternDayStartIso(now), deleted: '1' })}`;
  const cells: Array<{ label: string; value: number | undefined; href?: string }> = [
    { label: 'Entries', value: counts?.entriesToday },
    { label: 'Signups', value: counts?.signupsToday, href: signupsHref },
    { label: 'Shows created', value: counts?.showsCreatedToday },
    { label: 'Live shows', value: counts?.liveShows },
  ];

  return (
    <dl className="mt-3 grid grid-cols-2 gap-y-3">
      {cells.map(({ label, value, href }) => (
        <div key={label} data-testid={`today-count-${label}`}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className={VALUE_CLASS}>
            {href ? (
              <Link
                to={href}
                aria-label={`${label}: ${value ?? 'unavailable'}. Open the filtered list`}
                className="inline-flex min-h-11 items-center rounded-md underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {value ?? '—'}
              </Link>
            ) : (
              (value ?? '—')
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
