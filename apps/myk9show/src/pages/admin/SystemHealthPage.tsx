// Site-admin System Health board.
//
// INTENT: serves the Site Admin — "The platform is healthy" role (docs/INTENT.md
// §2). A fail/stale/missing run must be surfaced loudly ("problems surfaced
// automatically"), and every check carries its detail + freshness so the summary
// leads to specifics ("I can drill down"). Do not soften the failure states into
// neutral indicators.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle } from 'lucide-react';
import { StatusBadge } from '@myk9/ui';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { useSystemHealthSnapshots } from '@/features/admin-system-health/useSystemHealthSnapshots';
import { OperatorAlertsSection } from './OperatorAlertsSection';
import {
  deriveEffectiveStatus,
  formatCheckedAgo,
  getHealthCheckRemediation,
  statusToBadgeVariant,
} from '@/features/admin-system-health/systemHealthSelectors';
import type {
  CheckStatus,
  EffectiveHealth,
  HealthStatus,
  SystemHealthSnapshot,
} from '@/features/admin-system-health/systemHealthTypes';

const OVERALL_HEADLINE: Record<HealthStatus, string> = {
  ok: 'All systems healthy',
  warn: 'Degraded — review the warnings below',
  fail: 'Attention needed',
};

const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  ok: 'OK',
  warn: 'Warning',
  fail: 'Fail',
  unknown: 'Unknown',
};

const DOT_CLASS: Record<CheckStatus, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  fail: 'bg-destructive',
  unknown: 'bg-muted-foreground',
};

/** "took 1.5s" / "took 900ms", or '' when the writer omitted the duration. */
function formatRunDuration(ms: number | null): string {
  if (ms == null) return '';
  return ms >= 1000 ? `took ${(ms / 1000).toFixed(1)}s` : `took ${ms}ms`;
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-6 pb-8 pt-8">
        <div className="mb-8">
          <h1
            className="flex items-center text-3xl font-bold tracking-tight"
            style={{ fontWeight: 650 }}
          >
            <Activity className="mr-3 h-8 w-8 text-primary" />
            System Health
          </h1>
          <p className="mt-2 text-muted-foreground" style={{ fontWeight: 400 }}>
            The latest automated go-live parity check. A missing or stale run is itself a failure.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

function OverallBanner({
  effective,
  latest,
  now,
}: {
  effective: EffectiveHealth;
  latest: SystemHealthSnapshot | null;
  now: number;
}) {
  const headline = effective.isEmpty
    ? 'No health run recorded yet'
    : OVERALL_HEADLINE[effective.status];

  const meta = latest
    ? [
        `Last run ${formatCheckedAgo(latest.createdAt, now)}`,
        `source: ${latest.source}`,
        formatRunDuration(latest.runDurationMs),
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Waiting for the first run from the daily health job.';

  return (
    <Card className={effective.status === 'ok' ? undefined : 'border-destructive/40'}>
      <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <StatusBadge
            variant={statusToBadgeVariant(effective.status)}
            size="lg"
            label={headline}
          />
        </div>
        <div className="text-sm text-muted-foreground">{meta}</div>
      </CardContent>
    </Card>
  );
}

function StaleOrEmptyWarning({ effective }: { effective: EffectiveHealth }) {
  if (!effective.isStale && !effective.isEmpty) return null;
  const message = effective.isEmpty
    ? 'No snapshot has ever been recorded. The daily health job may not be running.'
    : 'The latest run is more than 26 hours old. The daily health job may have stopped — treat this as a failure until a fresh run lands.';

  return (
    <Alert variant="destructive" className="bg-destructive/10">
      <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      <AlertTitle>Health run overdue</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function HistoryStrip({ history }: { history: SystemHealthSnapshot[] }) {
  if (history.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-card p-4" aria-label="Recent run history">
      <h2 className="text-sm font-semibold">Recent run history</h2>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {history.map(run => (
          <div
            key={run.id}
            role="status"
            aria-label={`${CHECK_STATUS_LABEL[run.overallStatus]} run ${run.createdAt}`}
            className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${DOT_CLASS[run.overallStatus]}`}
              />
              <span className="truncate text-sm">
                {CHECK_STATUS_LABEL[run.overallStatus]} · {run.source}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{run.createdAt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckRow({ check, now }: { check: SystemHealthSnapshot['checks'][number]; now: number }) {
  const remediation = getHealthCheckRemediation(check);
  const showAction = check.status !== 'ok' || remediation.coverageIncomplete;
  const statusLabel = remediation.coverageIncomplete
    ? 'Coverage incomplete'
    : CHECK_STATUS_LABEL[check.status];

  return (
    <div className="flex flex-col gap-3 border-b border-border py-3 last:border-b-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{check.label}</p>
        {check.detail && <p className="mt-0.5 text-sm text-muted-foreground">{check.detail}</p>}
        {showAction && (
          <div className="mt-2 rounded-md bg-muted/60 p-3 text-sm">
            <p className="font-medium">{remediation.ownerLabel}</p>
            <p className="mt-1 text-muted-foreground">{remediation.nextStep}</p>
            <Link
              to={remediation.href}
              className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
            >
              {remediation.actionLabel}
            </Link>
          </div>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="text-xs text-muted-foreground">
          checked {formatCheckedAgo(check.checkedAt, now)}
        </span>
        <StatusBadge variant={statusToBadgeVariant(check.status)} size="sm" label={statusLabel} />
      </div>
    </div>
  );
}

export default function SystemHealthPage() {
  const { data, isLoading, error } = useSystemHealthSnapshots();
  // Evaluated once per render; the pure selectors take `now` explicitly so the
  // stale/empty logic stays unit-testable without mocking the clock.
  // Freeze "now" at mount (lazy init keeps render pure — the codebase pattern for
  // render-time clock reads). Freshness is relative to page open, which is the
  // right granularity for a board checked once each morning.
  const [now] = useState(() => Date.now());
  // Derivation is a single parse + subtraction — cheap enough to run inline.
  const effective = deriveEffectiveStatus(data?.latest ?? null, now);

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex flex-col gap-6">
          <div role="status" aria-label="Loading system health" className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-32 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-24 rounded-lg" />
          </div>
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
        <div className="flex flex-col gap-6">
          <Alert variant="destructive" className="bg-destructive/10">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            <AlertTitle>Couldn’t load system health</AlertTitle>
            <AlertDescription>
              The snapshot read failed. Confirm you have site-admin access and try again.
            </AlertDescription>
          </Alert>
          <OperatorAlertsSection />
        </div>
      </PageShell>
    );
  }

  const latest = data?.latest ?? null;
  const history = data?.history ?? [];

  return (
    <PageShell>
      <div className="flex flex-col gap-6">
        <OverallBanner effective={effective} latest={latest} now={now} />
        <StaleOrEmptyWarning effective={effective} />
        <HistoryStrip history={history} />

        <Card>
          <CardHeader>
            <CardTitle>Checks</CardTitle>
          </CardHeader>
          <CardContent>
            {latest && latest.checks.length > 0 ? (
              <div>
                {latest.checks.map(check => (
                  <CheckRow key={check.key} check={check} now={now} />
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {latest
                  ? 'The latest run recorded no individual checks.'
                  : 'No health run recorded yet.'}
              </p>
            )}
          </CardContent>
        </Card>

        <OperatorAlertsSection />
      </div>
    </PageShell>
  );
}
