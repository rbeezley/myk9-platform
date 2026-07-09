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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/common/SkeletonLoaders';
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

function AlertRow({ alert, now }: { alert: OperatorAlert; now: number }) {
  const { mutateAsync, isPending } = useResolveOperatorAlert();
  const [resolving, setResolving] = useState(false);
  const detailText = formatAlertDetail(alert.detail);

  async function handleResolve() {
    setResolving(true);
    try {
      await mutateAsync(alert.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve alert');
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
        <Button
          size="sm"
          variant="outline"
          onClick={handleResolve}
          disabled={isPending || resolving}
        >
          Resolve
        </Button>
      </div>
    </div>
  );
}

export function OperatorAlertsSection() {
  const { data, isLoading, error } = useOperatorAlerts();
  const [now] = useState(() => Date.now());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unresolved Alerts</CardTitle>
      </CardHeader>
      <CardContent>
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
            {data.map(alert => (
              <AlertRow key={alert.id} alert={alert} now={now} />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            No unresolved alerts.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
