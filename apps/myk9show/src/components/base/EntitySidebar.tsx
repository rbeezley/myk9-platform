import React, { ReactNode, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FixedSizeList as List } from 'react-window';
import { Input } from '@/components/ui/input';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';

export interface EntitySidebarItem {
  id: string;
  primaryText: string;
  secondaryText?: string;
  avatarUrl?: string;
  avatarFallback?: string;
}

export interface EntitySidebarProps<T extends EntitySidebarItem> {
  items: T[];
  selectedId?: string;
  onSelectItem: (item: T) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  renderItem: (item: T, isSelected: boolean, isCollapsed: boolean) => ReactNode;
  itemHeight?: number;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  storageKey?: string;
}

export function EntitySidebar<T extends EntitySidebarItem>({
  items,
  selectedId,
  onSelectItem,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No items found',
  renderItem,
  itemHeight = 64,
  minWidth = 64,
  maxWidth = 320,
  defaultWidth = 240,
  storageKey = 'entity-sidebar',
}: EntitySidebarProps<T>) {
  const { width, isCollapsed, toggleCollapsed, startResizing } = useResizableSidebar({
    storageKey,
    minWidth,
    maxWidth,
    initialWidth: defaultWidth,
  });

  const filteredItems = useMemo(() => {
    if (!searchValue.trim()) return items;

    const search = searchValue.toLowerCase();
    return items.filter(
      item =>
        item.primaryText.toLowerCase().includes(search) ||
        item.secondaryText?.toLowerCase().includes(search)
    );
  }, [items, searchValue]);

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const item = filteredItems[index];
      const isSelected = item.id === selectedId;

      return (
        <div
          style={style}
          onClick={() => onSelectItem(item)}
          className={cn(
            'px-3 py-2 cursor-pointer transition-colors',
            'hover:bg-gray-100 dark:hover:bg-gray-800',
            isSelected && 'bg-blue-50 dark:bg-blue-900/20'
          )}
        >
          {renderItem(item, isSelected, isCollapsed)}
        </div>
      );
    },
    [filteredItems, selectedId, onSelectItem, renderItem, isCollapsed]
  );

  return (
    <div
      className="relative bg-[var(--sidebar)] border-r border-[var(--sidebar-border)] flex flex-col h-full"
      style={{ width: `${width}px` }}
    >
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        {!isCollapsed && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder={searchPlaceholder}
              value={''}
              onChange={e => onSearchChange(e.target.value)}
              className="pl-9 pr-3 py-2 w-full"
            />
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          className={cn(
            'p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800',
            'transition-colors',
            isCollapsed ? 'mx-auto block' : 'hidden'
          )}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">{emptyMessage}</div>
        ) : (
          <List
            height={window.innerHeight - 120}
            itemCount={filteredItems.length}
            itemSize={itemHeight}
            width="100%"
          >
            {Row}
          </List>
        )}
      </div>

      {/* Collapse/Expand Button */}
      {!isCollapsed && (
        <button
          onClick={toggleCollapsed}
          className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 p-1 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
      )}

      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 transition-colors"
          onMouseDown={startResizing}
        />
      )}
    </div>
  );
}
