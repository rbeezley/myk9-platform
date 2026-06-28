/**
 * PlatformStatisticsSection Component
 *
 * Section displaying platform statistics using StatCard components.
 * Only shows real data from the database; no simulated metrics.
 */

import { useNavigate } from 'react-router-dom';
import { BarChart3, Calendar, Dog, Users } from 'lucide-react';
import { StatCard, StatCardSkeleton, StatsGrid } from '@myk9/ui';
import type { PlatformStatisticsSectionProps } from './admin-dashboard-types';

export function PlatformStatisticsSection({
  isLoading,
  totalUsers,
  activeShows,
  totalShows,
  totalDogs,
}: PlatformStatisticsSectionProps) {
  const navigate = useNavigate();

  return (
    <div className="mb-16">
      <div className="mb-8 flex items-center gap-4">
        <div className="rounded-xl bg-primary/10 p-3">
          <BarChart3 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold leading-tight">Platform Statistics</h2>
          <p className="mt-1 text-sm font-medium text-muted-foreground">Key metrics from the database</p>
        </div>
      </div>
      <StatsGrid columns={4}>
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              title="Total Users"
              value={totalUsers.toString()}
              icon={Users}
              color="primary"
              subtitle="Platform users"
              onClick={() => navigate('/admin/users')}
            />
            <StatCard
              title="Active Shows"
              value={activeShows.toString()}
              icon={Calendar}
              color="emerald"
              subtitle="Currently running"
              trend={`${totalShows} total shows`}
            />
            <StatCard
              title="Total Shows"
              value={totalShows.toString()}
              icon={Calendar}
              color="blue"
              subtitle="All shows"
            />
            <StatCard
              title="Registered Dogs"
              value={totalDogs.toString()}
              icon={Dog}
              color="purple"
              subtitle="In the system"
            />
          </>
        )}
      </StatsGrid>
    </div>
  );
}
