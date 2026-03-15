import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  variant: 'cards' | 'table';
  count?: number;
  className?: string;
}

export function LoadingSkeleton({ variant, count = 6, className }: LoadingSkeletonProps) {
  if (variant === 'table') {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="h-10 bg-muted/50 rounded-lg animate-pulse" />
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-40 bg-muted/30 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}
