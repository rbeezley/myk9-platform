import React from "react";
import StatCard from "./StatCard";

export interface Stat {
  title: string;
  iconClass: string;
  iconBg: string;
  iconColor: string;
  value: string;
  trend: string;
  trendIcon: string;
  trendColor: string;
  detail1: string;
  detail2: string;
  progress: string;
  progressColor: string;
}

interface ShowStatisticsProps {
  stats: Stat[];
}

/**
 * ShowStatistics component to display statistics for a show
 * Should be used inside EntityCardContainer within EntityPageLayout
 */
const ShowStatistics: React.FC<ShowStatisticsProps> = ({ stats }) => {
  // TODO: Implement RBAC - Currently showing all stats to all users
  // When user roles are implemented:
  // - Revenue stats should only be visible to admins and show secretaries
  // - Other sensitive stats should be filtered based on user role
  const filteredStats = stats;
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Show Statistics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredStats.map((stat, i) => (
          <StatCard key={i} stat={stat} />
        ))}
      </div>
    </div>
  );
};

export default ShowStatistics;
