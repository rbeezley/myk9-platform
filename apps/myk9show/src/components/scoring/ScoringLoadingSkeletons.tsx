import { Skeleton } from '@/components/common/SkeletonLoaders';
import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  label: string;
  className?: string | undefined;
}

export function ScoresheetLoadingSkeleton({ label, className }: LoadingSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('mx-auto max-w-2xl space-y-4 px-4 py-6', className)}
    >
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-10 w-28" />
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
  );
}

export function ScoringEntryListLoadingSkeleton({ label, className }: LoadingSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('container mx-auto max-w-4xl space-y-6 px-4 py-6', className)}
    >
      <div className="space-y-4">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-full sm:w-40" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-10 rounded-md" />
        <Skeleton className="h-10 rounded-md" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-14 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-7 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JudgeClassLoadingSkeleton({ label, className }: LoadingSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('min-h-screen bg-background px-6 py-8', className)}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-8 w-72 max-w-full" />
          </div>
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
