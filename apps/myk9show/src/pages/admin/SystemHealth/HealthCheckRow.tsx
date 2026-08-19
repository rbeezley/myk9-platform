/**
 * One check row, collapsed or expanded.
 *
 * INTENT: the badge is derived from the newest run in the same array the strip
 * draws, so the strip's right-hand bar and the badge can never disagree. If you
 * are tempted to pass a status in separately, don't — that divergence is the
 * class of bug this redesign exists to remove.
 */
import { ChevronDown } from 'lucide-react';
import { StatusBadge } from '@myk9/ui';
import { cn } from '@/lib/utils';
import {
  formatCheckedAgo,
  getHealthCheckRemediation,
  statusToBadgeVariant,
} from '@/features/admin-system-health/systemHealthSelectors';
import {
  statusLabel,
  type CheckWithHistory,
} from '@/features/admin-system-health/checkHistorySelectors';
import { HistoryStrip, StatusDot } from './HealthBoardPrimitives';

function formatAbsolute(iso: string | null): string {
  if (!iso) return 'never';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 'unknown';
  return new Date(parsed).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  });
}

export function HealthCheckRow({
  check,
  now,
  isOpen,
  onToggle,
}: {
  check: CheckWithHistory;
  now: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const remediation = getHealthCheckRemediation(check);
  const panelId = `health-check-${check.key}`;

  // A check the runner flagged as unprovable AND one whose detail says its own
  // coverage is incomplete are the same fact to a reader: this row cannot tell
  // you it succeeded. Both get the design's amber word rather than only the
  // former — dropping the coverage case would silently downgrade a gap the
  // previous board surfaced explicitly.
  const verification =
    check.verification === 'unprovable' || remediation.coverageIncomplete ? 'unprovable' : 'proven';

  return (
    <div className="bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={cn(
          'flex w-full min-w-0 items-center gap-3 px-5 py-[13px] text-left transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
        )}
      >
        <StatusDot status={check.status} />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{check.label}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {check.detail || 'No detail reported.'}
          </span>
        </span>

        {/* Fixed columns must never starve the label: beside the 256px admin
            sidebar the main column is ~424px at 768px and ~360px at lg (the
            two-column grid starts there), while strip+observed+badge total
            ~437px — so `flex-1 truncate` ate the label to 0px. The strip only
            fits once the grid widens at xl; "observed" fits in the md-lg
            single-column window and again at xl. */}
        <span className="hidden w-[150px] shrink-0 justify-start xl:flex">
          <HistoryStrip runs={check.history} label={check.label} />
        </span>

        {/* This is the age of what the check OBSERVED, not of the health run —
            for a cron check it is the job's own last run. Those legitimately
            differ (a 03:00 health run reporting a 02:00 payout job), so the
            column is labelled rather than left as a bare number that looks like
            it contradicts the freshness band. */}
        <span
          title={`Observed ${formatCheckedAgo(check.checkedAt, now)}`}
          className="hidden w-[96px] shrink-0 font-mono text-xs text-muted-foreground md:block lg:hidden xl:block"
        >
          <span className="sr-only">observed </span>
          {formatCheckedAgo(check.checkedAt, now)}
        </span>

        {/* 108px, not the design's 92px: the longest status word here is "Needs
            a look", which wraps to two lines at 92 and knocks the row height out
            of alignment with its neighbours. */}
        <span className="flex w-[108px] shrink-0 justify-end whitespace-nowrap">
          <StatusBadge
            variant={statusToBadgeVariant(check.status)}
            size="sm"
            label={statusLabel(check.status, verification)}
          />
        </span>

        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div id={panelId} className="border-t border-border bg-card pb-5 pl-[42px] pr-5 pt-4">
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-[9px] bg-muted px-3 py-2.5 font-mono text-xs leading-[1.7] text-foreground">
            {check.detail || 'The runner recorded no evidence for this check.'}
          </pre>

          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Owner</dt>
              <dd className="mt-0.5 text-foreground">{remediation.ownerLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Next step</dt>
              <dd className="mt-0.5 text-foreground">{remediation.nextStep}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last passed</dt>
              <dd className="mt-0.5 font-mono text-foreground">
                {formatAbsolute(check.lastPassedAt)}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <a
              href={remediation.href}
              className="inline-flex min-h-10 items-center rounded-[9px] bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {remediation.actionLabel}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
