// Unresolved-operator-alerts section of the /admin/health board (MP-08,
// MP-12). Extends the existing System Health page rather than adding a new
// admin page — the operator's "is anything wrong?" question already lives
// here (design.md decision 1, money-path-hardening-remainder).
//
// INTENT: same Site Admin "problems surfaced automatically" contract as the
// rest of this board — an unresolved alert must be visible with enough
// context to act, and resolving it must be a single, explicit action.

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
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
  groupOperatorAlerts,
  severityToBadgeVariant,
  type AlertGroup,
} from '@/features/admin-system-health/operatorAlertsSelectors';
import { cn } from '@/lib/utils';
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
 * Alert TYPES shown before the list collapses behind "Show all". Grouping
 * already folds an incident's repeats into one row, so this caps distinct types
 * rather than occurrences - the case it guards is many unrelated things being
 * wrong at once, not one thing being wrong repeatedly.
 */
const VISIBLE_GROUPS_CAP = 5;

function useResolve(alert: OperatorAlert) {
  const { mutateAsync, isPending } = useResolveOperatorAlert();
  const [resolving, setResolving] = useState(false);

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

  return { handleResolve, disabled: isPending || resolving };
}

/**
 * Age and the action, on their own full-width line.
 *
 * Deliberately NOT a `md:flex-row` split: this card lives in a 340px aside, so
 * a viewport-keyed horizontal layout left the title a ~120px column wrapping
 * one word per line. The narrow column is the only column that matters here.
 */
function AlertActions({ alert, now }: { alert: OperatorAlert; now: number }) {
  const { handleResolve, disabled } = useResolve(alert);
  return (
    <div className="mt-2 flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">
        {formatCheckedAgo(alert.createdAt, now)}
      </span>
      {/* Default size (40px), not sm (32px): resolving a money-path alert is
          a real action and gets at least the sanctioned touch floor. */}
      <Button variant="outline" onClick={handleResolve} disabled={disabled}>
        Resolve
      </Button>
    </div>
  );
}

function AlertIdentity({ alert }: { alert: OperatorAlert }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge
        variant={severityToBadgeVariant(alert.severity)}
        size="sm"
        label={SEVERITY_LABEL[alert.severity]}
      />
      <span className="text-xs text-muted-foreground">{alert.source}</span>
    </div>
  );
}

/** A type that occurred once: nothing to collapse, so no count and no expander. */
function AlertRow({ alert, now }: { alert: OperatorAlert; now: number }) {
  const detailText = formatAlertDetail(alert.detail);
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <AlertIdentity alert={alert} />
      <p className="mt-1 font-medium">{alert.title}</p>
      {detailText && <p className="mt-0.5 text-sm text-muted-foreground">{detailText}</p>}
      <AlertActions alert={alert} now={now} />
    </div>
  );
}

/**
 * One occurrence inside an opened group. The identity line is omitted - the
 * group header already carries it - so the detail, which holds the refund or
 * session id, is what distinguishes this row from its siblings.
 */
function OccurrenceRow({ alert, now }: { alert: OperatorAlert; now: number }) {
  const detailText = formatAlertDetail(alert.detail);
  return (
    <div className="border-t border-border py-2.5 pl-3">
      <p className="text-sm text-muted-foreground">
        {detailText || 'No further detail recorded.'}
      </p>
      <AlertActions alert={alert} now={now} />
    </div>
  );
}

/**
 * A repeated type, collapsed. Every occurrence is a distinct event - four of
 * these are four different refunds - so there is deliberately NO bulk resolve:
 * the section's INTENT is that resolving stays a single, explicit action, and
 * one click must never acknowledge four financial events at once.
 */
function AlertGroupRow({ group, now }: { group: AlertGroup; now: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const count = group.alerts.length;
  const panelId = `alert-group-${group.key.replace(/[^a-zA-Z0-9]+/g, '-')}`;
  const newest = group.alerts[0];

  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <AlertIdentity alert={newest} />
      <div className="mt-1 flex items-start justify-between gap-2">
        <p className="min-w-0 font-medium">{group.title}</p>
        <span
          className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-xs tabular-nums text-foreground"
          aria-label={`${count} occurrences`}
        >
          {count}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Newest {formatCheckedAgo(group.newestAt, now)} - oldest{' '}
        {formatCheckedAgo(group.oldestAt, now)}
      </p>
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-[9px] px-2 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown
          aria-hidden
          className={cn('size-4 transition-transform', isOpen && 'rotate-180')}
        />
        {isOpen ? `Hide ${count} occurrences` : `Show ${count} occurrences`}
      </button>
      {isOpen && (
        <div id={panelId} className="mt-1">
          {group.alerts.map(alert => (
            <OccurrenceRow key={alert.id} alert={alert} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

export function OperatorAlertsSection() {
  const { data, isLoading, error } = useOperatorAlerts();
  // Ticks like the main board's clock: frozen-at-mount ages read "10 min ago"
  // an hour later, silently wrong next to rows that do advance.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(clock);
  }, []);
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(() => groupOperatorAlerts(data ?? []), [data]);
  const visibleGroups = showAll ? groups : groups.slice(0, VISIBLE_GROUPS_CAP);

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
        ) : groups.length > 0 ? (
          <div>
            {visibleGroups.map(group =>
              group.alerts.length === 1 ? (
                <AlertRow key={group.key} alert={group.alerts[0]} now={now} />
              ) : (
                <AlertGroupRow key={group.key} group={group} now={now} />
              )
            )}
            {groups.length > VISIBLE_GROUPS_CAP && (
              <Button
                variant="ghost"
                className="mt-2 w-full"
                onClick={() => setShowAll(current => !current)}
              >
                {showAll ? 'Show fewer' : `Show all ${groups.length} alert types`}
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
