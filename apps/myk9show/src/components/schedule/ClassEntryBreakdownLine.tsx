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
}: {
  breakdown: ClassEntryBreakdown;
  showId: string;
  trialId: string;
  classId: string;
  className: string;
}) {
  const text = formatClassEntryBreakdown(breakdown);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <span>{text.entered}</span>
      {text.pending && (
        <>
          <span aria-hidden="true">·</span>
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
