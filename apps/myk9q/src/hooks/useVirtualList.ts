import { useState, useCallback } from 'react';

// Hook for easier virtual list usage
export function useVirtualList<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });

  const handleScroll = useCallback((scrollTop: number) => {
    const start = Math.floor(scrollTop / itemHeight);
    const end = Math.ceil((scrollTop + containerHeight) / itemHeight);
    setVisibleRange({ start, end });
  }, [itemHeight, containerHeight]);

  return {
    visibleRange,
    handleScroll,
    totalHeight: items.length * itemHeight,
    visibleItems: items.slice(visibleRange.start, visibleRange.end)
  };
}
