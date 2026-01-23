import React, { useMemo, useState } from 'react';
import { Clock, Archive, Calendar } from 'lucide-react';
import { useRBAC } from '@/hooks/useRBAC';
import UnifiedSidebar, { SidebarGroup } from '@/components/common/UnifiedSidebar';
import { logger } from '@/services/LoggingService';

interface Show {
  id: string;
  name: string;
  clubName: string;
  startDate: string;
  status: string;
}

interface ShowGroupedSidebarProps {
  shows: Show[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onCloseMobile?: (() => void) | undefined;
  onAdd?: (() => void) | undefined;
}

export const ShowGroupedSidebar: React.FC<ShowGroupedSidebarProps> = ({
  shows,
  selectedId,
  onSelect,
  searchTerm,
  onSearchChange,
  onCloseMobile,
  onAdd
}) => {
  const { hasPermission, isLoading } = useRBAC();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // Start with upcoming groups expanded by default
    const defaultExpanded = new Set<string>();
    // We'll add group IDs as they're created
    return defaultExpanded;
  });

  // Check if user can create shows - only check if RBAC is loaded
  const canCreateShows = !isLoading && hasPermission('show:create');

  // Enhanced debug logging
  logger.debug('ShowGroupedSidebar permissions', 'shows', {
    isLoading,
    hasShowCreatePermission: hasPermission('show:create'),
    canCreateShows,
    onAddProvided: !!onAdd,
  });

  // Debug logging
  // logger.debug('🎪 ShowGroupedSidebar - shows count:', 'shows', { data: shows.length });
  // logger.debug('🎪 ShowGroupedSidebar - selectedId:', 'shows', { data: selectedId });
  // logger.debug('🎪 ShowGroupedSidebar - shows data:', 'shows', { data: shows.slice(0, 3) });
  // logger.debug('🎪 ShowGroupedSidebar - expandedGroups:', 'shows', { data: Array.from(expandedGroups) });

  // Create hierarchical groups for club > status structure  
  const sidebarGroups = useMemo((): SidebarGroup<Show>[] => {
    const today = new Date();
    const currentDate = today.getTime();

    // Group shows by club
    const showsByClub = shows.reduce((acc, show) => {
      const clubName = show.clubName || 'Unknown Club';
      if (!acc[clubName]) {
        acc[clubName] = [];
      }
      acc[clubName].push(show);
      return acc;
    }, {} as Record<string, Show[]>);

    // Create club groups with upcoming/past subgroups
    const groups: SidebarGroup<Show>[] = [];
    
    Object.entries(showsByClub)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([clubName, clubShows]) => {
        const upcoming = clubShows
          .filter(show => new Date(show.startDate).getTime() >= currentDate)
          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
          
        const past = clubShows
          .filter(show => new Date(show.startDate).getTime() < currentDate)
          .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

        // Create subgroups for upcoming and past shows
        if (upcoming.length > 0) {
          groups.push({
            id: `${clubName}-upcoming`,
            title: `${clubName} - Upcoming`,
            icon: Clock,
            count: upcoming.length,
            items: upcoming,
            isExpanded: true // Always show upcoming shows
          });
        }
        
        if (past.length > 0) {
          groups.push({
            id: `${clubName}-past`,
            title: `${clubName} - Past`,
            icon: Archive,
            count: past.length,
            items: past,
            isExpanded: expandedGroups.has(`${clubName}-past`)
          });
        }
      });

    return groups;
  }, [shows, expandedGroups]);

  const handleGroupToggle = (groupId: string, isExpanded: boolean) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (isExpanded) {
        newSet.add(groupId);
      } else {
        newSet.delete(groupId);
      }
      return newSet;
    });
  };

  const renderShowItem = (show: Show, _isSelected: boolean) => {
    return (
      <div className="px-3 py-2">
        <div className="font-medium text-sm truncate">
          {show.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(show.startDate).toLocaleDateString()}
        </div>
      </div>
    );
  };

  return (
    <UnifiedSidebar<Show>
      groups={sidebarGroups}
      selectedId={selectedId}
      onSelect={(id) => {
        onSelect(id);
      }}
      onAdd={canCreateShows ? onAdd : undefined}
      onGroupToggle={handleGroupToggle}
      renderItem={renderShowItem}
      getItemId={(show) => show.id}
      enableSearch={true}
      searchPlaceholder="Search shows..."
      getSearchText={(show) => `${show.name} ${show.clubName}`}
      searchTerm={searchTerm}
      onSearchChange={onSearchChange}
      title="Shows"
      subtitle="Browse and manage dog shows"
      headerIcon={Calendar}
      addButtonText={canCreateShows ? "Add Show" : undefined}
      enableResize={true}
      onCloseMobile={onCloseMobile}
    />
  );
};