import { UserRole } from '@/types/auth-types';

export interface SyncDashboardTab {
  value: string;
  label: string;
  icon: string;
  roles: UserRole[];
  description: string;
}

export const syncDashboardTabs: SyncDashboardTab[] = [
  {
    value: 'overview',
    label: 'Overview',
    icon: 'Monitor',
    roles: [UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN, UserRole.CLUB_ADMIN],
    description: 'System overview and quick health check'
  },
  {
    value: 'controls',
    label: 'Controls',
    icon: 'Settings',
    roles: [UserRole.SECRETARY, UserRole.SITE_ADMIN, UserRole.CLUB_ADMIN],
    description: 'Global sync controls and configuration'
  },
  {
    value: 'notifications',
    label: 'Notifications',
    icon: 'Bell',
    roles: [UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN, UserRole.CLUB_ADMIN],
    description: 'Sync alerts and system notifications'
  },
  {
    value: 'analytics',
    label: 'Analytics',
    icon: 'BarChart3',
    roles: [UserRole.SECRETARY, UserRole.SITE_ADMIN, UserRole.CLUB_ADMIN],
    description: 'Performance metrics and sync analytics'
  },
  {
    value: 'shows',
    label: 'Shows',
    icon: 'Calendar',
    roles: [UserRole.SECRETARY, UserRole.SITE_ADMIN],
    description: 'Show sync management and monitoring'
  },
  {
    value: 'entries',
    label: 'Entries',
    icon: 'Users',
    roles: [UserRole.SECRETARY, UserRole.SITE_ADMIN],
    description: 'Entry sync metrics and management'
  },
  {
    value: 'scoring',
    label: 'Scoring',
    icon: 'Trophy',
    roles: [UserRole.JUDGE, UserRole.SITE_ADMIN],
    description: 'Judge sync dashboard and scoring sync'
  }
];

export const getAvailableTabsForRole = (role: UserRole | undefined): SyncDashboardTab[] => {
  if (!role) return [];
  
  return syncDashboardTabs.filter(tab => 
    tab.roles.includes(role) || role === UserRole.SITE_ADMIN
  );
};

export const getDefaultTabForRole = (role: UserRole | undefined): string => {
  const availableTabs = getAvailableTabsForRole(role);
  return availableTabs.length > 0 ? availableTabs[0].value : 'overview';
};

export const canAccessTab = (tabValue: string, role: UserRole | undefined): boolean => {
  if (!role) return false;
  
  const tab = syncDashboardTabs.find(t => t.value === tabValue);
  if (!tab) return false;
  
  return tab.roles.includes(role) || role === UserRole.SITE_ADMIN;
};