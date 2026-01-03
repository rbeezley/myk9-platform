import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Entry } from '../stores/entryStore';
import { DogCard as _DogCard } from './DogCard';

interface VirtualizedEntryListProps {
  entries: Entry[];
  renderEntry: (entry: Entry) => React.ReactNode;
  overscan?: number;
}

export const VirtualizedEntryList: React.FC<VirtualizedEntryListProps> = ({
  entries,
  renderEntry,
  overscan = 5
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual intentionally returns functions that cannot be memoized
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140, // Estimated height of each DogCard
    overscan,
  });

  return (
    <div
      ref={parentRef}
      className="entry-list-content"
      style={{
        height: '100%',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderEntry(entries[virtualItem.index])}
          </div>
        ))}
      </div>
    </div>
  );
};

// Grid virtualization for wider screens
export const VirtualizedEntryGrid: React.FC<VirtualizedEntryListProps> = ({
  entries,
  renderEntry,
  overscan = 5
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = React.useState(1);

  // Calculate columns based on container width
  React.useEffect(() => {
    const updateColumns = () => {
      if (parentRef.current) {
        const width = parentRef.current.offsetWidth;
        const cardWidth = 320; // Minimum card width
        const gap = 16; // Gap between cards
        const columns = Math.max(1, Math.floor((width + gap) / (cardWidth + gap)));
        setColumnCount(columns);
      }
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  const rowCount = Math.ceil(entries.length / columnCount);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual intentionally returns functions that cannot be memoized
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 156, // Height of card + gap
    overscan,
  });

  return (
    <div
      ref={parentRef}
      className="entry-list-content"
      style={{
        height: '100%',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount;
          const endIndex = Math.min(startIndex + columnCount, entries.length);
          const rowEntries = entries.slice(startIndex, endIndex);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                gap: '1rem',
                padding: '0 1rem',
              }}
            >
              {rowEntries.map((entry) => (
                <div key={entry.id}>
                  {renderEntry(entry)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};