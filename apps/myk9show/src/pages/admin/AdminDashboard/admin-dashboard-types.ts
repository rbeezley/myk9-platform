/**
 * AdminDashboard Types
 *
 * Type definitions for the admin dashboard components.
 */

import { Show } from '@/types/show-types';
import { User } from '@/types/user-types';

// Props for PlatformAdministrationSection component
export interface PlatformAdministrationSectionProps {
  userCount: number;
}

// Props for PlatformStatisticsSection component
export interface PlatformStatisticsSectionProps {
  isLoading: boolean;
  totalUsers: number;
  activeShows: number;
  totalShows: number;
  totalDogs: number;
}

// Admin dashboard data from hooks
export interface AdminDashboardData {
  users: User[];
  shows: Show[];
  dogs: Record<string, unknown>[];
  isLoading: boolean;
  hasError: boolean;
}
