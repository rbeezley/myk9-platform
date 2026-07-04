// Site-admin System Health board.
//
// INTENT: serves the Site Admin — "The platform is healthy" role (docs/INTENT.md
// §2). A fail/stale/missing run must be surfaced loudly ("problems surfaced
// automatically"), and every check carries its detail + freshness so the summary
// leads to specifics ("I can drill down"). Do not soften the failure states into
// neutral indicators.

import { useMemo } from 'react';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { StatusBadge } from '@myk9/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSystemHealthSnapshots } from '@/features/admin-system-health/useSystemHealthSnapshots';
import {
  deriveEffectiveStatus,
  formatCheckedAgo,
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
        <div className="text-sm text-muted-foreground">
          {latest
            ? `Last run ${formatCheckedAgo(latest.createdAt, now)} · source: ${latest.source}`
            : 'Waiting for the first run from the daily health job.'}
        </div>
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
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">Health run overdue</p>
        <p className="mt-1 text-destructive/90">{message}</p>
      </div>
    </div>
  );
}

function HistoryStrip({ history }: { history: SystemHealthSnapshot[] }) {
  if (history.length === 0) return null;
  return (
    <div className="flex items-center gap-2" aria-label="Recent run history">
      <span className="text-xs text-muted-foreground">Recent runs:</span>
      <div className="flex items-center gap-1.5">
        {history.map((run) => (
          <span
            key={run.id}
            role="status"
            title={`${CHECK_STATUS_LABEL[run.overallStatus]} · ${run.createdAt}`}
            aria-label={`${CHECK_STATUS_LABEL[run.overallStatus]} run`}
            className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${DOT_CLASS[run.overallStatus]}`}
          />
        ))}
      </div>
    </div>
  );
}

function CheckRow({ check, now }: { check: SystemHealthSnapshot['checks'][number]; now: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate font-medium">{check.label}</p>
        {check.detail && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{check.detail}</p>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="text-xs text-muted-foreground">
          checked {formatCheckedAgo(check.checkedAt, now)}
        </span>
        <StatusBadge
          variant={statusToBadgeVariant(check.status)}
          size="sm"
          label={CHECK_STATUS_LABEL[check.status]}
        />
      </div>
    </div>
  );
}

export default function SystemHealthPage() {
  const { data, isLoading, error } = useSystemHealthSnapshots();
  // Evaluated once per render; the pure selectors take `now` explicitly so the
  // stale/empty logic stays unit-testable without mocking the clock.
  const now = Date.now();

  const effective = useMemo<EffectiveHealth>(
    () => deriveEffectiveStatus(data?.latest ?? null, now),
    [data?.latest, now]
  );

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>Loading the latest health snapshot…</span>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Couldn’t load system health</p>
            <p className="mt-1 text-destructive/90">
              The snapshot read failed. Confirm you have site-admin access and try again.
            </p>
          </div>
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
                {latest.checks.map((check) => (
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
      </div>
    </PageShell>
  );
}
