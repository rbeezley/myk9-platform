import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  variant: 'cards' | 'table';
  count?: number;
  className?: string;
  heading?: string;
}

export function LoadingSkeleton({ variant, count = 6, className, heading }: LoadingSkeletonProps) {
  if (variant === 'table') {
    return (
      <div
        role="status"
        aria-label="Loading content"
        aria-busy="true"
        className={cn('space-y-2', className)}
      >
        {heading && <h1 className="sr-only">{heading}</h1>}
        <div className="h-10 bg-muted/50 rounded-lg animate-pulse" />
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Loading content"
      aria-busy="true"
      className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}
    >
      {heading && <h1 className="sr-only">{heading}</h1>}
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-40 bg-muted/30 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}
