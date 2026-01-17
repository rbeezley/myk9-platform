import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';

interface InfiniteScrollTriggerProps {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  totalCount?: number;
  loadedCount?: number;
  className?: string;
}

/**
 * Component for infinite scroll trigger with enhanced UI
 */
export function InfiniteScrollTrigger({ 
  onLoadMore, 
  hasMore, 
  loading, 
  error,
  onRetry,
  totalCount,
  loadedCount,
  className = ''
}: InfiniteScrollTriggerProps) {
  const triggerRef = useIntersectionObserver(() => {
    if (hasMore && !loading && !error) {
      onLoadMore();
    }
  }, {
    rootMargin: '200px',
    threshold: 0.1
  });

  if (!hasMore && !loading && !error) {
    return (
      <div className={`text-center py-6 text-muted-foreground ${className}`}>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-full">
          <span className="text-sm">
            {totalCount ? `All ${totalCount} items loaded` : 'All items loaded'}
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-6 ${className}`}>
        <div className="space-y-3">
          <div className="text-destructive text-sm">{error}</div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 text-sm font-medium"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={triggerRef} className={`text-center py-6 ${className}`}>
      {loading ? (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-full">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          <span className="text-sm text-muted-foreground">
            Loading more...
            {totalCount && loadedCount && (
              <span className="ml-1">({loadedCount}/{totalCount})</span>
            )}
          </span>
        </div>
      ) : (
        <button
          onClick={onLoadMore}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
        >
          Load More
          {totalCount && loadedCount && (
            <span className="ml-1">({loadedCount}/{totalCount})</span>
          )}
        </button>
      )}
    </div>
  );
}