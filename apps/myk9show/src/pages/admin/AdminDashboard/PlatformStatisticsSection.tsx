/**
 * PlatformStatisticsSection Component
 *
 * Section displaying platform statistics using StatsCard components.
 */

import { Activity, BarChart3, Calendar, DollarSign, Server, Users } from 'lucide-react';
import { StatsCard } from './StatsCard';
import type { PlatformStatisticsSectionProps } from './admin-dashboard-types';

const APPLE_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';

export function PlatformStatisticsSection({
  isLoading,
  totalUsers,
  activeShows,
  totalShows,
  systemUptime,
  totalRecords,
  totalRevenue,
}: PlatformStatisticsSectionProps) {
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
            Key metrics for platform usage and system performance
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatsCard
          title="Total Users"
          value={isLoading ? 'Loading...' : totalUsers.toString()}
          icon={Users}
          subtitle="Platform users"
          trend="neutral"
          trendValue="All user types"
          priority="normal"
          actionable={true}
        />
        <StatsCard
          title="Active Shows"
          value={isLoading ? 'Loading...' : activeShows.toString()}
          icon={Calendar}
          subtitle="Currently running"
          trend="neutral"
          trendValue={`${totalShows} total shows`}
          priority="normal"
        />
        <StatsCard
          title="System Uptime"
          value={systemUptime}
          icon={Activity}
          subtitle="Platform availability"
          trend="up"
          trendValue="Last 30 days"
          priority="normal"
        />
        <StatsCard
          title="Database Records"
          value={isLoading ? 'Loading...' : totalRecords.toLocaleString()}
          icon={Server}
          subtitle="Total data entries"
          trend="up"
          trendValue="Growing"
          priority="normal"
        />
        <StatsCard
          title="Platform Revenue"
          value={isLoading ? 'Loading...' : `$${totalRevenue.toLocaleString()}`}
          icon={DollarSign}
          subtitle="Total collected"
          trend="up"
          trendValue="All time"
          priority="normal"
        />
      </div>
    </div>
  );
}
