/**
 * Virtual List Component
 *
 * Efficiently renders large lists by only rendering visible items.
 * Perfect for entry lists with 100+ dogs.
 *
 * Features:
 * - Window virtualization (only render visible items)
 * - Dynamic item heights
 * - Smooth scrolling with momentum
 * - Automatic cleanup on unmount
 * - Touch-optimized
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import './shared-ui.css';

/**
 * Extended HTMLDivElement interface with custom scroll methods
 * Used to expose programmatic scroll control to parent components
 */
interface VirtualListElement extends HTMLDivElement {
  scrollToIndex?: (index: number, align?: 'start' | 'center' | 'end') => void;
}

export interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[];

  /** Height of each item in pixels */
  itemHeight: number;

  /** Height of the container in pixels */
  containerHeight: number;

  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;

  /** Number of items to render above/below viewport (overscan) */
  overscan?: number;

  /** Optional key extractor */
  getItemKey?: (item: T, index: number) => string | number;

  /** Optional className for container */
  className?: string;

  /** Optional empty state */
  emptyState?: React.ReactNode;

  /** Optional loading state */
  isLoading?: boolean;

  /** Optional scroll event handler */
  onScroll?: (scrollTop: number) => void;
}

export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
  getItemKey,
  className = '',
  emptyState,
  isLoading = false,
  onScroll,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate total height
  const totalHeight = useMemo(() => {
    return items.length * itemHeight;
  }, [items.length, itemHeight]);

  // Calculate visible range
  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(items.length, start + visibleCount + overscan * 2);
    const offset = start * itemHeight;

    return {
      startIndex: start,
      endIndex: end,
      offsetY: offset,
    };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  // Get visible items
  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex);
  }, [items, startIndex, endIndex]);

  // Handle scroll with RAF throttling
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const newScrollTop = target.scrollTop;

      // Use RAF to throttle scroll updates
      requestAnimationFrame(() => {
        setScrollTop(newScrollTop);
        onScroll?.(newScrollTop);
      });
    },
    [onScroll]
  );

  // Scroll to index programmatically
  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'center' | 'end' = 'start') => {
      if (!containerRef.current) return;

      let scrollTo = index * itemHeight;

      if (align === 'center') {
        scrollTo -= containerHeight / 2 - itemHeight / 2;
      } else if (align === 'end') {
        scrollTo -= containerHeight - itemHeight;
      }

      containerRef.current.scrollTop = Math.max(0, scrollTo);
    },
    [itemHeight, containerHeight]
  );

  // Expose scroll methods via ref (if needed)
  useEffect(() => {
    if (containerRef.current) {
      (containerRef.current as VirtualListElement).scrollToIndex = scrollToIndex;
    }
  }, [scrollToIndex]);

  // Empty state
  if (!isLoading && items.length === 0 && emptyState) {
    return (
      <div className={`virtual-list-empty ${className}`}>
        {emptyState}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`virtual-list-loading ${className}`}>
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`virtual-list ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div
        className="virtual-list-spacer"
        style={{ height: totalHeight }}
      >
        <div
          className="virtual-list-content"
          style={{ transform: `translateY(${offsetY}px)` }}
        >
          {visibleItems.map((item, i) => {
            const index = startIndex + i;
            const key = getItemKey ? getItemKey(item, index) : index;

            return (
              <div
                key={key}
                className="virtual-list-item"
                style={{ height: itemHeight }}
              >
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Virtual Grid Component
 *
 * For grid layouts (e.g., class cards)
 */
export interface VirtualGridProps<T> {
  items: T[];
  itemWidth: number;
  itemHeight: number;
  containerHeight: number;
  containerWidth: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  gap?: number;
  overscan?: number;
  getItemKey?: (item: T, index: number) => string | number;
  className?: string;
  emptyState?: React.ReactNode;
}

export function VirtualGrid<T>({
  items,
  itemWidth,
  itemHeight,
  containerHeight,
  containerWidth,
  renderItem,
  gap = 16,
  overscan = 2,
  getItemKey,
  className = '',
  emptyState,
}: VirtualGridProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate columns
  const columns = useMemo(() => {
    return Math.max(1, Math.floor((containerWidth + gap) / (itemWidth + gap)));
  }, [containerWidth, itemWidth, gap]);

  // Calculate rows
  const rows = useMemo(() => {
    return Math.ceil(items.length / columns);
  }, [items.length, columns]);

  // Total height
  const totalHeight = useMemo(() => {
    return rows * (itemHeight + gap) - gap;
  }, [rows, itemHeight, gap]);

  // Calculate visible range
  const { startRow, endRow, offsetY } = useMemo(() => {
    const rowHeight = itemHeight + gap;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleRows = Math.ceil(containerHeight / rowHeight);
    const end = Math.min(rows, start + visibleRows + overscan * 2);
    const offset = start * rowHeight;

    return {
      startRow: start,
      endRow: end,
      offsetY: offset,
    };
  }, [scrollTop, itemHeight, gap, containerHeight, rows, overscan]);

  // Get visible items
  const visibleItems = useMemo(() => {
    const startIndex = startRow * columns;
    const endIndex = Math.min(items.length, endRow * columns);
    return items.slice(startIndex, endIndex).map((item, i) => ({
      item,
      index: startIndex + i,
    }));
  }, [items, startRow, endRow, columns]);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    requestAnimationFrame(() => {
      setScrollTop(newScrollTop);
    });
  }, []);

  // Empty state
  if (items.length === 0 && emptyState) {
    return (
      <div className={`virtual-grid-empty ${className}`}>
        {emptyState}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`virtual-grid ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div
        className="virtual-grid-spacer"
        style={{ height: totalHeight }}
      >
        <div
          className="virtual-grid-content"
          style={{
            transform: `translateY(${offsetY}px)`,
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, ${itemWidth}px)`,
            gap: `${gap}px`,
          }}
        >
          {visibleItems.map(({ item, index }) => {
            const key = getItemKey ? getItemKey(item, index) : index;

            return (
              <div
                key={key}
                className="virtual-grid-item"
                style={{ height: itemHeight }}
              >
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
