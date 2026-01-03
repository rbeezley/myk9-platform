/**
 * Virtual Scroll Hook
 *
 * Use this for custom virtual scroll implementations
 */

import { useState, useCallback } from 'react';

export interface UseVirtualScrollParams {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

export interface UseVirtualScrollResult {
  scrollTop: number;
  totalHeight: number;
  startIndex: number;
  endIndex: number;
  offsetY: number;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

/**
 * Hook for virtual scrolling
 *
 * Use this for custom virtual scroll implementations
 */
export function useVirtualScroll({
  itemCount,
  itemHeight,
  containerHeight,
  overscan = 3,
}: UseVirtualScrollParams): UseVirtualScrollResult {
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = itemCount * itemHeight;

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(itemCount, startIndex + visibleCount + overscan * 2);
  const offsetY = startIndex * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    requestAnimationFrame(() => {
      setScrollTop(newScrollTop);
    });
  }, []);

  return {
    scrollTop,
    totalHeight,
    startIndex,
    endIndex,
    offsetY,
    handleScroll,
  };
}
