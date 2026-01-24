import React, { useCallback, useMemo, useState, memo } from 'react';
import { Clock, Archive, Calendar } from 'lucide-react';
import { useRBAC } from '@/hooks/useRBAC';
import UnifiedSidebar, { SidebarGroup } from '@/components/common/UnifiedSidebar';

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

const ShowGroupedSidebarInner: React.FC<ShowGroupedSidebarProps> = ({
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
    return new Set<string>();
  });

  // Check if user can create shows - only check if RBAC is loaded
  const canCreateShows = !isLoading && hasPermission('show:create');

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

  const handleGroupToggle = useCallback((groupId: string, isExpanded: boolean) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (isExpanded) {
        newSet.add(groupId);
      } else {
        newSet.delete(groupId);
      }
      return newSet;
    });
  }, []);

  // Memoize renderShowItem to prevent re-renders
  const renderShowItem = useCallback((show: Show, _isSelected: boolean) => {
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
  }, []);

  // Memoize getItemId callback
  const getItemId = useCallback((show: Show) => show.id, []);

  // Memoize getSearchText callback
  const getSearchText = useCallback((show: Show) => `${show.name} ${show.clubName}`, []);

  // Memoize the onAdd prop to ensure stable reference
  const effectiveOnAdd = useMemo(() =>
    canCreateShows ? onAdd : undefined,
    [canCreateShows, onAdd]
  );

  // Memoize addButtonText
  const addButtonText = useMemo(() =>
    canCreateShows ? "Add Show" : undefined,
    [canCreateShows]
  );

  return (
    <UnifiedSidebar<Show>
      groups={sidebarGroups}
      selectedId={selectedId}
      onSelect={onSelect}
      onAdd={effectiveOnAdd}
      onGroupToggle={handleGroupToggle}
      renderItem={renderShowItem}
      getItemId={getItemId}
      enableSearch={true}
      searchPlaceholder="Search shows..."
      getSearchText={getSearchText}
      searchTerm={searchTerm}
      onSearchChange={onSearchChange}
      title="Shows"
      subtitle="Browse and manage dog shows"
      headerIcon={Calendar}
      addButtonText={addButtonText}
      enableResize={true}
      onCloseMobile={onCloseMobile}
    />
  );
};

// Wrap with React.memo for performance
export const ShowGroupedSidebar = memo(ShowGroupedSidebarInner);