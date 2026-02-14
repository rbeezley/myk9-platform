import type { UserSession, ActivityHeatmapData } from './user-activity-types';

export const generateMockSessions = (): UserSession[] => {
  const sessions: UserSession[] = [];
  const now = new Date();

  const users = [
    { id: '1', name: 'Sarah Johnson', role: 'Judge' },
    { id: '2', name: 'Mike Wilson', role: 'Secretary' },
    { id: '3', name: 'Emma Davis', role: 'Exhibitor' },
    { id: '4', name: 'John Smith', role: 'Admin' },
    { id: '5', name: 'Lisa Brown', role: 'Exhibitor' },
    { id: '6', name: 'David Miller', role: 'Judge' },
    { id: '7', name: 'Anna Taylor', role: 'Secretary' },
    { id: '8', name: 'Tom Anderson', role: 'Exhibitor' }
  ];

  const devices = ['mobile', 'tablet', 'desktop'] as const;
  const platforms = ['iOS', 'Android', 'Windows', 'macOS', 'Linux'];
  const locations = [
    { city: 'New York', country: 'USA', lat: 40.7128, lng: -74.0060 },
    { city: 'Los Angeles', country: 'USA', lat: 34.0522, lng: -118.2437 },
    { city: 'Chicago', country: 'USA', lat: 41.8781, lng: -87.6298 },
    { city: 'Houston', country: 'USA', lat: 29.7604, lng: -95.3698 },
    { city: 'Toronto', country: 'Canada', lat: 43.6532, lng: -79.3832 }
  ];

  const features = [
    'Dog Registration', 'Show Management', 'Score Entry', 'Reports',
    'Calendar', 'Entries', 'Results', 'Judging', 'Check-in', 'Analytics'
  ];

  for (let i = 0; i < 50; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const startTime = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
    const duration = Math.random() * 120 + 15;
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    sessions.push({
      id: `session-${i}`,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      startTime,
      endTime: Math.random() > 0.1 ? endTime : undefined,
      duration,
      deviceType: devices[Math.floor(Math.random() * devices.length)],
      platform: platforms[Math.floor(Math.random() * platforms.length)],
      location: Math.random() > 0.3 ? locations[Math.floor(Math.random() * locations.length)] : undefined,
      syncCount: Math.floor(Math.random() * 50) + 5,
      offlineTime: Math.random() * 30,
      activeFeaturesUsed: features.slice(0, Math.floor(Math.random() * 5) + 2),
      lastActivity: new Date(now.getTime() - Math.random() * 60 * 60 * 1000),
      isOnline: Math.random() > 0.3
    });
  }

  return sessions;
};

export const generateHeatmapData = (sessions: UserSession[]): ActivityHeatmapData[] => {
  const heatmapData: ActivityHeatmapData[] = [];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const dayName = days[day];
      const sessionsInHour = sessions.filter(session => {
        const sessionDay = session.startTime.getDay();
        const sessionHour = session.startTime.getHours();
        return sessionDay === day && sessionHour === hour;
      });

      heatmapData.push({
        hour,
        day: dayName,
        value: sessionsInHour.length,
        sessions: sessionsInHour.length
      });
    }
  }

  return heatmapData;
};
