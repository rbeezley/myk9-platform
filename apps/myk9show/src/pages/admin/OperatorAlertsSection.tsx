// Unresolved-operator-alerts section of the /admin/health board (MP-08,
// MP-12). Extends the existing System Health page rather than adding a new
// admin page — the operator's "is anything wrong?" question already lives
// here (design.md decision 1, money-path-hardening-remainder).
//
// INTENT: same Site Admin "problems surfaced automatically" contract as the
// rest of this board — an unresolved alert must be visible with enough
// context to act, and resolving it must be a single, explicit action.

import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@myk9/ui';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { BoardCard, Eyebrow } from './SystemHealth/HealthBoardPrimitives';
import { friendlyDbError } from '@/utils/friendlyDbError';
import { formatCheckedAgo } from '@/features/admin-system-health/systemHealthSelectors';
import {
  formatAlertDetail,
  severityToBadgeVariant,
} from '@/features/admin-system-health/operatorAlertsSelectors';
import {
  useOperatorAlerts,
  useResolveOperatorAlert,
} from '@/features/admin-system-health/useOperatorAlerts';
import type { OperatorAlert } from '@/features/admin-system-health/operatorAlertsTypes';

const SEVERITY_LABEL: Record<OperatorAlert['severity'], string> = {
  info: 'Info',
  warn: 'Warning',
  error: 'Error',
};

/**
 * Alerts shown before the list collapses behind "Show all". Money-path writers
 * emit repeating pairs, so an incident can arrive as ten near-identical rows —
 * uncapped, the aside grows to several thousand pixels and buries the Coverage
 * and Environment cards beneath payload text.
 */
const VISIBLE_ALERTS_CAP = 5;

function AlertRow({ alert, now }: { alert: OperatorAlert; now: number }) {
  const { mutateAsync, isPending } = useResolveOperatorAlert();
  const [resolving, setResolving] = useState(false);
  const detailText = formatAlertDetail(alert.detail);

  async function handleResolve() {
    setResolving(true);
    try {
      await mutateAsync(alert.id);
    } catch (err) {
      toast.error(friendlyDbError(err, 'Failed to resolve alert. Please try again.'));
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border py-3 last:border-b-0 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            variant={severityToBadgeVariant(alert.severity)}
            size="sm"
            label={SEVERITY_LABEL[alert.severity]}
          />
          <span className="text-xs text-muted-foreground">{alert.source}</span>
        </div>
        <p className="mt-1 font-medium">{alert.title}</p>
        {detailText && <p className="mt-0.5 text-sm text-muted-foreground">{detailText}</p>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {formatCheckedAgo(alert.createdAt, now)}
        </span>
        {/* Default size (40px), not sm (32px): resolving a money-path alert is
            a real action and gets at least the sanctioned touch floor. */}
        <Button variant="outline" onClick={handleResolve} disabled={isPending || resolving}>
          Resolve
        </Button>
      </div>
    </div>
  );
}

export function OperatorAlertsSection() {
  const { data, isLoading, error } = useOperatorAlerts();
  const [now] = useState(() => Date.now());
  const [showAll, setShowAll] = useState(false);
  const visibleAlerts = data && !showAll ? data.slice(0, VISIBLE_ALERTS_CAP) : (data ?? []);

  return (
    <BoardCard>
      <Eyebrow>Unresolved alerts</Eyebrow>
      <div className="mt-2">
        {isLoading ? (
          <div role="status" aria-label="Loading unresolved alerts" className="space-y-2">
            <Skeleton className="h-12 rounded-md" />
            <Skeleton className="h-12 rounded-md" />
          </div>
        ) : error ? (
          <Alert variant="destructive" className="bg-destructive/10">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            <AlertTitle>Couldn&rsquo;t load alerts</AlertTitle>
            <AlertDescription>
              The alerts read failed. Confirm you have site-admin access and try again.
            </AlertDescription>
          </Alert>
        ) : data && data.length > 0 ? (
          <div>
            {visibleAlerts.map(alert => (
              <AlertRow key={alert.id} alert={alert} now={now} />
            ))}
            {data.length > VISIBLE_ALERTS_CAP && (
              <Button
                variant="ghost"
                className="mt-2 w-full"
                onClick={() => setShowAll(current => !current)}
              >
                {showAll ? 'Show fewer' : `Show all ${data.length} alerts`}
              </Button>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            No unresolved alerts.
          </p>
        )}
      </div>
    </BoardCard>
  );
}
