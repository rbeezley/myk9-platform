/**
 * AdminDashboard — the site admin's home.
 *
 * INTENT: serves the Site Admin — "The platform is healthy" role (docs/INTENT.md
 * §2): oversight, not micromanagement. It answers "is anything wrong, and what
 * do I do about it?" in one screen, and every number on it is measured rather
 * than estimated.
 *
 * Three things are deliberately ABSENT, and each was a design element that had
 * no source (docs/plan-admin-dashboard-data-contract.md):
 *
 *  - No uptime tile. Sentry Cron check-ins measure job reliability, not site
 *    reachability, so an uptime tile would mislabel its source.
 *  - No traffic chart. Nothing collects requests per minute, and its second
 *    series was myK9Q — an app deleted from this monorepo.
 *  - No separate event log. Its only populated source is operator_alerts, which
 *    already drives "Needs a look" below; rendering the same rows twice on one
 *    screen is the duplication this phase exists to remove.
 *
 * If you are about to add one of these back, the question to answer first is
 * "what reads the number", not "where does the block go".
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { DashboardGreeting } from '@/components/ui/DashboardGreeting';
import { useSystemHealthSnapshots } from '@/features/admin-system-health/useSystemHealthSnapshots';
import { useOperatorAlerts } from '@/features/admin-system-health/useOperatorAlerts';
import {
  deriveEffectiveStatus,
  formatCheckedAgo,
} from '@/features/admin-system-health/systemHealthSelectors';
import { summarizeChecks, statusLabel } from '@/features/admin-system-health/checkHistorySelectors';
import { useAdminOverview } from '@/features/admin-overview/useAdminOverview';
import { useSentryDashboardMetrics } from '@/features/admin-overview/useSentryDashboardMetrics';
import { getSentryMetricTileState } from '@/features/admin-overview/sentryDashboardMetrics';
import { deriveTriage, type TriageCategory } from '@/features/admin-overview/triageSelectors';
import { BoardCard, BoardSkeleton, Eyebrow, StatusDot } from './SystemHealth/HealthBoardPrimitives';
import { NeedsALookSection } from './AdminDashboard/NeedsALookSection';

/**
 * `href` is optional on purpose. A tile that navigates somewhere unrelated to
 * its number is worse than a tile that does not navigate — "Entries today" has
 * no site-admin entries surface to open, so it stays inert rather than sending
 * the admin to a page that cannot explain the figure.
 */
function StatTile({
  label,
  value,
  context,
  href,
  isError,
  isStale,
}: {
  label: string;
  value: string | number;
  context: string;
  href?: string;
  isError?: boolean;
  isStale?: boolean;
}) {
  const body = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-[25px] font-semibold leading-none tabular-nums text-foreground">
        {value}
      </p>
      <p
        className={cn(
          'mt-1.5 text-[11px]',
          isError ? 'text-destructive' : isStale ? 'text-warning' : 'text-muted-foreground'
        )}
      >
        {context}
      </p>
    </>
  );

  const shell = 'rounded-[13px] border border-border bg-card px-4 py-3.5';
  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link
      to={href}
      className={cn(
        shell,
        'transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {body}
    </Link>
  );
}

