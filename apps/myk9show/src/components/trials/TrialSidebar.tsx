import React, { useState, useMemo } from 'react';
import { Clock, Archive, Trophy } from 'lucide-react';
import { Trial } from './types/trial.types';
import UnifiedSidebar, { SidebarGroup } from '@/components/common/UnifiedSidebar';

interface TrialSidebarProps {
  trials: Trial[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export const TrialSidebar: React.FC<TrialSidebarProps> = ({
  trials,
  selectedId,
  onSelect,
  searchTerm,
  onSearchChange
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['upcoming', 'inprogress'])
  );

  const sidebarGroups = useMemo((): SidebarGroup<Trial>[] => {
    const upcoming: Trial[] = [];
    const inProgress: Trial[] = [];
    const completed: Trial[] = [];

    trials.forEach(trial => {
      const status = (trial.status || 'Upcoming').toLowerCase();
      
      if (status === 'completed') {
        completed.push(trial);
      } else if (status === 'in progress') {
        inProgress.push(trial);
      } else {
        upcoming.push(trial);
      }
    });

    // Sort each group by date
    upcoming.sort((a, b) => new Date(a.trialDate).getTime() - new Date(b.trialDate).getTime());
    inProgress.sort((a, b) => new Date(a.trialDate).getTime() - new Date(b.trialDate).getTime());
    completed.sort((a, b) => new Date(b.trialDate).getTime() - new Date(a.trialDate).getTime());

    const groups: SidebarGroup<Trial>[] = [];
    
    if (upcoming.length > 0) {
      groups.push({
        id: 'upcoming',
        title: 'Upcoming Trials',
        icon: Clock,
        count: upcoming.length,
        items: upcoming,
        isExpanded: expandedGroups.has('upcoming')
      });
    }
    
    if (inProgress.length > 0) {
      groups.push({
        id: 'inprogress',
        title: 'In Progress',
        icon: Trophy,
        count: inProgress.length,
        items: inProgress,
        isExpanded: expandedGroups.has('inprogress')
      });
    }
    
    if (completed.length > 0) {
      groups.push({
        id: 'completed',
        title: 'Completed',
        icon: Archive,
        count: completed.length,
        items: completed,
        isExpanded: expandedGroups.has('completed')
      });
    }

    return groups;
  }, [trials, expandedGroups]);

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

  const renderTrialItem = (trial: Trial, _isSelected: boolean, isCollapsed: boolean) => {
    if (isCollapsed) {
      return (
        <div
          className="flex items-center justify-center w-12 h-12 mx-auto my-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
          title={`${trial.type || 'Trial'} - ${trial.trialNumber}`}
        >
          {(trial.type || 'T').substring(0, 2).toUpperCase()}
        </div>
      );
    }

    return (
      <div className="px-3 py-2 rounded-md">
        <div className="font-medium text-sm truncate">
          {trial.type || 'Trial'}
        </div>
        <div className="text-xs text-muted-foreground">
          {trial.trialNumber}
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(trial.trialDate).toLocaleDateString()}
        </div>
      </div>
    );
  };

  const renderCollapsedTrialItem = (trial: Trial, isSelected: boolean) => {
    return (
      <div
        className={`flex items-center justify-center w-10 h-10 mx-auto my-1 rounded-full text-xs font-medium ${
          isSelected 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-muted text-muted-foreground hover:bg-muted/80'
        }`}
        title={`${trial.type || 'Trial'} - ${trial.trialNumber}`}
      >
        {(trial.type || 'T').substring(0, 1).toUpperCase()}
      </div>
    );
  };

  return (
    <UnifiedSidebar<Trial>
      groups={sidebarGroups}
      selectedId={selectedId}
      onSelect={onSelect}
      onGroupToggle={handleGroupToggle}
      renderItem={renderTrialItem}
      renderCollapsedItem={renderCollapsedTrialItem}
      getItemId={(trial) => trial.id}
      enableSearch={true}
      searchPlaceholder="Search trials..."
      getSearchText={(trial) => `${trial.type || ''} ${trial.trialNumber || ''} ${trial.showName || ''}`}
      searchTerm={searchTerm}
      onSearchChange={onSearchChange}
      title="Trials"
      enableCollapse={true}
      enableResize={true}
    />
  );
};