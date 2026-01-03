import React from 'react';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';

/**
 * Component for triggering lazy loading when it comes into view
 */
export function LazyLoadTrigger({ 
  onLoadMore, 
  hasMore, 
  loading 
}: { 
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}) {
  const triggerRef = useIntersectionObserver(onLoadMore, {
    rootMargin: '100px',
    threshold: 0.1
  });

  if (!hasMore) return null;

  return (
    <div ref={triggerRef} className="flex justify-center py-4">
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          <span>Loading more...</span>
        </div>
      ) : (
        <button
          onClick={onLoadMore}
          className="text-primary hover:text-primary/80 text-sm font-medium"
        >
          Load more
        </button>
      )}
    </div>
  );
}