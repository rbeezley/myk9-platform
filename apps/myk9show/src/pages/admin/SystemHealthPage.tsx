// Site-admin System Health board.
//
// INTENT: serves the Site Admin — "The platform is healthy" role (docs/INTENT.md
// §2). A fail/stale/missing run must be surfaced loudly ("problems surfaced
// automatically"), and every check carries its detail + freshness so the summary
// leads to specifics ("I can drill down"). Do not soften the failure states into
// neutral indicators.
//
// The 2026-07-31 redesign added three things on top of that: a plain-language
// VERDICT, so the admin is not left deriving one from a list; a first-class
// FRESHNESS band, because results describing last night were being shown beside
// a green badge as though they described now; and a third status, Unverified,
// for checks that cannot prove anything either way. Every count on the page
// derives from one array — see checkHistorySelectors.
//
// The verdict also reads unresolved operator alerts, because it previously
// announced "Everything's running" beside a column of unresolved Error alerts.
// An error-severity alert withholds the all-clear in both the headline and the
// stripe; warn/info are named in the explanation but do not override it. If the
// alerts query has not answered, the verdict says nothing about alerts rather
// than guessing a count.

import { useEffect, useMemo, useState } from 'react';
import { Clock, LoaderCircle, Play, ShieldAlert } from 'lucide-react';
import {
  useRunSystemHealthCheck,
  useSystemHealthSnapshots,
} from '@/features/admin-system-health/useSystemHealthSnapshots';
import {
  deriveEffectiveStatus,
  formatCheckedAgo,
} from '@/features/admin-system-health/systemHealthSelectors';
import {
  coverageForCheck,
  HEALTH_COVERAGE_SURFACES,
} from '@/features/admin-system-health/healthCoverage';
import {
  buildCheckHistories,
  filterChecks,
  summarizeChecks,
  verdictExplanation,
  verdictHeadline,
  type CheckFilter,
} from '@/features/admin-system-health/checkHistorySelectors';
import { useOperatorAlerts } from '@/features/admin-system-health/useOperatorAlerts';
import { summarizeAlerts } from '@/features/admin-system-health/operatorAlertsSelectors';
import { cn } from '@/lib/utils';
import { OperatorAlertsSection } from './OperatorAlertsSection';
import {
  BoardCard,
  BoardError,
  BoardSkeleton,
  Eyebrow,
  FilterTabs,
  VerdictChips,
} from './SystemHealth/HealthBoardPrimitives';
import { HealthCheckRow } from './SystemHealth/HealthCheckRow';

/** The `daily-health-check` pg_cron entry: `0 7 * * *`, i.e. 07:00 UTC. */
const SCHEDULE_UTC_HOUR = 7;

/**
 * The schedule in Eastern, derived rather than written down. 07:00 UTC is 03:00
 * ET in summer and 02:00 ET in winter, so a hardcoded label is wrong for five
 * months of the year — and this page's whole argument is that it tells you the
 * truth about time.
 */
function scheduleLabel(now: number): string {
  const at = new Date(now);
  at.setUTCHours(SCHEDULE_UTC_HOUR, 0, 0, 0);
  const eastern = at.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `Cheap checks refresh continuously · full run nightly at ${eastern} ET`;
}

