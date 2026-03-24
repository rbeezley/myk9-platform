import React from 'react';
import { Calendar, Users } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import type { StatCard as StatCardData, ClubTab } from './types';

interface ClubStatisticsProps {
  stats: StatCardData[];
  onTabChange: (tab: ClubTab) => void;
}

export const ClubStatistics: React.FC<ClubStatisticsProps> = ({ stats, onTabChange }) => {
  return (
    <div className="mb-8">
      <StatsGrid columns={2}>
        {stats.map((stat, index) => (
          <StatCard
            key={index}
            icon={stat.type === 'shows' ? Calendar : Users}
            title={stat.title}
            value={stat.value}
            color={stat.type === 'shows' ? 'blue' : 'emerald'}
            subtitle={`${stat.detail1} \u00B7 ${stat.detail2}`}
            onClick={() => onTabChange(stat.tab)}
          />
        ))}
      </StatsGrid>
    </div>
  );
};
