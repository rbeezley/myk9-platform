import React from 'react';
import { cn } from '@/lib/utils';
import EntitySidebar from '@/components/common/EntitySidebar';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import type { Show } from '@/types/show-types';

interface ShowDetailsLayoutProps {
  shows: Show[];
  selectedShowId: string | null;
  onSelectShow: (id: string) => void;
  renderSidebarItem: (item: Show, isSelected: boolean, isCollapsed: boolean) => React.ReactNode;
  getSearchText: (item: Show) => string;
  children: React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
}

const ShowDetailsLayout: React.FC<ShowDetailsLayoutProps> = ({
  shows,
  selectedShowId,
  onSelectShow,
  renderSidebarItem,
  getSearchText,
  children,
  emptyState,
  className
}) => {
  // Responsive/collapsible sidebar
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const { isCollapsed, toggleCollapsed } = useResizableSidebar({
    initialWidth: 280,
    minWidth: 200,
    maxWidth: 400,
    storageKey: 'showSidebarWidth',
    defaultCollapsed: isMobile
  });

  // Find selected show
  const selectedShow = selectedShowId ? shows.find(show => show.id === selectedShowId) : null;

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden relative bg-background">
      {/* Sidebar */}
      <EntitySidebar
        items={shows}
        selectedId={selectedShowId}
        onSelect={onSelectShow}
        renderItem={renderSidebarItem}
        getSearchText={getSearchText}
        enableSearch
        enableCollapse
        title=""
        collapsed={isCollapsed}
        onToggleCollapse={toggleCollapsed}
        className={cn(
          'z-20 bg-card',
          'md:relative absolute',
          isCollapsed ? 'md:w-[80px]' : 'w-full md:w-auto'
        )}
      />
      {/* Mobile overlay backdrop */}
      {!isCollapsed && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-10 md:hidden"
          onClick={toggleCollapsed}
        />
      )}
      {/* Main content */}
      <div className={cn(
        'flex-1 overflow-auto pt-20 transition-all duration-200 flex flex-col justify-start items-center',
        className
      )}>
        {selectedShow ? children : (emptyState || null)}
      </div>
    </div>
  );
};

export default ShowDetailsLayout;