function formatRunDuration(ms: number | null): string {
  if (ms == null) return '';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-6 pb-10 pt-8">
        <header className="mb-[22px]">
          <h1 className="text-[25px] font-medium tracking-[-0.018em] text-foreground">
            System health
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Automated checks against the live platform. Times are Eastern.
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Stale and fresh are mutually exclusive. Both state the schedule. */
function FreshnessBand({
  lastRunAt,
  now,
  isStale,
  runDurationMs,
  isEmpty,
  isRunning,
  runError,
  onRunNow,
}: {
  lastRunAt: string | null;
  now: number;
  isStale: boolean;
  runDurationMs: number | null;
  isEmpty: boolean;
  isRunning: boolean;
  runError: string | null;
  onRunNow: () => void;
}) {
  const age = formatCheckedAgo(lastRunAt, now);
  const duration = formatRunDuration(runDurationMs);

  return (
    <div
      role={isStale || runError ? 'alert' : undefined}
      className={cn(
        'flex flex-col gap-3 rounded-[15px] px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between',
        // A failed Run now is a problem being reported — it must not sit in a
        // green band just because the last nightly run was fresh.
        isStale || isEmpty || runError ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {isEmpty
              ? 'No full run has been recorded yet'
              : isStale
                ? `Some results are too old to answer “is it broken now?”`
                : `All checks last ran ${age}`}
          </p>
          {/* Full-strength status colour, no opacity: at 80% the warning/success
              text computed to ~3.85:1 on the tinted band in light mode — under
              the 4.5:1 AA floor for 14px text. Solid measures 5.7:1+. */}
          <p className="mt-0.5 text-sm">
            {scheduleLabel(now)}
            {duration && ` · last run took ${duration}`}
          </p>
          {runError && <p className="mt-2 text-sm font-medium">{runError}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={onRunNow}
        disabled={isRunning}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[9px] border border-current px-3 text-sm font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
      >
        {isRunning ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        ) : (
          <Play aria-hidden className="size-4" />
        )}
        {isRunning ? 'Running…' : 'Run now'}
      </button>
    </div>
  );
}

function CoverageCard({
  unprovableChecks,
}: {
  unprovableChecks: Array<{ key: string; label: string }>;
}) {
  const unmonitoredCount = HEALTH_COVERAGE_SURFACES.filter(
    surface => surface.verificationLevel === 'none'
  ).length;
  const visibleSurfaces = HEALTH_COVERAGE_SURFACES.filter(
    surface => surface.verificationLevel !== 'full' || !surface.checkKey
  );
  const runtimeUnprovableChecks = unprovableChecks
    .map(check => ({ check, coverage: coverageForCheck(check.key) }))
    .filter(({ coverage }) => !coverage || coverage.verificationLevel === 'full');

  return (
    <BoardCard>
      <Eyebrow>Coverage</Eyebrow>
      <p className="mt-2 text-sm text-foreground">What the platform can and can&apos;t prove.</p>

      {runtimeUnprovableChecks.map(({ check, coverage }) => (
        <p key={check.key} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {coverage
            ? `${coverage.label} — this run did not collect enough evidence to confirm success.`
            : `${check.label} — this page does not have enough evidence to confirm success.`}
        </p>
      ))}

      <ul className="mt-3 space-y-1">
        {visibleSurfaces.map(surface => (
          <li key={surface.label} className="text-sm text-muted-foreground">
            <span
              aria-hidden
              className={cn(
                'mr-1.5 inline-block size-[6px] rounded-full align-middle',
                surface.verificationLevel === 'full'
                  ? 'bg-success'
                  : surface.verificationLevel === 'dispatch-only'
                    ? 'bg-warning'
                    : 'bg-muted-foreground'
              )}
            />
            {surface.label} — {surface.detail}
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-border pt-2.5 font-mono text-sm text-muted-foreground">
        {unmonitoredCount} of {HEALTH_COVERAGE_SURFACES.length} surfaces unmonitored
      </p>
    </BoardCard>
  );
}

/**
 * The migrations check reports "latest <version> (N applied)". Environment wants
 * the version alone — echoing the whole detail string would print the same
 * sentence twice on one screen, in two places that could later drift apart.
 */
function migrationVersion(detail: string | null): string | null {
  if (!detail) return null;
  return /latest (\S+)/.exec(detail)?.[1] ?? null;
}

function EnvironmentCard({
  source,
  migrationsDetail,
}: {
  source: string;
  migrationsDetail: string | null;
}) {
  const version = migrationVersion(migrationsDetail);
  const displaySource = source.startsWith('cron-health-check:manual:')
    ? 'cron-health-check (Run now)'
    : source;
  return (
    <BoardCard>
      <Eyebrow>Environment</Eyebrow>
      <dl className="mt-2 space-y-2 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Written by</dt>
          <dd className="font-mono text-foreground">{displaySource || 'unknown'}</dd>
        </div>
        {version && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Migration</dt>
            <dd className="break-all font-mono text-foreground">{version}</dd>
          </div>
        )}
      </dl>
    </BoardCard>
  );
}

export default function SystemHealthPage() {
  const { data, isLoading, error, refetch } = useSystemHealthSnapshots();
  // Same query key the alerts card reads, so this shares its cache rather than
  // issuing a second fetch. `null` while the query has not answered: the
  // verdict must not claim an alert count it does not have.
  const { data: alertData, error: alertError } = useOperatorAlerts();
  const runHealthCheck = useRunSystemHealthCheck();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(clock);
  }, []);
  const [filter, setFilter] = useState<CheckFilter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const snapshots = useMemo(() => data?.history ?? [], [data]);
  const checks = useMemo(() => buildCheckHistories(snapshots, undefined, now), [snapshots, now]);
  const summary = useMemo(() => summarizeChecks(checks), [checks]);
  const visible = useMemo(() => filterChecks(checks, filter), [checks, filter]);

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex flex-col gap-[18px]">
          <BoardSkeleton />
          {/* OperatorAlertsSection has its own query/loading/error states and
              must not disappear behind a snapshots-query outage (money-path
              alerts are unrelated to the daily health-job pipeline). */}
          <OperatorAlertsSection />
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="flex flex-col gap-[18px]">
          <BoardError
            message={
              error instanceof Error
                ? error.message
                : 'The snapshot read failed — confirm you have site-admin access.'
            }
            onRetry={() => void refetch()}
          />
          <OperatorAlertsSection />
        </div>
      </PageShell>
    );
  }

  const latest = data?.latest ?? null;
  const effective = deriveEffectiveStatus(latest, now);
  // `alertError` is checked as well as `alertData`: React Query keeps the last
  // successful data through a FAILED background refetch, so reading data alone
  // would let a cached empty list keep asserting an all-clear while the alerts
  // card two columns away says it couldn't load. Unknown must read as unknown.
  const alertSummary = alertData && !alertError ? summarizeAlerts(alertData) : null;
  const headline = verdictHeadline(summary, effective.isStale, effective.isEmpty, alertSummary);
  const explanation = verdictExplanation(
    summary,
    effective.isStale,
    effective.isEmpty,
    alertSummary
  );
  const unprovableChecks = checks
    .filter(c => c.verification === 'unprovable')
    .map(c => ({ key: c.key, label: c.label }));
  const migrationsDetail = checks.find(c => c.key === 'migrations')?.detail ?? null;
  const runError = runHealthCheck.error
    ? runHealthCheck.error.message || 'The run could not be started.'
    : runHealthCheck.data?.completed === false
      ? 'The run was requested, but its result has not arrived yet. Refresh in a moment.'
      : null;

  // The stripe says the same thing as the headline. A green edge beside
  // "2 alerts need review" would reinstate in colour the all-clear the words
  // just withheld.
  const verdictAccent =
    effective.status === 'fail'
      ? 'border-l-destructive'
      : effective.status === 'warn' || (alertSummary?.needingReview ?? 0) > 0
        ? 'border-l-warning'
        : 'border-l-success';

  return (
    <PageShell>
      <div className="flex flex-col gap-[18px]">
        <BoardCard className={cn('border-l-[3px]', verdictAccent)}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {/* 32px against the 25px h1: a full scale step (1.28) — the old
                  29px was close enough to read as accidental. */}
              <h2 className="text-[32px] font-medium leading-tight tracking-[-0.018em] text-foreground">
                {headline}
              </h2>
              <p className="mt-2 max-w-prose text-sm text-muted-foreground">{explanation}</p>
            </div>
            {!effective.isEmpty && <VerdictChips summary={summary} />}
          </div>
        </BoardCard>

        <FreshnessBand
          lastRunAt={latest?.createdAt ?? null}
          now={now}
          isStale={effective.isStale}
          runDurationMs={latest?.runDurationMs ?? null}
          isEmpty={effective.isEmpty}
          isRunning={runHealthCheck.isPending}
          runError={runError}
          onRunNow={() => void runHealthCheck.mutateAsync()}
        />

        <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* min-w-0: a grid item defaults to min-width:auto, so without this the
              track refuses to shrink below the widest row and the checks list
              overflows its column — clipping the status badge clean off the page
              rather than truncating the detail text. */}
          <div className="flex min-w-0 flex-col gap-3">
            <FilterTabs
              ariaLabel="Filter checks by status"
              active={filter}
              onChange={setFilter}
              tabs={[
                { value: 'all', label: 'All', count: summary.total },
                { value: 'fail', label: 'Failing', count: summary.failing },
                { value: 'warn', label: 'Unverified', count: summary.unverified },
                { value: 'ok', label: 'Passing', count: summary.passing },
              ]}
            />

            {checks.length === 0 ? (
              <BoardCard>
                <div className="flex items-start gap-2.5">
                  <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      No checks have been recorded
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The nightly runner writes one snapshot per night. Until it does, this page has
                      nothing to report — which is not the same as nothing being wrong.
                    </p>
                  </div>
                </div>
              </BoardCard>
            ) : visible.length === 0 ? (
              <BoardCard>
                <p className="text-sm text-foreground">Nothing in this bucket.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Switch to All to see the other {summary.total} checks.
                </p>
              </BoardCard>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-[15px] border border-border">
                {visible.map(check => (
                  <HealthCheckRow
                    key={check.key}
                    check={check}
                    now={now}
                    isOpen={openKey === check.key}
                    onToggle={() => setOpenKey(openKey === check.key ? null : check.key)}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-[18px]">
            <OperatorAlertsSection />
            <CoverageCard unprovableChecks={unprovableChecks} />
            <EnvironmentCard source={latest?.source ?? ''} migrationsDetail={migrationsDetail} />
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
