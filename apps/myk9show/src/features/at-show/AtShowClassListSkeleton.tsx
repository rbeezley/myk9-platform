/**
 * Loading skeleton for the at-show class picker.
 *
 * Mirrors the real list's shape (two trial groups, collapsible headers, class
 * rows at the 48px ringside touch height) so the page does not reflow when the
 * data lands mid-show.
 */
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { WIDE_COLUMN } from './atShowClassListLayout';

export function AtShowClassListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading at-show classes"
      className={`ringside-root ${WIDE_COLUMN} px-4 py-4`}
    >
      <Skeleton className="mb-4 h-11 w-40" />
      <Skeleton className="mx-auto mb-5 h-6 w-56" />
      {Array.from({ length: 2 }).map((_, trialIndex) => (
        <div key={trialIndex} className="mb-6">
          <div className="mb-2 flex min-h-11 items-center gap-2 px-1">
            <Skeleton className="h-4 w-4 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: trialIndex === 0 ? 3 : 2 }).map((__, classIndex) => (
              <div
                key={classIndex}
                className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
              >
                <Skeleton className="h-6 w-6 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
