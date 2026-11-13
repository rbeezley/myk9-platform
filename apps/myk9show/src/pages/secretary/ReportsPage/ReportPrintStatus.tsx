import { NOT_RECORDED_LABEL } from '@/lib/format/fallbackLabels';
import { formatRecordDateTime } from '@/lib/format/dates';
import type { derivePaperworkPrintState } from '@/features/show-map/cockpit/paperworkPrintState';

/** Whether the selected report has been printed, from the replicated print record. */
export function ReportPrintStatus({
  hasDescriptor,
  isChecking,
  isUnavailable,
  state,
}: {
  hasDescriptor: boolean;
  isChecking: boolean;
  isUnavailable: boolean;
  state: ReturnType<typeof derivePaperworkPrintState> | null;
}) {
  if (!hasDescriptor) return null;
  const label = isChecking
    ? isUnavailable
      ? 'Print status unavailable'
      : 'Checking print status…'
    : state?.state === 'current'
      ? 'Printed'
      : state?.state === 'stale'
        ? 'Stale'
        : 'Not confirmed printed';

  return (
    <div
      className="mb-1 mt-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm"
      data-testid="report-print-status"
    >
      <div className="font-medium">{label}</div>
      {isChecking && (
        <div className="mt-1 text-muted-foreground">
          {isUnavailable
            ? 'Restart the app before recording this report as printed.'
            : 'Checking the replicated print record…'}
        </div>
      )}
      {state?.record && (
        <div className="mt-1 text-muted-foreground">
          Printed by {state.record.printedByName} on{' '}
          {formatRecordDateTime(state.record.printedAt) || NOT_RECORDED_LABEL}
        </div>
      )}
      {state?.state === 'stale' && (
        <div className="mt-1 text-muted-foreground">
          The report data changed after that print. Review and print the current version.
        </div>
      )}
    </div>
  );
}
