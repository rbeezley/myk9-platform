/**
 * useAdminDashboardData Hook
 *
 * Fetches and manages all data needed for the admin dashboard.
 */

import { useUsersQuery } from '@/hooks/queries/useUsersQuery';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';
import type { AdminDashboardData } from './admin-dashboard-types';

export function useAdminDashboardData(): AdminDashboardData {
  // Fetch real data from database
  const { data: users = [], isLoading: usersLoading, error: usersError } = useUsersQuery();
  const { data: shows = [], isLoading: showsLoading, error: showsError } = useShowsQuery();
  const { data: dogs = [], isLoading: dogsLoading, error: dogsError } = useDogsQuery();

  // Handle loading states
  const isLoading = usersLoading || showsLoading || dogsLoading;
  const hasError = !!(usersError || showsError || dogsError);

  return {
    users,
    shows,
    dogs,
    isLoading,
    hasError,
  };
}

/**
 * Calculates derived statistics from dashboard data.
 */
export function calculateDashboardStats(data: AdminDashboardData) {
  const { users, shows, dogs } = data;

  const activeShows = shows.filter(
    show => show.status === 'active' || show.status === 'upcoming'
  ).length;

  return {
    activeShows,
    totalUsers: users.length,
    totalShows: shows.length,
    totalDogs: dogs.length,
  };
}
