import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, ChevronDown, Search, Plus, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Soft Modern design tokens - warm, approachable, polished
// Uses CSS variable --primary for dynamic accent color support
const SIDEBAR_TOKENS = {
  collapsed: {
    width: '80px',
    minWidth: '5rem'
  },
  expanded: {
    width: '240px',
    minWidth: '12.5rem'
  },
  heights: {
    header: '64px',
    search: '48px',
    groupHeader: '32px',
    item: '44px'
  },
  colors: {
    // Use CSS variable for seamless integration with page background
    container: 'bg-[var(--sidebar)]',
    border: 'border-slate-200/60 dark:border-slate-800/60',
    // Header with subtle depth - transparent to inherit sidebar background
    header: 'bg-transparent border-b border-slate-200/20 dark:border-slate-800/20',
    // Elevated search with glass effect
    search: 'bg-white/90 dark:bg-slate-800/90 border-slate-200/60 dark:border-slate-700/60 backdrop-blur-md',
    item: {
      // Subtle hover state - uses primary accent color
      default: 'text-slate-600 dark:text-slate-400 hover:bg-primary/10 hover:text-slate-900 dark:hover:text-slate-200',
      // Primary accent color for selected state
      selected: 'bg-primary/15 dark:bg-primary/20 text-primary shadow-sm border-l-2 border-primary',
      // Collapsed state
      collapsed: 'hover:bg-primary/10 text-slate-500 dark:text-slate-400 hover:text-primary'
    },
    text: {
      primary: 'text-slate-900 dark:text-slate-100',
      secondary: 'text-slate-500 dark:text-slate-400',
      selected: 'text-primary font-medium',
      groupHeader: 'text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider'
    },
    groupHeader: 'text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider'
  },
  // Spring-like animation curve for bouncy micro-interactions
  transitions: {
    default: 'transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
    fast: 'transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
    slow: 'transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]'
  }
} as const;

export interface SidebarGroup<T> {
  id: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }> | undefined;
  count?: number | undefined;
  items: T[];
  isExpanded?: boolean | undefined;
  isCollapsible?: boolean | undefined;
  description?: string | undefined;
}

export interface UnifiedSidebarProps<T> {
  // Core data
  items?: T[] | undefined;
  groups?: SidebarGroup<T>[] | undefined;
  selectedId: string | null;

  // Callbacks
  onSelect: (id: string) => void;
  onAdd?: (() => void) | undefined;
  onGroupToggle?: ((groupId: string, isExpanded: boolean) => void) | undefined;
  onCloseMobile?: (() => void) | undefined;

  // Rendering
  renderItem: (item: T, isSelected: boolean, isCollapsed: boolean) => React.ReactNode;
  renderCollapsedItem?: ((item: T, isSelected: boolean) => React.ReactNode) | undefined;
  getItemId: (item: T) => string;

  // Search
  enableSearch?: boolean | undefined;
  searchPlaceholder?: string | undefined;
  getSearchText?: ((item: T) => string) | undefined;
  searchTerm?: string | undefined;
  onSearchChange?: ((term: string) => void) | undefined;

  // Appearance
  title: string;
  subtitle?: string | undefined;
  headerIcon?: React.ComponentType<{ className?: string }> | undefined;
  addButtonText?: string | undefined;
  addButtonIcon?: React.ComponentType<{ className?: string }> | undefined;

  // Behavior
  enableCollapse?: boolean | undefined;
  isCollapsed?: boolean | undefined;
  onToggleCollapse?: (() => void) | undefined;
  enableVirtualization?: boolean | undefined;
  enableResize?: boolean | undefined;

  // Styling
  className?: string | undefined;
  width?: number | undefined;
  onWidthChange?: ((width: number) => void) | undefined;

  // Performance
  itemHeight?: number | undefined;
  overscan?: number | undefined;

  // Footer content
  footerContent?: React.ReactNode | undefined;
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
  enableCollapse = false,
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
  // Helper to calculate responsive width based on viewport
  const getResponsiveWidth = useCallback(() => {
    if (typeof window === 'undefined') return 280;
    const vw = window.innerWidth;
    if (vw < 1280) return 240;      // Narrower on smaller screens
    if (vw < 1536) return 280;      // Medium screens
    return 320;                      // Wider on large screens
  }, []);

