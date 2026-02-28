/**
 * AdminDashboard Page
 *
 * System administration dashboard with platform management, statistics,
 * and system health monitoring.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Settings, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Import from module
import {
  useAdminDashboardData,
  calculateDashboardStats,
  PlatformAdministrationSection,
  PlatformStatisticsSection,
} from './AdminDashboard/index';

const APPLE_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';

/**
 * Error state display component
 */
function DashboardError() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center" style={{ fontFamily: APPLE_FONT_FAMILY }}>
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl mb-3" style={{ fontWeight: 590, lineHeight: '1.3' }}>
          Error Loading Dashboard
        </h2>
        <p className="text-muted-foreground" style={{ fontWeight: 500 }}>
          Unable to load dashboard data. Please try again later.
        </p>
      </div>
    </div>
  );
}

/**
 * Dashboard header with title and action buttons
 */
function DashboardHeader() {
  return (
    <div
      className="flex flex-col md:flex-row md:items-center md:justify-between mb-12"
      style={{ fontFamily: APPLE_FONT_FAMILY }}
    >
      <div>
        <h1
          className="text-4xl tracking-tight mb-3"
          style={{ fontWeight: 700, lineHeight: '1.15', letterSpacing: '-0.01em' }}
        >
          System Administration
        </h1>
        <p className="text-lg text-muted-foreground" style={{ fontWeight: 500, lineHeight: '1.4' }}>
          Admin console for platform management, user administration, and system oversight
        </p>
      </div>
      <div className="flex items-center gap-3 mt-6 md:mt-0">
        <Button
          variant="outline"
          className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40
                     hover:-translate-y-0.5 transition-all duration-300 shadow-sm rounded-xl px-6 py-2.5"
          style={{
            fontWeight: 500,
            transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
          asChild
        >
          <Link to="/admin/users">
            <Users className="h-4 w-4 mr-2" />
            Manage Users
          </Link>
        </Button>
        <Button
          className="bg-gradient-to-r from-primary to-secondary text-primary-foreground
                     hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02]
                     transition-all duration-300 shadow-sm px-6 py-2.5 rounded-xl"
          style={{
            fontWeight: 500,
            transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
          asChild
        >
          <Link to="/admin/permissions">
            <Settings className="h-4 w-4 mr-2" />
            Permissions
          </Link>
        </Button>
      </div>
    </div>
  );
}

const AdminDashboard: React.FC = () => {
  // Get dashboard data
  const dashboardData = useAdminDashboardData();

  // Calculate derived statistics
  const stats = calculateDashboardStats(dashboardData);

  // Show error state if data loading failed
  if (dashboardData.hasError) {
    return <DashboardError />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-8 pt-8 pb-12 max-w-8xl">
        {/* Header */}
        <DashboardHeader />

        {/* Platform Administration Section */}
        <PlatformAdministrationSection userCount={dashboardData.users.length} />

        {/* Platform Statistics Section */}
        <PlatformStatisticsSection
          isLoading={dashboardData.isLoading}
          totalUsers={stats.totalUsers}
          activeShows={stats.activeShows}
          totalShows={stats.totalShows}
          totalDogs={stats.totalDogs}
        />
      </div>
    </div>
  );
};

export default AdminDashboard;