export default function AdminDashboard() {
  const { firstName } = useAuthContext();
  const [now] = useState(() => Date.now());
  const [triageFilter, setTriageFilter] = useState<TriageCategory | 'all'>('all');

  const health = useSystemHealthSnapshots();
  const alerts = useOperatorAlerts();
  const overview = useAdminOverview(now);
  const sentry = useSentryDashboardMetrics();
  const latest = health.data?.latest ?? null;
  const checks = useMemo(() => latest?.checks ?? [], [latest]);
  const summary = useMemo(() => summarizeChecks(checks), [checks]);
  const effective = deriveEffectiveStatus(latest, now);
  const openAlerts = useMemo(() => alerts.data ?? [], [alerts.data]);

  // A failed source is UNKNOWN, not empty. `?? []` above is a rendering
  // convenience; without these flags the queue would iterate the empty array and
  // announce "nothing is waiting on you" at the moment the platform has no idea
  // whether anything is wrong.
  const healthUnavailable = Boolean(health.error);
  const alertsUnavailable = Boolean(alerts.error);

  const triage = useMemo(
    () =>
      deriveTriage(checks, openAlerts, now, {
        healthUnavailable,
        alertsUnavailable,
        healthMissing: !healthUnavailable && effective.isEmpty,
        healthStale: !healthUnavailable && effective.isStale,
        lastRunAt: latest?.createdAt ?? null,
      }),
    [
      checks,
      openAlerts,
      now,
      healthUnavailable,
      alertsUnavailable,
      effective.isEmpty,
      effective.isStale,
      latest,
    ]
  );

  const counts = overview.data;
  // An errored count must never render as a zero, and "—" alone is not an error
  // state — it looks like a number that has not arrived. Say what failed.
  const countsError = overview.error
    ? overview.error instanceof Error
      ? overview.error.message
      : 'The count query failed.'
    : null;
  const checksLabel =
    effective.isEmpty || effective.isStale ? '—' : `${summary.passing}/${summary.total}`;
  const errorRateTile = getSentryMetricTileState(
    sentry.data?.errorRate,
    'Error rate',
    sentry.isLoading,
    sentry.error
  );
  const apiP95Tile = getSentryMetricTileState(
    sentry.data?.apiP95,
    'Client p95',
    sentry.isLoading,
    sentry.error
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-6 pb-10 pt-8">
        <header className="mb-[22px] flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <DashboardGreeting
            firstName={firstName}
            subtitle="Platform oversight. All times are Eastern."
            className="text-[25px] tracking-[-0.018em]"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/users">
                <Users className="mr-2 h-4 w-4" />
                Manage users
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/admin/permissions">
                <Settings className="mr-2 h-4 w-4" />
                Permissions
              </Link>
            </Button>
          </div>
        </header>

        {health.isLoading ? (
          <BoardSkeleton rows={4} />
        ) : (
          <div className="flex flex-col gap-[18px]">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatTile
                label="Checks passing"
                value={healthUnavailable ? '—' : checksLabel}
                isError={healthUnavailable}
                context={
                  healthUnavailable
                    ? "couldn't read the snapshot; will retry"
                    : effective.isEmpty
                      ? 'no run recorded'
                      : effective.isStale
                        ? 'last run is stale'
                        : `checked ${formatCheckedAgo(latest?.createdAt ?? null, now)}`
                }
                href="/admin/health"
              />
              <StatTile
                label="Open alerts"
                value={alertsUnavailable || alerts.isLoading ? '—' : openAlerts.length}
                isError={alertsUnavailable}
                context={
                  alertsUnavailable
                    ? "couldn't read alerts; will retry"
                    : openAlerts.length === 0
                      ? 'nothing unresolved'
                      : 'awaiting a human'
                }
                href="/admin/health"
              />
              <StatTile
                label="Live shows"
                value={counts ? counts.liveShows : '—'}
                isError={Boolean(countsError)}
                context={countsError ? "couldn't read shows" : 'published and running today'}
                href="/shows"
              />
              {/* No href: there is no site-admin entries surface to open, and
                  sending the admin to an unrelated page is worse than an inert
                  tile. Give it a destination when one exists. */}
              <StatTile
                label="Entries today"
                value={counts ? counts.entriesToday : '—'}
                isError={Boolean(countsError)}
                context={countsError ? "couldn't read entries" : 'since midnight Eastern'}
              />
              <StatTile
                label="Error rate"
                value={errorRateTile.value}
                context={errorRateTile.context}
                isError={errorRateTile.isError}
                isStale={errorRateTile.isStale}
              />
              <StatTile
                label="Client p95"
                value={apiP95Tile.value}
                context={apiP95Tile.context}
                isError={apiP95Tile.isError}
                isStale={apiP95Tile.isStale}
              />
            </div>

            <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0">
                <NeedsALookSection
                  items={triage}
                  filter={triageFilter}
                  onFilterChange={setTriageFilter}
                  now={now}
                />
              </div>

              <aside className="flex flex-col gap-[18px]">
                <BoardCard>
                  <Eyebrow>Today at a glance</Eyebrow>
                  <dl className="mt-3 grid grid-cols-2 gap-y-3">
                    {[
                      ['Entries', counts?.entriesToday],
                      ['Signups', counts?.signupsToday],
                      ['Shows created', counts?.showsCreatedToday],
                      ['Live shows', counts?.liveShows],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <dt className="text-[11px] text-muted-foreground">{label}</dt>
                        <dd className="mt-0.5 font-mono text-[19px] font-semibold tabular-nums text-foreground">
                          {value ?? '—'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {/* Fees processed is the fourth number the design asks for. It
                      has no clean source — money lives in Stripe and there is no
                      payments table — so it is left out rather than approximated. */}
                  <p className="mt-3 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
                    {countsError ? (
                      <span className="text-destructive">
                        Today&apos;s counts didn&apos;t load; they retry automatically.
                      </span>
                    ) : (
                      'Day boundary is Eastern, matching show schedules.'
                    )}
                  </p>
                </BoardCard>

                <BoardCard>
                  <Eyebrow>Services</Eyebrow>
                  {/* Derived from the SAME snapshot /admin/health reads. Querying
                      this twice with different logic is how two pages start
                      disagreeing about whether the platform is up. */}
                  <ul className="mt-2.5 space-y-2">
                    {checks.length === 0 ? (
                      <li className="text-[11.5px] text-muted-foreground">
                        No checks in the last run.
                      </li>
                    ) : (
                      checks.map(check => (
                        <li key={check.key} className="flex items-center gap-2">
                          <StatusDot status={check.status} />
                          <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                            {check.label}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {statusLabel(check.status, check.verification)}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                  <Link
                    to="/admin/health"
                    className="mt-3 inline-block border-t border-border pt-2.5 text-[11.5px] font-medium text-foreground hover:underline"
                  >
                    Open system health →
                  </Link>
                </BoardCard>
              </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
