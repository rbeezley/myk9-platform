import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { calculateVirtualizedItems } from './performanceUtils';
import { useThrottle } from './useTimingHooks';
import type { VirtualizedResult } from './types';

export const useVirtualScrolling = <T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) => {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(items.length - 1, start + visibleCount + overscan * 2);

    return { start, end };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end + 1).map((item, index) => ({
      item,
      index: visibleRange.start + index,
    }));
  }, [items, visibleRange]);

  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.start * itemHeight;

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return {
    visibleItems,
    totalHeight,
    offsetY,
    onScroll: handleScroll,
  };
};

export function useAdvancedVirtualization<T>(options: {
  data: T[];
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  onScroll?: (scrollTop: number) => void;
}) {
  const {
    data,
    itemHeight,
    containerHeight,
    overscan = 5,
    onScroll
  } = options;

  const [scrollTop, setScrollTop] = useState(0);
  const [result, setResult] = useState<VirtualizedResult<T> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data.length) {
      queueMicrotask(() => {
        setResult(null);
      });
      return;
    }

    const virtualizedResult = calculateVirtualizedItems(
      data,
      scrollTop,
      { itemHeight, containerHeight, overscan }
    );

    queueMicrotask(() => {
      setResult(virtualizedResult);
    });
  }, [data, scrollTop, itemHeight, containerHeight, overscan]);

  const handleScroll = useThrottle(
    useCallback((event: React.UIEvent<HTMLDivElement>) => {
      const newScrollTop = event.currentTarget.scrollTop;
      setScrollTop(newScrollTop);
      onScroll?.(newScrollTop);
    }, [onScroll]) as (...args: unknown[]) => unknown,
    16
  );

  const scrollToIndex = useCallback((index: number) => {
    const newScrollTop = index * itemHeight;
    setScrollTop(newScrollTop);

    if (containerRef.current) {
      containerRef.current.scrollTop = newScrollTop;
    }
  }, [itemHeight]);

  return {
    result,
    containerRef,
    handleScroll,
    scrollToIndex,
    scrollTop
  };
}
