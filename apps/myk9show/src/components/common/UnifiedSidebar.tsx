import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, ChevronDown, Search, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Apple-inspired design tokens matching AdminSidebar
const SIDEBAR_TOKENS = {
  collapsed: {
    width: '80px',
    minWidth: '5rem'
  },
  expanded: {
    width: '320px',
    minWidth: '20rem'
  },
  heights: {
    header: '64px',
    search: '48px',
    groupHeader: '32px',
    item: '44px'
  },
  colors: {
    container: 'bg-card',
    border: 'border-border',
    header: 'bg-card border-b border-border',
    search: 'bg-background/80 border-border/60 backdrop-blur-sm shadow-sm',
    item: {
      default: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      selected: 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm border-l-2 border-primary',
      collapsed: 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
    },
    text: {
      primary: 'text-foreground',
      secondary: 'text-muted-foreground',
      selected: 'text-primary font-medium',
      groupHeader: 'text-xs font-medium text-muted-foreground uppercase tracking-wide'
    },
    groupHeader: 'text-xs font-medium text-muted-foreground uppercase tracking-wide'
  },
  transitions: 'transition-all duration-200'
} as const;

export interface SidebarGroup<T> {
  id: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  count?: number;
  items: T[];
  isExpanded?: boolean;
  isCollapsible?: boolean;
  description?: string;
}

export interface UnifiedSidebarProps<T> {
  // Core data
  items?: T[];
  groups?: SidebarGroup<T>[];
  selectedId: string | null;
  
  // Callbacks
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onGroupToggle?: (groupId: string, isExpanded: boolean) => void;
  onCloseMobile?: () => void;
  
  // Rendering
  renderItem: (item: T, isSelected: boolean, isCollapsed: boolean) => React.ReactNode;
  renderCollapsedItem?: (item: T, isSelected: boolean) => React.ReactNode;
  getItemId: (item: T) => string;
  
  // Search
  enableSearch?: boolean;
  searchPlaceholder?: string;
  getSearchText?: (item: T) => string;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  
  // Appearance
  title: string;
  subtitle?: string;
  headerIcon?: React.ComponentType<{ className?: string }>;
  addButtonText?: string;
  addButtonIcon?: React.ComponentType<{ className?: string }>;
  
  // Behavior
  enableCollapse?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  enableVirtualization?: boolean;
  enableResize?: boolean;
  
  // Styling
  className?: string;
  width?: number;
  onWidthChange?: (width: number) => void;
  
  // Performance
  itemHeight?: number;
  overscan?: number;
  
  // Footer content
  footerContent?: React.ReactNode;
}

