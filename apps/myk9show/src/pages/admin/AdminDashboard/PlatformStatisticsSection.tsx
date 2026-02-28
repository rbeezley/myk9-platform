/**
 * PlatformStatisticsSection Component
 *
 * Section displaying platform statistics using StatsCard components.
 * Only shows real data from the database — no simulated metrics.
 */

import { useNavigate } from 'react-router-dom';
import { BarChart3, Calendar, Dog, Users } from 'lucide-react';
import { StatsCard } from './StatsCard';
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Users"
          value={isLoading ? 'Loading...' : totalUsers.toString()}
          icon={Users}
          subtitle="Platform users"
          actionable={true}
          onClick={() => navigate('/admin/users')}
        />
        <StatsCard
          title="Active Shows"
          value={isLoading ? 'Loading...' : activeShows.toString()}
          icon={Calendar}
          subtitle="Currently running"
          trendValue={`${totalShows} total shows`}
          trend="neutral"
        />
        <StatsCard
          title="Total Shows"
          value={isLoading ? 'Loading...' : totalShows.toString()}
          icon={Calendar}
          subtitle="All shows"
        />
        <StatsCard
          title="Registered Dogs"
          value={isLoading ? 'Loading...' : totalDogs.toString()}
          icon={Dog}
          subtitle="In the system"
        />
      </div>
    </div>
  );
}
