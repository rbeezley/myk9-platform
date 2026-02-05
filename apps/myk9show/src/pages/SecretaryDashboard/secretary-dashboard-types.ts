/**
 * Type definitions for SecretaryDashboard
 */

export interface TrialOverview {
  id: string;
  showId: string;
  name: string;
  date: Date;
  totalClasses: number;
  completedClasses: number;
  totalEntries: number;
  processedEntries: number;
  status: 'upcoming' | 'active' | 'completed';
}

export interface DashboardStatistics {
  activeTrials: number;
  totalEntries: number;
  resultsPublished: number;
  avgProcessing: number;
}
