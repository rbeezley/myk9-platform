import { Skeleton } from '@/components/common/SkeletonLoaders';

/** Loading placeholder; owns the page `main` so the loading state is never outside a landmark. */
export function AtShowScoresheetSkeleton() {
  return (
    <main className="ringside-root mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div role="status" aria-label="Loading scoresheet" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-12 w-16 rounded-lg" />
          </div>
          <Skeleton className="mb-5 h-28 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 flex-1" />
        </div>
      </div>
    </main>
  );
}
