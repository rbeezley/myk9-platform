import React, { useState, useMemo } from 'react';
import { BookOpen, Clock, CheckCircle, XCircle } from 'lucide-react';
import { ClassData } from './types/classTypes';
import UnifiedSidebar, { SidebarGroup } from '@/components/common/UnifiedSidebar';
import { shouldShowSection } from './ClassDetailsMain.helpers';

interface ClassGroupedSidebarProps {
  classes: ClassData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export const ClassGroupedSidebar: React.FC<ClassGroupedSidebarProps> = ({
  classes,
  selectedId,
  onSelect,
  searchTerm,
  onSearchChange,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['recent', 'scheduled', 'inprogress'])
  );

  const sidebarGroups = useMemo((): SidebarGroup<ClassData>[] => {
    const groups: SidebarGroup<ClassData>[] = [];

    // Recent classes (last 7 days)
    const recent = classes
      .filter(cls => {
        const classDate = new Date(cls.trialDate);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return classDate >= weekAgo;
      })
      .sort((a, b) => new Date(b.trialDate).getTime() - new Date(a.trialDate).getTime())
      .slice(0, 5);

    if (recent.length > 0) {
      groups.push({
        id: 'recent',
        title: 'Recent',
        icon: Clock,
        count: recent.length,
        items: recent,
        isExpanded: expandedGroups.has('recent'),
      });
    }

    // Group by status
    const statusGroups = classes.reduce(
      (acc, cls) => {
        const status = cls.status;
        if (!acc[status]) {
          acc[status] = [];
        }
        acc[status].push(cls);
        return acc;
      },
      {} as Record<string, ClassData[]>
    );

    // Define status order and icons
    const statusConfig = [
      { key: 'Scheduled', title: 'Scheduled Classes', icon: Clock },
      { key: 'In Progress', title: 'In Progress', icon: BookOpen },
      { key: 'Completed', title: 'Completed', icon: CheckCircle },
      { key: 'Cancelled', title: 'Cancelled', icon: XCircle },
    ];

    statusConfig.forEach(({ key, title, icon }) => {
      if (statusGroups[key] && statusGroups[key].length > 0) {
        const sortedClasses = statusGroups[key].sort(
          (a, b) => new Date(a.trialDate).getTime() - new Date(b.trialDate).getTime()
        );

        groups.push({
          id: `status-${key.toLowerCase().replace(' ', '')}`,
          title,
          icon,
          count: sortedClasses.length,
          items: sortedClasses,
          isExpanded: expandedGroups.has(`status-${key.toLowerCase().replace(' ', '')}`),
        });
      }
    });

    // Group by trial
    const trialGroups = classes.reduce(
      (acc, cls) => {
        const trialKey = cls.trial;
        if (!acc[trialKey]) {
          acc[trialKey] = [];
        }
        acc[trialKey].push(cls);
        return acc;
      },
      {} as Record<string, ClassData[]>
    );

    Object.entries(trialGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([trial, trialClasses]) => {
        groups.push({
          id: `trial-${trial}`,
          title: trial,
          icon: BookOpen,
          count: trialClasses.length,
          items: trialClasses.sort((a, b) => a.classOrder.localeCompare(b.classOrder)),
          isExpanded: expandedGroups.has(`trial-${trial}`),
        });
      });

    return groups;
  }, [classes, expandedGroups]);

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

  const formatClassDisplay = (cls: ClassData) => {
    const parts = [cls.element];
    if (cls.level) parts.push(cls.level);
    if (shouldShowSection(cls)) parts.push(cls.section!);
    return parts.join(' ');
  };

  const renderClassItem = (cls: ClassData, _isSelected: boolean) => {
    return (
      <div className="px-3 py-2">
        <div className="font-medium text-sm truncate">{formatClassDisplay(cls)}</div>
        <div className="text-xs text-muted-foreground">{cls.trial}</div>
        <div className="text-xs text-muted-foreground">
          Judge: {cls.judge} • {new Date(cls.trialDate + 'T00:00:00').toLocaleDateString()}
        </div>
      </div>
    );
  };

  return (
    <UnifiedSidebar<ClassData>
      groups={sidebarGroups}
      selectedId={selectedId}
      onSelect={onSelect}
      onGroupToggle={handleGroupToggle}
      renderItem={renderClassItem}
      getItemId={cls => cls.id}
      enableSearch={true}
      searchPlaceholder="Search classes..."
      getSearchText={cls =>
        `${cls.trial} ${cls.className || ''} ${cls.element || ''} ${cls.level || ''} ${cls.section || ''} ${cls.judge}`
      }
      searchTerm={searchTerm}
      onSearchChange={onSearchChange}
      title="Classes"
      enableResize={true}
    />
  );
};
