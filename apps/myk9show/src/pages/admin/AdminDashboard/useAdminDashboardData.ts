/**
 * useAdminDashboardData Hook
 *
 * Fetches and manages all data needed for the admin dashboard.
 */

import { useUsersQuery } from '@/hooks/queries/useUsersQuery';
import { useShowsQuery, useShowStatisticsQuery } from '@/hooks/queries/useShowsDatabase';
import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';
import type { AdminDashboardData } from './admin-dashboard-types';

export function useAdminDashboardData(): AdminDashboardData {
  // Fetch real data from database
  const { data: users = [], isLoading: usersLoading, error: usersError } = useUsersQuery();
  const { data: shows = [], isLoading: showsLoading, error: showsError } = useShowsQuery();
  const { data: dogs = [], isLoading: dogsLoading, error: dogsError } = useDogsQuery();
  const { data: showStats } = useShowStatisticsQuery();

  // Handle loading states
  const isLoading = usersLoading || showsLoading || dogsLoading;
  const hasError = !!(usersError || showsError || dogsError);

  return {
    users,
    shows,
    dogs,
    showStats: showStats as { totalRevenue?: number } | undefined,
    isLoading,
    hasError,
  };
}

/**
 * Calculates derived statistics from dashboard data.
 */
export function calculateDashboardStats(data: AdminDashboardData) {
  const { users, shows, dogs, showStats } = data;

  const activeShows = shows.filter(
    (show) => show.status === 'active' || show.status === 'upcoming'
  ).length;
  const totalUsers = users.length;
  const totalRevenue = showStats?.totalRevenue || 0;
  const totalRecords = dogs.length + shows.length + users.length;

  return {
    activeShows,
    totalUsers,
    totalRevenue,
    totalRecords,
    totalShows: shows.length,
  };
}
