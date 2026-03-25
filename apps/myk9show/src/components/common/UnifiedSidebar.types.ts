import React from 'react';

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