  // Internal state
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false);
  const [internalWidth, setInternalWidth] = useState(() =>
    typeof window !== 'undefined' ? getResponsiveWidth() : 280
  );
  const [expandedGroups] = useState<Set<string>>(new Set());
  const [isResizing, setIsResizing] = useState(false);
  const [listHeight, setListHeight] = useState(500);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Refs
  const listRef = useRef<List>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Controlled vs uncontrolled state
  const searchTerm = controlledSearchTerm !== undefined ? controlledSearchTerm : internalSearchTerm;
  const isCollapsed = controlledIsCollapsed !== undefined ? controlledIsCollapsed : internalIsCollapsed;
  const width = controlledWidth !== undefined ? controlledWidth : internalWidth;

  // Calculate list height and responsive width on mount and window resize
  useEffect(() => {
    const updateDimensions = () => {
      if (typeof window !== 'undefined') {
        const APP_HEADER_HEIGHT = 64;
        const sidebarHeaderHeight = enableSearch ? 104 : 56;
        setListHeight(window.innerHeight - APP_HEADER_HEIGHT - sidebarHeaderHeight - 32);

        // Update width responsively if not being manually resized and not controlled
        if (!isResizing && controlledWidth === undefined) {
          setInternalWidth(getResponsiveWidth());
        }
      }
    };

    updateDimensions();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    }
    return undefined;
  }, [enableSearch, isResizing, controlledWidth, getResponsiveWidth]);

  // Resize functionality
  const startResizing = useCallback((e: React.MouseEvent) => {
    if (!enableResize || isCollapsed) return;

    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(400, startWidth + (e.clientX - startX)));
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
      <div
        style={{
          ...adjustedStyle,
          // Staggered entrance animation
          animationDelay: `${Math.min(index * 30, 300)}ms`
        }}
        key={getItemId(item)}
        className="animate-in fade-in slide-in-from-left-2 duration-300"
      >
        <div
          onClick={() => onSelect(getItemId(item))}
          className={cn(
            'cursor-pointer rounded-lg mx-1',
            SIDEBAR_TOKENS.transitions.default,
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

  // Render grouped content with enhanced styling
  const renderGroupedContent = () => {
    if (!processedData) return null;

    return (
      <nav className="space-y-6">
        {processedData.map((group, groupIndex) => (
          <div
            key={group.id}
            className="animate-in fade-in slide-in-from-left-3 duration-500"
            style={{ animationDelay: `${groupIndex * 100}ms` }}
          >
            {/* Group Header with hover expansion */}
            {!isCollapsed && (
              <div
                className={cn(
                  'mb-2 px-3 cursor-pointer flex items-center justify-between group rounded-md py-1.5',
                  SIDEBAR_TOKENS.colors.groupHeader,
                  'hover:bg-slate-100/50 dark:hover:bg-slate-800/30',
                  SIDEBAR_TOKENS.transitions.fast
                )}
                onClick={() => onGroupToggle?.(group.id, !group.isExpanded)}
              >
                <h3 className="text-[11px] font-semibold uppercase tracking-widest">
                  {group.title}
                </h3>
                <div className={cn(
                  'opacity-0 group-hover:opacity-100',
                  SIDEBAR_TOKENS.transitions.fast
                )}>
                  {group.isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                  )}
                </div>
              </div>
            )}

            {/* Group Items with staggered animation */}
            {(group.isExpanded !== false || isCollapsed) && (
              <div className="space-y-0.5">
                {group.items.map((item, itemIndex) => {
                  const isSelected = getItemId(item) === selectedId;
                  return (
                    <div
                      key={getItemId(item)}
                      onClick={() => onSelect(getItemId(item))}
                      className={cn(
                        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm cursor-pointer',
                        SIDEBAR_TOKENS.transitions.default,
                        'animate-in fade-in slide-in-from-left-2 duration-300',
                        isSelected
                          ? SIDEBAR_TOKENS.colors.item.selected
                          : SIDEBAR_TOKENS.colors.item.default,
                        // Subtle scale on hover
                        'hover:scale-[1.01] active:scale-[0.99]'
                      )}
                      style={{ animationDelay: `${(groupIndex * 50) + (itemIndex * 25)}ms` }}
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

  // Render flat content with enhanced styling
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
            className="scrollbar-thin scrollbar-thumb-slate-300/50 dark:scrollbar-thumb-slate-700/50 scrollbar-track-transparent"
          >
            {rowRenderer}
          </List>
        </div>
      );
    }

    return (
      <nav className="space-y-1">
        {flattenedItems.map((item, index) => {
          const isSelected = getItemId(item) === selectedId;
          return (
            <div
              key={getItemId(item)}
              onClick={() => onSelect(getItemId(item))}
              className={cn(
                'cursor-pointer rounded-lg',
                SIDEBAR_TOKENS.transitions.default,
                'animate-in fade-in slide-in-from-left-2 duration-300',
                isSelected
                  ? 'bg-primary/15 dark:bg-primary/20'
                  : 'hover:bg-muted/50'
              )}
              style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
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
        SIDEBAR_TOKENS.transitions.slow,
        className
      )}
      style={{
        width: isCollapsed ? SIDEBAR_TOKENS.collapsed.width : `${width}px`,
        minWidth: isCollapsed ? SIDEBAR_TOKENS.collapsed.minWidth : SIDEBAR_TOKENS.expanded.minWidth
      }}
    >
      {/* Header with glass effect */}
      <div className={cn(
        'flex h-16 items-center',
        isCollapsed ? 'justify-center px-2' : 'justify-between px-5',
        SIDEBAR_TOKENS.colors.header,
        SIDEBAR_TOKENS.transitions.default
      )}>
        <div className={cn(
          'flex items-center gap-3',
          SIDEBAR_TOKENS.transitions.fast
        )}>
          {HeaderIcon && (
            <div className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              'bg-primary',
              'shadow-lg shadow-primary/25 dark:shadow-primary/40',
              SIDEBAR_TOKENS.transitions.default,
              'hover:scale-105 hover:shadow-xl hover:shadow-primary/30'
            )}>
              <HeaderIcon className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
          )}
          {!isCollapsed && (
            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100" style={{ fontWeight: 600 }}>
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions with smooth transitions */}
        <div className="flex items-center gap-1.5">
          {onAdd && !isCollapsed && (
            <Button
              size="sm"
              onClick={onAdd}
              className={cn(
                'h-8 px-3 rounded-lg',
                'bg-primary hover:bg-primary/90',
                'text-primary-foreground shadow-md shadow-primary/25',
                'hover:shadow-lg hover:shadow-primary/30 hover:scale-[1.02]',
                'active:scale-[0.98]',
                SIDEBAR_TOKENS.transitions.default
              )}
            >
              <AddIcon className="h-3.5 w-3.5 mr-1.5" />
              {addButtonText}
            </Button>
          )}

          {onCloseMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCloseMobile}
              className={cn(
                'md:hidden h-8 w-8 rounded-lg',
                'hover:bg-slate-100 dark:hover:bg-slate-800',
                SIDEBAR_TOKENS.transitions.fast
              )}
            >
              <X className="h-4 w-4 text-slate-500" />
            </Button>
          )}

          {enableCollapse && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleToggleCollapse}
              className={cn(
                'h-8 w-8 p-0 rounded-lg',
                'hover:bg-slate-100 dark:hover:bg-slate-800',
                'hover:scale-105 active:scale-95',
                SIDEBAR_TOKENS.transitions.default
              )}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Search with focus animation */}
      {enableSearch && !isCollapsed && (
        <div className={cn(
          'px-4 py-3 border-b',
          'border-slate-200/20 dark:border-slate-800/20',
          SIDEBAR_TOKENS.transitions.default
        )}>
          <div className={cn(
            'relative group',
            SIDEBAR_TOKENS.transitions.default
          )}>
            <input
              type="text"
              className={cn(
                'w-full pl-10 pr-4 py-2.5 text-sm rounded-xl',
                'bg-white dark:bg-slate-800/80',
                'border border-slate-200/60 dark:border-slate-700/60',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'text-slate-900 dark:text-slate-100',
                // Focus states with primary accent color
                'focus:ring-2 focus:ring-primary/20',
                'focus:border-primary/60',
                'focus:bg-white dark:focus:bg-slate-800',
                'focus:shadow-lg focus:shadow-primary/10',
                // Hover states
                'hover:border-slate-300 dark:hover:border-slate-600',
                // Scale animation on focus
                isSearchFocused && 'scale-[1.01]',
                SIDEBAR_TOKENS.transitions.default,
                'focus:outline-none'
              )}
              placeholder={searchPlaceholder || `Search ${title.toLowerCase()}...`}
              value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
            <Search className={cn(
              'absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4',
              SIDEBAR_TOKENS.transitions.default,
              searchTerm || isSearchFocused
                ? 'text-primary scale-110'
                : 'text-slate-400 dark:text-slate-500'
            )} />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange('')}
                className={cn(
                  'absolute right-3 top-1/2 -translate-y-1/2',
                  'h-5 w-5 rounded-full',
                  'text-slate-400 dark:text-slate-500',
                  'hover:text-slate-600 dark:hover:text-slate-300',
                  'hover:bg-slate-100 dark:hover:bg-slate-700/50',
                  'hover:scale-110 active:scale-95',
                  SIDEBAR_TOKENS.transitions.fast,
                  'flex items-center justify-center'
                )}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation Content with smooth scrolling */}
      <div className={cn(
        'flex-1 overflow-y-auto px-3 py-4',
        'scrollbar-thin scrollbar-thumb-slate-300/50 dark:scrollbar-thumb-slate-700/50 scrollbar-track-transparent'
      )}>
        {processedData ? renderGroupedContent() : renderFlatContent()}

        {/* Empty state with refined design */}
        {!isCollapsed && (processedData ? processedData.every(group => group.items.length === 0) : filteredItems.length === 0) && (
          <div className={cn(
            'flex flex-col items-center justify-center h-full p-6 text-center',
            'animate-in fade-in zoom-in-95 duration-500'
          )}>
            <div className={cn(
              'w-12 h-12 rounded-2xl mb-4',
              'bg-primary/10',
              'flex items-center justify-center',
              'shadow-inner'
            )}>
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {searchTerm ? `No ${title.toLowerCase()} match your search` : `No ${title.toLowerCase()} yet`}
            </div>
            {searchTerm && (
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                Try a different search term
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with subtle separator */}
      {footerContent && (
        <div className={cn(
          'border-t border-slate-200/20 dark:border-slate-800/20 p-4'
        )}>
          {footerContent}
        </div>
      )}

      {/* Resize Handle with visual feedback */}
      {enableResize && !isCollapsed && (
        <div
          className={cn(
            'absolute top-0 right-0 w-1 h-full cursor-ew-resize',
            'hover:bg-primary/40',
            'active:bg-primary/60',
            SIDEBAR_TOKENS.transitions.fast
          )}
          onMouseDown={startResizing}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

export default UnifiedSidebar;
