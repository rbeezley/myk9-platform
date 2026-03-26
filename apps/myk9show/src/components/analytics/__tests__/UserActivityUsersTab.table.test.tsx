import { render, screen, within } from '@/test/utils/testUtils';
import { UserActivityUsersTab } from '../UserActivityUsersTab';
import type { UserSession, UserMetrics } from '../user-activity-types';

const mockSessions: UserSession[] = [
  {
    id: 'sess-1',
    userId: 'u1',
    userName: 'Alice Smith',
    userRole: 'Secretary',
    startTime: new Date(),
    duration: 45,
    deviceType: 'desktop',
    platform: 'Chrome',
    syncCount: 12,
    offlineTime: 0,
    activeFeaturesUsed: ['scoring', 'entries'],
    lastActivity: new Date(Date.now() - 120000), // 2 min ago
    isOnline: true,
  },
  {
    id: 'sess-2',
    userId: 'u2',
    userName: 'Bob Jones',
    userRole: 'Judge',
    startTime: new Date(),
    duration: 30,
    deviceType: 'mobile',
    platform: 'Safari',
    syncCount: 5,
    offlineTime: 10,
    activeFeaturesUsed: ['scoring'],
    lastActivity: new Date(Date.now() - 600000), // 10 min ago
    isOnline: false,
  },
  {
    id: 'sess-3',
    userId: 'u3',
    userName: 'Carol Davis',
    userRole: 'Steward',
    startTime: new Date(),
    duration: 15,
    deviceType: 'tablet',
    platform: 'Chrome',
    syncCount: 3,
    offlineTime: 5,
    activeFeaturesUsed: ['entries'],
    lastActivity: new Date(Date.now() - 300000), // 5 min ago
    isOnline: true,
  },
];

const mockMetrics: UserMetrics = {
  totalUsers: 10,
  activeUsers: 3,
  newUsers: 1,
  userRetention: 85,
  averageSessionDuration: 30,
  totalSessions: 50,
  syncOperations: 100,
  offlineUsage: 15,
  mostUsedFeatures: [{ feature: 'scoring', usage: 80 }],
  deviceBreakdown: [{ device: 'desktop', count: 5, percentage: 50 }],
  locationStats: [{ location: 'US', users: 8 }],
  engagementScore: 72,
};

describe('UserActivityUsersTab DataTable migration', () => {
  it('renders sortable column headers', () => {
    render(<UserActivityUsersTab filteredSessions={mockSessions} userMetrics={mockMetrics} />);
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    const headerTexts = headers.map(h => h.textContent ?? '');
    expect(headerTexts.some(t => t.startsWith('User'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Role'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Status'))).toBe(true);
  });

  it('renders search input', () => {
    render(<UserActivityUsersTab filteredSessions={mockSessions} userMetrics={mockMetrics} />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('renders column visibility toggle', () => {
    render(<UserActivityUsersTab filteredSessions={mockSessions} userMetrics={mockMetrics} />);
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
  });

  it('renders online and offline status badges', () => {
    render(<UserActivityUsersTab filteredSessions={mockSessions} userMetrics={mockMetrics} />);
    const onlineBadges = screen.getAllByText('Online');
    const offlineBadges = screen.getAllByText('Offline');
    expect(onlineBadges.length).toBe(2); // Alice + Carol
    expect(offlineBadges.length).toBe(1); // Bob
  });

  it('renders user names in rows', () => {
    render(<UserActivityUsersTab filteredSessions={mockSessions} userMetrics={mockMetrics} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('Carol Davis')).toBeInTheDocument();
  });

  it('renders engagement metrics section', () => {
    render(<UserActivityUsersTab filteredSessions={mockSessions} userMetrics={mockMetrics} />);
    expect(screen.getByText('User Engagement')).toBeInTheDocument();
    expect(screen.getByText('Session Duration')).toBeInTheDocument();
    expect(screen.getByText('User Retention')).toBeInTheDocument();
  });
});
