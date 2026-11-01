import { FOREIGN_REPORT_NOTICE_ID } from './reportScopedRegistries';

/**
 * A deep-linked report from another registry (MYK9-1584): say so instead of
 * showing it, since Print and Download are withheld for it.
 */
export function ForeignReportNotice({ reportName }: { reportName: string }) {
  return (
    <div
      id={FOREIGN_REPORT_NOTICE_ID}
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-2 p-8 text-center"
    >
      <p className="font-medium">{reportName} is for another registry.</p>
      <p className="max-w-prose text-sm text-muted-foreground">
        This form belongs to a different registry than this show or the trial you have selected, so
        it is not shown and cannot be printed or downloaded. Pick the trial it belongs to, or choose
        a different form.
      </p>
    </div>
  );
}
