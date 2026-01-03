import React, { useMemo } from 'react';
import { Clock, Heart, CheckCircle } from 'lucide-react';
import { TabBar, Tab } from '../../components/ui';
import { getClassDisplayStatus } from '../../utils/statusUtils';

interface ClassEntry {
  id: number;
  element: string;
  level: string;
  section: string;
  class_name: string;
  class_order: number;
  judge_name: string;
  entry_count: number;
  completed_count: number;
  class_status: 'no-status' | 'setup' | 'briefing' | 'break' | 'start_time' | 'in_progress' | 'offline-scoring' | 'completed';
  is_scoring_finalized?: boolean;
  is_favorite: boolean;
  time_limit_seconds?: number;
  time_limit_area2_seconds?: number;
  time_limit_area3_seconds?: number;
  area_count?: number;
  start_time?: string;
  briefing_time?: string;
  break_until?: string;
  dogs: {
    id: number;
    armband: number;
    call_name: string;
    breed: string;
    handler: string;
    in_ring: boolean;
    checkin_status: number;
    is_scored: boolean;
  }[];
}

interface ClassFiltersProps {
  combinedFilter: 'pending' | 'favorites' | 'completed';
  setCombinedFilter: (filter: 'pending' | 'favorites' | 'completed') => void;
  classes: ClassEntry[];
  hapticFeedback: {
    light: () => void;
    medium: () => void;
    heavy: () => void;
  };
}

export const ClassFilters: React.FC<ClassFiltersProps> = ({
  combinedFilter,
  setCombinedFilter,
  classes,
  hapticFeedback,
}) => {
  // Prepare tabs for TabBar component
  const tabs: Tab[] = useMemo(() => [
    {
      id: 'pending',
      label: 'Pending',
      icon: <Clock className="tab-icon" size={16} />,
      count: classes.filter(c => getClassDisplayStatus(c) !== 'completed').length
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: <Heart className="tab-icon" size={16} />,
      count: classes.filter(c => c.is_favorite).length
    },
    {
      id: 'completed',
      label: 'Completed',
      icon: <CheckCircle className="tab-icon" size={16} />,
      count: classes.filter(c => getClassDisplayStatus(c) === 'completed').length
    }
  ], [classes]);

  const handleTabChange = (tabId: string) => {
    hapticFeedback.light();
    setCombinedFilter(tabId as 'pending' | 'favorites' | 'completed');
  };

  return (
    <TabBar
      tabs={tabs}
      activeTab={combinedFilter}
      onTabChange={handleTabChange}
    />
  );
};
