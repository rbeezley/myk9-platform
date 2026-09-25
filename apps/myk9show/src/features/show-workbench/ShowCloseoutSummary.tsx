import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileText } from 'lucide-react';
import { Chip } from '@/components/base/Chip';
import { formatCurrency } from '@/lib/utils';
import {
  listShowIncidentCloseout,
  showIncidentCloseoutQueryKey,
} from '@/services/database/show-incidents';
import { listShowPayments, showPaymentsQueryKey } from '@/services/database/show-payments';
import {
  DESK_PAYMENT_METHODS,
  summarizeShowDayReconciliation,
  type DeskCollectionWindow,
  type ShowDayReconciliationEntry,
} from './showDayReconciliationSummary';
import { summarizeCloseoutStatus, type IncidentState } from './showCloseoutStatus';
import { formatIncidentType, summarizeShowIncidents } from './showIncidents';

interface ShowCloseoutSummaryProps {
  showId: string;
  entries: ShowDayReconciliationEntry[];
  /** When the show ran, so only money taken at the desk counts (MYK9-677). */
  deskWindow: DeskCollectionWindow | null;
}

const STAT_LABEL_CLASS = 'text-xs font-medium uppercase text-muted-foreground';
const STAT_VALUE_CLASS = 'text-xl font-semibold';

