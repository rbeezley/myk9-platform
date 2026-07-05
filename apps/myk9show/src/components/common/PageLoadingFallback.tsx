import { Skeleton } from '@/components/ui/skeleton';

export function PageLoadingFallback() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center px-4 py-12"
      role="status"
      aria-busy="true"
      aria-label="Preparing myK9Show"
    >
      <div className="w-full max-w-sm space-y-5 rounded-md border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            K9
          </div>
          <div className="space-y-2">
            <p className="text-base font-semibold text-foreground">myK9Show</p>
            <p className="text-sm text-muted-foreground">Preparing your workspace...</p>
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    </div>
  );
}
