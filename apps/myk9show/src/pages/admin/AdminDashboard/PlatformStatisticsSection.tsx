/**
 * PlatformStatisticsSection Component
 *
 * Section displaying platform statistics using StatsCard components.
 * Only shows real data from the database — no simulated metrics.
 */

import { useNavigate } from 'react-router-dom';
import { BarChart3, Calendar, Dog, Users } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import type { PlatformStatisticsSectionProps } from './admin-dashboard-types';

const APPLE_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';

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
      <div className="flex items-center gap-4 mb-8" style={{ fontFamily: APPLE_FONT_FAMILY }}>
        <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 rounded-xl shadow-sm">
          <BarChart3 className="h-6 w-6 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl" style={{ fontWeight: 590, lineHeight: '1.25' }}>
            Platform Statistics
          </h2>
          <p className="text-sm text-muted-foreground mt-1" style={{ fontWeight: 500 }}>
            Key metrics from the database
          </p>
        </div>
      </div>
      <StatsGrid columns={4}>
        <StatCard
          title="Total Users"
          value={isLoading ? 'Loading...' : totalUsers.toString()}
          icon={Users}
          color="primary"
          subtitle="Platform users"
          onClick={() => navigate('/admin/users')}
        />
        <StatCard
          title="Active Shows"
          value={isLoading ? 'Loading...' : activeShows.toString()}
          icon={Calendar}
          color="emerald"
          subtitle="Currently running"
          trend={`${totalShows} total shows`}
        />
        <StatCard
          title="Total Shows"
          value={isLoading ? 'Loading...' : totalShows.toString()}
          icon={Calendar}
          color="blue"
          subtitle="All shows"
        />
        <StatCard
          title="Registered Dogs"
          value={isLoading ? 'Loading...' : totalDogs.toString()}
          icon={Dog}
          color="purple"
          subtitle="In the system"
        />
      </StatsGrid>
    </div>
  );
}
