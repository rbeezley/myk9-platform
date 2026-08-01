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

import { useMemo, useState } from 'react';
import { Clock, ShieldAlert } from 'lucide-react';
import { useSystemHealthSnapshots } from '@/features/admin-system-health/useSystemHealthSnapshots';
import {
  deriveEffectiveStatus,
  formatCheckedAgo,
} from '@/features/admin-system-health/systemHealthSelectors';
import {
  buildCheckHistories,
  filterChecks,
  summarizeChecks,
  verdictExplanation,
  verdictHeadline,
  type CheckFilter,
} from '@/features/admin-system-health/checkHistorySelectors';
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
  return `Runs nightly at ${eastern} ET`;
}

/**
 * Surfaces with no automated check at all. A derived registry would be better,
 * but none exists yet (docs/plan-admin-dashboard-data-contract.md § Coverage).
 * This list is the honest interim and MUST be reviewed whenever a check is added
 * or removed — a stale coverage claim is worse than no coverage card.
 */
const UNMONITORED_SURFACES = ['Email delivery', 'Sync backlog', 'Site uptime'];

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
          <p className="mt-1 text-[13px] text-muted-foreground">
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
}: {
  lastRunAt: string | null;
  now: number;
  isStale: boolean;
  runDurationMs: number | null;
}) {
  const age = formatCheckedAgo(lastRunAt, now);
  const duration = formatRunDuration(runDurationMs);

  return (
    <div
      role={isStale ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-2.5 rounded-[15px] px-5 py-3.5',
        isStale ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
      )}
    >
      <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-medium">
          {isStale
            ? `Last full run was ${age} — these results describe then, not now`
            : `All checks last ran ${age}`}
        </p>
        {/* No "Run now" control: triggering the runner needs the cron secret,
            which cannot ship to the browser. A button that only repainted would
            be worse than none — it would imply a re-check that never happened.
            A real one needs a site-admin-gated trigger on cron-health-check. */}
        <p className="mt-0.5 text-[11.5px] opacity-80">
          {scheduleLabel(now)}
          {duration && ` · last run took ${duration}`}
        </p>
      </div>
    </div>
  );
}

function CoverageCard({ unprovableLabels }: { unprovableLabels: string[] }) {
  return (
    <BoardCard>
      <Eyebrow>Coverage</Eyebrow>
      <p className="mt-2 text-[12.5px] text-foreground">What these checks can&apos;t prove.</p>

      {unprovableLabels.length > 0 && (
        <p className="mt-2 text-[11.5px] leading-[1.55] text-muted-foreground">
          {unprovableLabels.join(', ')} — the job fires, but its outcome isn&apos;t read back. A
          silent failure would still look green.
        </p>
      )}

      <ul className="mt-3 space-y-1">
        {UNMONITORED_SURFACES.map(surface => (
          <li key={surface} className="text-[11.5px] text-muted-foreground">
            <span
              aria-hidden
              className="mr-1.5 inline-block size-[6px] rounded-full bg-muted-foreground align-middle"
            />
            {surface} — no check
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-border pt-2.5 font-mono text-[11.5px] text-muted-foreground">
        {UNMONITORED_SURFACES.length} surfaces unmonitored
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
  return (
    <BoardCard>
      <Eyebrow>Environment</Eyebrow>
      <dl className="mt-2 space-y-2 text-[11.5px]">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Written by</dt>
          <dd className="font-mono text-foreground">{source || 'unknown'}</dd>
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
  // Freeze "now" at mount (lazy init keeps render pure — the codebase pattern for
  // render-time clock reads). Freshness is relative to page open, which is the
  // right granularity for a board checked once each morning.
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<CheckFilter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const snapshots = useMemo(() => data?.history ?? [], [data]);
  const checks = useMemo(() => buildCheckHistories(snapshots), [snapshots]);
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
  const headline = verdictHeadline(summary, effective.isStale, effective.isEmpty);
  const explanation = verdictExplanation(summary, effective.isStale, effective.isEmpty);
  const unprovableLabels = checks.filter(c => c.verification === 'unprovable').map(c => c.label);
  const migrationsDetail = checks.find(c => c.key === 'migrations')?.detail ?? null;

  const verdictAccent =
    effective.status === 'fail'
      ? 'border-l-destructive'
      : effective.status === 'warn'
        ? 'border-l-warning'
        : 'border-l-success';

  return (
    <PageShell>
      <div className="flex flex-col gap-[18px]">
        <BoardCard className={cn('border-l-[3px]', verdictAccent)}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-[29px] font-medium leading-tight tracking-[-0.018em] text-foreground">
                {headline}
              </h2>
              <p className="mt-2 max-w-prose text-[13.5px] text-muted-foreground">{explanation}</p>
            </div>
            {!effective.isEmpty && <VerdictChips summary={summary} />}
          </div>
        </BoardCard>

        {!effective.isEmpty && (
          <FreshnessBand
            lastRunAt={latest?.createdAt ?? null}
            now={now}
            isStale={effective.isStale}
            runDurationMs={latest?.runDurationMs ?? null}
          />
        )}

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
                    <p className="text-[13px] font-medium text-foreground">
                      No checks have been recorded
                    </p>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      The nightly runner writes one snapshot per night. Until it does, this page has
                      nothing to report — which is not the same as nothing being wrong.
                    </p>
                  </div>
                </div>
              </BoardCard>
            ) : visible.length === 0 ? (
              <BoardCard>
                <p className="text-[13px] text-foreground">Nothing in this bucket.</p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
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
            <CoverageCard unprovableLabels={unprovableLabels} />
            <EnvironmentCard source={latest?.source ?? ''} migrationsDetail={migrationsDetail} />
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
