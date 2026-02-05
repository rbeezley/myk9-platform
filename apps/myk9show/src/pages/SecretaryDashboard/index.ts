/**
 * SecretaryDashboard module exports
 */

// Types
export type {
  TrialOverview,
  DashboardStatistics,
} from './secretary-dashboard-types';

// Hooks
export {
  useTrialsData,
  useStatistics,
  useSecretaryDashboardData,
} from './useSecretaryDashboardData';

// Utils
export { getStatusBadge } from './secretaryDashboardUtils';

// Components
export { StatisticsCards } from './StatisticsCards';
export { TrialManagementTabs } from './TrialManagementTabs';
export { QuickActionsSection } from './QuickActionsSection';
export { RecentActivitySection } from './RecentActivitySection';
