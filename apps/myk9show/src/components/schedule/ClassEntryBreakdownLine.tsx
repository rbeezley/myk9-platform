import { Link } from 'react-router-dom';
import { getClassReviewHref } from '@/features/entry-operations/entryAttentionRoutes';
import {
  formatClassEntryBreakdown,
  type ClassEntryBreakdown,
} from '@/features/entry-operations/classEntryBreakdown';

/**
 * A manager's entry counts for one class on the Overview schedule (MYK9-943). Counts only;
 * "N pending" opens that class's review list on Entries, where the work happens.
 */
export function ClassEntryBreakdownLine({
  breakdown,
  showId,
  trialId,
  classId,
  className,
  hideEntered = false,
}: {
  breakdown: ClassEntryBreakdown;
  showId: string;
  trialId: string;
  classId: string;
  className: string;
  /** Show only the "N pending" link, where the caller already shows a count ("2 of 2 scored"). */
  hideEntered?: boolean;
}) {
  const text = formatClassEntryBreakdown(breakdown);
  if (hideEntered && !text.pending) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      {!hideEntered && <span>{text.entered}</span>}
      {text.pending && (
        <>
          {!hideEntered && <span aria-hidden="true">·</span>}
          <Link
            to={getClassReviewHref({ showId, trialId, classId })}
            aria-label={`${text.pending} in ${className}`}
            className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-12"
          >
            {text.pending}
          </Link>
        </>
      )}
    </div>
  );
}
