import React from 'react';
import { Calendar, Users } from 'lucide-react';
import type { StatCard, ClubTab } from './types';

interface ClubStatisticsProps {
  stats: StatCard[];
  onTabChange: (tab: ClubTab) => void;
}

export const ClubStatistics: React.FC<ClubStatisticsProps> = ({ stats, onTabChange }) => {
  return (
    <div className="mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-card border border-border rounded-xl p-6 hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer"
            onClick={() => onTabChange(stat.tab)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onTabChange(stat.tab)}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${
                stat.type === 'shows' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'
              }`}>
                {stat.type === 'shows' ? <Calendar className="w-5 h-5" /> : <Users className="w-5 h-5" />}
              </div>

              <div className="text-right">
                <div className="text-sm font-medium text-foreground">{stat.title}</div>
              </div>
            </div>

            <div className="text-2xl font-bold text-foreground mb-2">{stat.value}</div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{stat.detail1}</span>
              <span>{stat.detail2}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
