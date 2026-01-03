import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

export interface EntitySidebarProps<T> {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  renderItem: (item: T, isSelected: boolean, isCollapsed: boolean) => React.ReactNode;
  getSearchText?: (item: T) => string;
  enableSearch?: boolean;
  enableCollapse?: boolean;
  title: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

function EntitySidebar<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  renderItem,
  getSearchText,
  enableSearch = false,
  enableCollapse = false,
  title,
  collapsed: collapsedProp,
  onToggleCollapse,
  className,
}: EntitySidebarProps<T>) {
  const [search, setSearch] = useState('');
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = collapsedProp !== undefined ? collapsedProp : internalCollapsed;

  // Filter items by search
  const filteredItems = useMemo(() => {
    if (!enableSearch || !search.trim() || !getSearchText) return items;
    const lower = search.trim().toLowerCase();
    return items.filter(item => getSearchText(item).toLowerCase().includes(lower));
  }, [items, search, enableSearch, getSearchText]);

  const handleCollapse = () => {
    if (onToggleCollapse) onToggleCollapse();
    else setInternalCollapsed(c => !c);
  };

  return (
    <aside
      className={cn(
        'border-r border-border transition-all duration-300 flex flex-col',
        'bg-card',
        collapsed ? 'w-20 min-w-[5rem]' : 'w-64',
        'mt-16', // Add margin to push below header
        className
      )}
      style={{
        height: 'calc(100vh - 4rem)', // Adjust height to account for header height (e.g., 4rem)
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header - Fixed Height */}
      <div className="flex items-center justify-between p-3 border-b border-border" style={{ flexShrink: 0, height: '56px' }}>
        {!collapsed ? (
          <h3 className="text-sm font-semibold truncate mr-2">{title}</h3>
        ) : (
          enableCollapse && (
            <button
              onClick={handleCollapse}
              className={cn(
                'p-2 rounded-md flex items-center justify-center w-full',
                'bg-primary/10 hover:bg-primary/20 text-primary transition-colors'
              )}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )
        )}
        {enableCollapse && !collapsed && (
          <button
            onClick={handleCollapse}
            className="p-2 rounded-md hover:bg-muted transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* Search - Fixed Height with Border */}
      {enableSearch && !collapsed && (
        <div className="px-3 py-2 border-b border-border" style={{ flexShrink: 0, height: '48px' }}>
          <div className="relative">
            <input
              type="text"
              className="w-full pl-8 pr-2 py-1 rounded bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder={`Search ${title.toLowerCase()}...`}
              value={""}
              onChange={e => setSearch(e.target.value)}
            />
            <Search className="absolute left-2 top-1.5 h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      )}
      {/* List - takes remaining height */}
      <div
        className={cn('overflow-y-auto flex-1', collapsed && 'px-1')}
        style={{
          flex: '1 1 auto',
          position: 'relative',
          height: 'calc(100vh - 104px)'
        }}
      >
        {filteredItems.length > 0 ? (
          filteredItems.map(item => (
            <div key={item.id} onClick={() => onSelect(item.id)}>
              {renderItem(item, selectedId === item.id, collapsed)}
            </div>
          ))
        ) : (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No {title.toLowerCase()} found
          </div>
        )}
      </div>
    </aside>
  );
}

export default EntitySidebar;