export function ShowCloseoutSummary({ showId, entries, deskWindow }: ShowCloseoutSummaryProps) {
  // Cash and check money is read from the payments ledger (MYK9-677), online
  // like the incident read below; see services/database/show-payments.ts.
  const paymentsQuery = useQuery({
    queryKey: showPaymentsQueryKey(showId),
    queryFn: () => listShowPayments(showId),
  });
  const recon = summarizeShowDayReconciliation(entries, deskWindow, paymentsQuery.data ?? []);
  const reconNeedsReview = recon.pulledCount > 0 || recon.refundReviewCount > 0;
  const hasDeskMoney = DESK_PAYMENT_METHODS.some(
    method => recon.byMethod[method.id].count > 0 || recon.byMethod[method.id].amount !== 0
  );
  // Never a zero before the read completes: pending (including paused while
  // offline, which is not `isLoading`) shows a placeholder, a failure says so.
  const paymentsText = paymentsQuery.isSuccess
    ? formatCurrency(recon.paymentAmount)
    : paymentsQuery.isError
      ? 'Unavailable'
      : '…';
  const paymentCountText = paymentsQuery.isSuccess
    ? `${recon.paymentCount} ${recon.paymentCount === 1 ? 'payment' : 'payments'} during the show`
    : paymentsQuery.isError
      ? 'Unavailable'
      : 'Checking payments…';
  const refundReviewText =
    recon.refundReviewCount > 0
      ? `${formatCurrency(recon.refundReviewAmount)} paid entries`
      : recon.refundedCount > 0
        ? `${recon.refundedCount} already refunded`
        : 'No paid pulls flagged';

  const incidentsQuery = useQuery({
    queryKey: showIncidentCloseoutQueryKey(showId),
    queryFn: () => listShowIncidentCloseout(showId),
  });
  const incidentSummary = summarizeShowIncidents(incidentsQuery.data ?? []);
  const incidentState: IncidentState = incidentsQuery.isLoading
    ? { state: 'loading' }
    : incidentsQuery.isError
      ? { state: 'error' }
      : { state: 'ready', reportableCount: incidentSummary.reportableCount };

  const status = summarizeCloseoutStatus({
    reconNeedsReview,
    pulledCount: recon.pulledCount,
    refundReviewCount: recon.refundReviewCount,
    hasEntries: recon.totalEntryCount > 0,
    incidents: incidentState,
  });

  return (
    <section
      className="rounded-md border bg-card p-4"
      aria-labelledby="show-closeout-summary-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="show-closeout-summary-title" className="text-base font-semibold">
            Show closeout
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Check the cash box against the payments below, settle pulls, then clear reportable
            incidents before final filing.
          </p>
        </div>
        <Chip color={status.color} size="sm" className="w-fit">
          {status.label}
        </Chip>
      </div>

      {/* Attendance & fees — synchronous, prop-driven reconciliation. */}
      <div className="mt-5" role="group" aria-labelledby="show-closeout-attendance-title">
        <h4
          id="show-closeout-attendance-title"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Entries &amp; payments
        </h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div role="group" aria-label="Show entries">
            <p className={STAT_LABEL_CLASS}>Entries</p>
            <p className={STAT_VALUE_CLASS}>{recon.totalEntryCount}</p>
          </div>
          <div role="group" aria-label="Late entries at the desk">
            <p className={STAT_LABEL_CLASS}>Late entries</p>
            <p className={STAT_VALUE_CLASS}>{recon.lateEntryCount}</p>
            <p className="text-xs text-muted-foreground">
              {recon.waivedLateEntryCount > 0
                ? `Entered during the show · ${recon.waivedLateEntryCount} waived`
                : 'Entered during the show'}
            </p>
          </div>
          <div role="group" aria-label="Payments received during the show">
            <p className={STAT_LABEL_CLASS}>Payments received</p>
            <p className={STAT_VALUE_CLASS}>{paymentsText}</p>
            {paymentsQuery.isError ? (
              <p className="text-xs text-destructive">
                {paymentCountText}: could not load payments. Reconnect and reopen closeout.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{paymentCountText}</p>
            )}
          </div>
          <div role="group" aria-label="Pulled or no-show entries">
            <p className={STAT_LABEL_CLASS}>Pulled / no-show</p>
            <p className={STAT_VALUE_CLASS}>{recon.pulledCount}</p>
          </div>
          <div role="group" aria-label="Manual refund review">
            <p className={STAT_LABEL_CLASS}>Refund review</p>
            <p className={STAT_VALUE_CLASS}>{recon.refundReviewCount}</p>
            <p className="text-xs text-muted-foreground">{refundReviewText}</p>
          </div>
        </div>

        {hasDeskMoney && paymentsQuery.isSuccess && (
          <div className="mt-3 flex flex-wrap gap-2">
            {DESK_PAYMENT_METHODS.map(method => ({
              ...method,
              value: recon.byMethod[method.id],
            }))
              .filter(method => method.value.count > 0 || method.value.amount !== 0)
              .map(method => (
                <span
                  key={method.id}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium"
                >
                  <span>{method.label}</span>
                  <span>{method.value.count}</span>
                  <span>{formatCurrency(method.value.amount)}</span>
                </span>
              ))}
          </div>
        )}

        {recon.refundedCount > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {recon.refundedCount} pulled {recon.refundedCount === 1 ? 'entry has' : 'entries have'}{' '}
            {formatCurrency(recon.refundedAmount)} marked refunded.
          </p>
        )}
      </div>

      {/* Incidents — async; owns its own loading/error/empty states. */}
      <div
        className="mt-5 border-t pt-4"
        role="group"
        aria-labelledby="show-closeout-incidents-title"
      >
        <h4
          id="show-closeout-incidents-title"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Incidents
        </h4>

        {incidentsQuery.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Checking the incident log...</p>
        ) : incidentsQuery.isError ? (
          <p className="mt-3 text-sm text-destructive">
            Could not load the incident closeout. Open the incident log in Tools before filing
            reports.
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div role="group" aria-label="All incidents">
                <p className={STAT_LABEL_CLASS}>All incidents</p>
                <p className={STAT_VALUE_CLASS}>{incidentSummary.totalCount}</p>
              </div>
              <div role="group" aria-label="Reportable incidents">
                <p className={STAT_LABEL_CLASS}>Reportable</p>
                <p className={STAT_VALUE_CLASS}>{incidentSummary.reportableCount}</p>
              </div>
              <div role="group" aria-label="Urgent incidents">
                <p className={STAT_LABEL_CLASS}>Urgent</p>
                <p className={STAT_VALUE_CLASS}>{incidentSummary.urgentCount}</p>
              </div>
            </div>

            {incidentSummary.latestReportable ? (
              <p className="mt-3 inline-flex items-start gap-2 text-sm text-muted-foreground">
                {incidentSummary.urgentCount > 0 ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
                ) : (
                  <FileText className="mt-0.5 h-4 w-4" aria-hidden="true" />
                )}
                <span>
                  Latest reportable:{' '}
                  {formatIncidentType(incidentSummary.latestReportable.incident_type)} -{' '}
                  {incidentSummary.latestReportable.summary}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No reportable incident follow-up is waiting in this show.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