function UnifiedSidebar<T extends { id: string }>({
  items = [],
  groups,
  selectedId,
  onSelect,
  onAdd,
  onGroupToggle,
  onCloseMobile,
  renderItem,
  renderCollapsedItem,
  getItemId,
  enableSearch = true,
  searchPlaceholder,
  getSearchText,
  searchTerm: controlledSearchTerm,
  onSearchChange,
  title,
  subtitle,
  headerIcon: HeaderIcon,
  addButtonText = 'Add',
  addButtonIcon: AddIcon = Plus,
  enableCollapse = true,
  isCollapsed: controlledIsCollapsed,
  onToggleCollapse,
  enableVirtualization = false,
  enableResize = false,
  className,
  width: controlledWidth,
  onWidthChange,
  itemHeight = 44,
  overscan = 5,
  footerContent
}: UnifiedSidebarProps<T>) {
  // Internal state
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false);
  const [internalWidth, setInternalWidth] = useState(320);
  const [expandedGroups] = useState<Set<string>>(new Set());
  const [isResizing, setIsResizing] = useState(false);
  const [listHeight, setListHeight] = useState(500);
  
  // Refs
  const listRef = useRef<List>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Debug logging for add button visibility
  useEffect(() => {
    const actualIsCollapsed = controlledIsCollapsed !== undefined ? controlledIsCollapsed : internalIsCollapsed;
    console.log('🔧 UnifiedSidebar - onAdd:', !!onAdd, 'isCollapsed:', actualIsCollapsed, 'addButtonText:', addButtonText);
  }, [onAdd, controlledIsCollapsed, internalIsCollapsed, addButtonText]);
  
  // Controlled vs uncontrolled state
  const searchTerm = controlledSearchTerm !== undefined ? controlledSearchTerm : internalSearchTerm;
  const isCollapsed = controlledIsCollapsed !== undefined ? controlledIsCollapsed : internalIsCollapsed;
  const width = controlledWidth !== undefined ? controlledWidth : internalWidth;
  
  // Calculate list height on mount and window resize
  useEffect(() => {
    const updateHeight = () => {
      if (typeof window !== 'undefined') {
        const headerHeight = enableSearch ? 104 : 56; // Header + search or just header
        setListHeight(window.innerHeight - headerHeight - 32); // Extra padding
      }
    };
    
    updateHeight();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }
  }, [enableSearch]);
  
  // Resize functionality
  const startResizing = useCallback((e: React.MouseEvent) => {
    if (!enableResize || isCollapsed) return;
    
    e.preventDefault();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startWidth = width;
    
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(280, Math.min(600, startWidth + (e.clientX - startX)));
      setInternalWidth(newWidth);
      onWidthChange?.(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [enableResize, isCollapsed, width, onWidthChange]);
  
  // Search functionality
  const handleSearchChange = useCallback((value: string) => {
    if (onSearchChange) {
      onSearchChange(value);
    } else {
      setInternalSearchTerm(value);
    }
  }, [onSearchChange]);
  
  // Collapse functionality
  const handleToggleCollapse = useCallback(() => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalIsCollapsed(prev => !prev);
    }
  }, [onToggleCollapse]);
  
  
  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!enableSearch || !searchTerm.trim() || !getSearchText) {
      return items;
    }
    
    const term = searchTerm.toLowerCase();
    return items.filter(item => getSearchText(item).toLowerCase().includes(term));
  }, [items, searchTerm, enableSearch, getSearchText]);
  
  // Process groups or create flat list
  const processedData = useMemo(() => {
    if (groups) {
      return groups.map(group => ({
        ...group,
        isExpanded: group.isExpanded !== undefined ? group.isExpanded : expandedGroups.has(group.id),
        items: enableSearch && searchTerm.trim() && getSearchText 
          ? group.items.filter(item => getSearchText(item).toLowerCase().includes(searchTerm.toLowerCase()))
          : group.items
      }));
    }
    return null;
  }, [groups, expandedGroups, enableSearch, searchTerm, getSearchText]);
  
  // Flatten items for virtualization
  const flattenedItems = useMemo(() => {
    if (processedData) {
      return processedData.reduce((acc, group) => {
        if (group.isExpanded) {
          acc.push(...group.items);
        }
        return acc;
      }, [] as T[]);
    }
    return filteredItems;
  }, [processedData, filteredItems]);
  
  // Find selected index for virtualization
  const selectedIndex = useMemo(() => {
    if (!selectedId) return -1;
    return flattenedItems.findIndex(item => getItemId(item) === selectedId);
  }, [flattenedItems, selectedId, getItemId]);
  
  // Scroll to selected item
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current && enableVirtualization) {
      listRef.current.scrollToItem(selectedIndex, 'smart');
    }
  }, [selectedIndex, enableVirtualization]);
  
  // Virtualized row renderer
  const rowRenderer = useCallback(({ index, style }: { index: number, style: React.CSSProperties }) => {
    const item = flattenedItems[index];
    const isSelected = getItemId(item) === selectedId;
    
    const adjustedStyle = isCollapsed ? {
      ...style,
      width: SIDEBAR_TOKENS.collapsed.width,
      left: 0
    } : style;
    
    return (
      <div style={adjustedStyle} key={getItemId(item)}>
        <div
          onClick={() => onSelect(getItemId(item))}
          className={cn(
            'cursor-pointer transition-colors',
            isSelected 
              ? SIDEBAR_TOKENS.colors.item.selected
              : SIDEBAR_TOKENS.colors.item.default
          )}
        >
          {isCollapsed && renderCollapsedItem
            ? renderCollapsedItem(item, isSelected)
            : renderItem(item, isSelected, isCollapsed)
          }
        </div>
      </div>
    );
  }, [flattenedItems, selectedId, getItemId, isCollapsed, onSelect, renderItem, renderCollapsedItem]);
  
  // Render grouped content with AdminSidebar styling
  const renderGroupedContent = () => {
    if (!processedData) return null;
    
    return (
      <nav className="space-y-8">
        {processedData.map((group) => (
          <div key={group.id}>
            {/* Group Header - clickable with expand/collapse */}
            {!isCollapsed && (
              <div 
                className={cn(
                  'mb-3 px-2 cursor-pointer flex items-center justify-between group',
                  SIDEBAR_TOKENS.colors.groupHeader,
                  'hover:text-foreground transition-colors'
                )}
                onClick={() => onGroupToggle?.(group.id, !group.isExpanded)}
              >
                <h3 className="text-xs font-medium uppercase tracking-wider">
                  {group.title}
                </h3>
                <div className="opacity-60 group-hover:opacity-100 transition-opacity">
                  {group.isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              </div>
            )}
            
            {/* Group Items */}
            {(group.isExpanded !== false || isCollapsed) && (
              <div className="space-y-1">
                {group.items.map(item => {
                  const isSelected = getItemId(item) === selectedId;
                  return (
                    <div
                      key={getItemId(item)}
                      onClick={() => onSelect(getItemId(item))}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer',
                        SIDEBAR_TOKENS.transitions,
                        isSelected
                          ? SIDEBAR_TOKENS.colors.item.selected
                          : SIDEBAR_TOKENS.colors.item.default
                      )}
                    >
                      {isCollapsed && renderCollapsedItem
                        ? renderCollapsedItem(item, isSelected)
                        : renderItem(item, isSelected, isCollapsed)
                      }
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>
    );
  };
  
  // Render flat content with AdminSidebar styling
  const renderFlatContent = () => {
    if (enableVirtualization && !isCollapsed && flattenedItems.length > 50) {
      return (
        <div className="h-full">
          <List
            ref={listRef}
            height={listHeight}
            width={width}
            itemCount={flattenedItems.length}
            itemSize={itemHeight}
            overscanCount={overscan}
            className="scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent"
          >
            {rowRenderer}
          </List>
        </div>
      );
    }
    
    return (
      <nav className="space-y-1">
        {flattenedItems.map(item => {
          const isSelected = getItemId(item) === selectedId;
          return (
            <div
              key={getItemId(item)}
              onClick={() => onSelect(getItemId(item))}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer',
                SIDEBAR_TOKENS.transitions,
                isSelected 
                  ? SIDEBAR_TOKENS.colors.item.selected
                  : SIDEBAR_TOKENS.colors.item.default
              )}
            >
              {isCollapsed && renderCollapsedItem
                ? renderCollapsedItem(item, isSelected)
                : renderItem(item, isSelected, isCollapsed)
              }
            </div>
          );
        })}
      </nav>
    );
  };
  
  return (
    <div 
      ref={resizeRef}
      className={cn(
        'flex h-full flex-col relative z-10',
        SIDEBAR_TOKENS.colors.container,
        isResizing && 'select-none',
        className
      )}
      style={{
        width: isCollapsed ? SIDEBAR_TOKENS.collapsed.width : `${width}px`,
        minWidth: isCollapsed ? SIDEBAR_TOKENS.collapsed.minWidth : SIDEBAR_TOKENS.expanded.minWidth
      }}
    >
      {/* Header - matches AdminSidebar exactly */}
      <div className={cn(
        'flex h-16 items-center',
        isCollapsed ? 'justify-center px-2' : 'justify-between px-6',
        SIDEBAR_TOKENS.colors.header
      )}>
        <div className="flex items-center gap-3">
          {HeaderIcon && (
            <div className="flex h-8 w-8 items-center justify-center">
              <HeaderIcon className="h-4 w-4 text-foreground" />
            </div>
          )}
          {!isCollapsed && (
            <div>
              <h2 className="text-base font-semibold" style={{ fontWeight: 590 }}>
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
          )}
        </div>
        
        {/* Mobile close button and actions */}
        <div className="flex items-center gap-2">
          {onAdd && !isCollapsed && (
            <Button
              size="sm"
              onClick={onAdd}
              className="h-8 px-3"
              variant="default"
            >
              <AddIcon className="h-4 w-4 mr-1.5" />
              {addButtonText}
            </Button>
          )}
          
          {onCloseMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCloseMobile}
              className="md:hidden"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          
          {enableCollapse && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleToggleCollapse}
              className="h-8 w-8 p-0"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
      
      {/* Search */}
      {enableSearch && !isCollapsed && (
        <div className="px-4 py-4 border-b border-border/20 bg-gradient-to-b from-background/50 to-muted/10">
          <div className="relative group">
            <input
              type="text"
              className={cn(
                'w-full pl-9 pr-4 py-3 text-sm rounded-xl',
                'bg-card-secondary shadow',
                'backdrop-blur-sm shadow-lg shadow-black/5 dark:shadow-black/20',
                'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                'text-gray-900 dark:text-gray-100',
                'focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-blue-400/20',
                'focus:border-blue-500/60 dark:focus:border-blue-400/60',
                'focus:bg-white dark:focus:bg-gray-800',
                'focus:shadow-xl focus:shadow-blue-500/10 dark:focus:shadow-blue-400/10',
                'hover:border-gray-300/80 dark:hover:border-gray-600/80',
                'hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30',
                'transition-all duration-300 ease-out',
                'focus:outline-none focus:scale-[1.02]'
              )}
              placeholder={searchPlaceholder || `Search ${title.toLowerCase()}...`}
              value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
            />
            <Search className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-all duration-300',
              searchTerm ? 'text-blue-500 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400',
              'group-focus-within:text-blue-500 dark:group-focus-within:text-blue-400',
              'group-focus-within:scale-110'
            )} />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange('')}
                className={cn(
                  'absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full',
                  'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300',
                  'hover:bg-gray-100 dark:hover:bg-gray-700/50',
                  'hover:scale-110 active:scale-95',
                  'transition-all duration-200 ease-out',
                  'flex items-center justify-center'
                )}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Navigation Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {processedData ? renderGroupedContent() : renderFlatContent()}
        
        {/* Empty state - hidden when collapsed */}
        {!isCollapsed && (processedData ? processedData.every(group => group.items.length === 0) : filteredItems.length === 0) && (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <div className="text-sm text-muted-foreground">
              {searchTerm ? `No ${title.toLowerCase()} match your search` : `No ${title.toLowerCase()} found`}
            </div>
            {searchTerm && (
              <div className="text-xs text-muted-foreground mt-1">
                Try a different search term
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Footer - matches AdminSidebar pattern */}
      {footerContent && (
        <div className="border-t border-border p-4">
          {footerContent}
        </div>
      )}
      
      {/* Resize Handle */}
      {enableResize && !isCollapsed && (
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-primary/30 transition-colors"
          onMouseDown={startResizing}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

export default UnifiedSidebar;