import React, { useState, useEffect } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Calendar, Clock, Dog, Trophy, AlertCircle, Bell, ChevronRight, CheckCircle, XCircle, MapPin } from 'lucide-react';
import { 
  ExhibitorDashboardData, 
  ExhibitorClassInfo, 
  CheckInStatus
} from '@/types/exhibitor-types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntrySyncIndicator } from '@/components/sync/SyncStatusIndicator';

interface ExhibitorDashboardProps {
  exhibitorId?: string;
  onClassSelect?: (classInfo: ExhibitorClassInfo) => void;
}

// Mock data generator for development
const generateMockDashboardData = (exhibitorId: string): ExhibitorDashboardData => {
  const now = new Date();
  const in30Min = new Date(now.getTime() + 30 * 60000);
  const in90Min = new Date(now.getTime() + 90 * 60000);
  const in3Hours = new Date(now.getTime() + 180 * 60000);

  return {
    exhibitor: {
      id: exhibitorId,
      name: 'Sarah Johnson',
      email: 'sarah@example.com',
      phone: '555-0123',
      role: 'exhibitor'
    },
    todaysClasses: [
      {
        class: {
          id: 'class-1',
          showId: 'show-1',
          trialId: 'trial-1',
          name: 'Container Novice A',
          element: 'Container',
          level: 'Novice',
          maxEntries: 30,
          judgeName: 'Ellen Heavner',
          startTime: in30Min.toISOString(),
          ringNumber: 1
        },
        trial: {
          id: 'trial-1',
          showId: 'show-1',
          name: 'Scent Work Day 1',
          date: now.toISOString(),
          startTime: '08:00',
          endTime: '17:00',
          location: 'Main Building',
          organization: 'AKC'
        },
        entry: {
          id: 'entry-1',
          classId: 'class-1',
          dogId: 'dog-1',
          handlerId: exhibitorId,
          armband: '160',
          runningOrder: 3,
          checkInStatus: 'checked-in' as CheckInStatus,
          dogCallName: 'Storm',
          dogRegistrationNumber: 'HP12345678',
          breed: 'Border Collie',
          handlerName: 'Sarah Johnson',
          className: 'Container Novice A',
          ringNumber: 1,
          judgeName: 'Ellen Heavner',
          scheduledTime: in30Min,
          handler: {
            id: exhibitorId,
            name: 'Sarah Johnson',
            email: 'sarah@example.com',
            phone: '555-0123',
            role: 'exhibitor'
          },
          dog: {
            id: 'dog-1',
            name: 'Stormwind\'s Thunder Strike',
            callName: 'Storm',
            age: 5,
            ownerId: exhibitorId,
            description: 'Championship Border Collie',
            dateOfBirth: '2019-03-15',
            gender: 'Male',
            breed: 'Border Collie',
            sex: 'male',
            registrations: [{
              id: 'reg-1',
              organization: 'AKC',
              registeredName: 'Stormwind\'s Thunder Strike',
              breed: 'Border Collie',
              registrationNumber: 'HP12345678',
              status: 'Active'
            }]
          }
        },
        ringStatus: {
          classId: 'class-1',
          className: 'Container Novice A',
          ringNumber: 1,
          judgeName: 'Ellen Heavner',
          currentDog: {
            armband: '144',
            dogName: 'Katie',
            breed: 'Golden Retriever',
            handlerName: 'Mike Wilson',
            startTime: new Date(now.getTime() - 45000),
            elapsedTime: 45
          },
          onDeck: [
            { armband: '175', dogName: 'Walker', breed: 'Lab Mix', handlerName: 'Jane Doe', position: 1, estimatedMinutes: 3 },
            { armband: '160', dogName: 'Storm', breed: 'Border Collie', handlerName: 'Sarah Johnson', position: 2, estimatedMinutes: 8 }
          ],
          judgeStatus: 'active',
          totalEntries: 24,
          completedEntries: 1,
          lastUpdated: now
        }
      },
      {
        class: {
          id: 'class-2',
          showId: 'show-1',
          trialId: 'trial-1',
          name: 'Interior Advanced',
          element: 'Interior',
          level: 'Advanced',
          maxEntries: 25,
          judgeName: 'John Smith',
          startTime: in90Min.toISOString(),
          ringNumber: 2
        },
        trial: {
          id: 'trial-1',
          showId: 'show-1',
          name: 'Scent Work Day 1',
          date: now.toISOString(),
          startTime: '08:00',
          endTime: '17:00',
          location: 'Main Building',
          organization: 'AKC'
        },
        entry: {
          id: 'entry-2',
          classId: 'class-2',
          dogId: 'dog-2',
          handlerId: exhibitorId,
          armband: '175',
          runningOrder: 10,
          checkInStatus: 'pending' as CheckInStatus,
          dogCallName: 'Luna',
          dogRegistrationNumber: 'HP87654321',
          breed: 'Australian Shepherd',
          handlerName: 'Sarah Johnson',
          className: 'Interior Advanced',
          ringNumber: 2,
          judgeName: 'John Smith',
          scheduledTime: in90Min,
          handler: {
            id: exhibitorId,
            name: 'Sarah Johnson',
            email: 'sarah@example.com',
            phone: '555-0123',
            role: 'exhibitor'
          },
          dog: {
            id: 'dog-2',
            name: 'Moonlight\'s Silver Shadow',
            callName: 'Luna',
            age: 4,
            ownerId: exhibitorId,
            description: 'Agility champion',
            dateOfBirth: '2020-06-20',
            gender: 'Female',
            breed: 'Australian Shepherd',
            sex: 'female',
            registrations: [{
              id: 'reg-2',
              organization: 'AKC',
              registeredName: 'Moonlight\'s Silver Shadow',
              breed: 'Australian Shepherd',
              registrationNumber: 'HP87654321',
              status: 'Active'
            }]
          }
        },
        ringStatus: {
          classId: 'class-2',
          className: 'Interior Advanced',
          ringNumber: 2,
          judgeName: 'John Smith',
          judgeStatus: 'not-started',
          totalEntries: 20,
          completedEntries: 0,
          lastUpdated: now,
          onDeck: []
        }
      },
      {
        class: {
          id: 'class-3',
          showId: 'show-1',
          trialId: 'trial-1',
          name: 'Container Masters',
          element: 'Container',
          level: 'Masters',
          maxEntries: 15,
          judgeName: 'Ellen Heavner',
          startTime: in3Hours.toISOString(),
          ringNumber: 1
        },
        trial: {
          id: 'trial-1',
          showId: 'show-1',
          name: 'Scent Work Day 1',
          date: now.toISOString(),
          startTime: '08:00',
          endTime: '17:00',
          location: 'Main Building',
          organization: 'AKC'
        },
        entry: {
          id: 'entry-3',
          classId: 'class-3',
          dogId: 'dog-3',
          handlerId: exhibitorId,
          armband: '142',
          runningOrder: 5,
          checkInStatus: 'completed' as CheckInStatus,
          dogCallName: 'Thunder',
          dogRegistrationNumber: 'HP11223344',
          breed: 'German Shepherd',
          handlerName: 'Sarah Johnson',
          className: 'Container Masters',
          ringNumber: 1,
          judgeName: 'Ellen Heavner',
          scheduledTime: in3Hours,
          handler: {
            id: exhibitorId,
            name: 'Sarah Johnson',
            email: 'sarah@example.com',
            phone: '555-0123',
            role: 'exhibitor'
          },
          dog: {
            id: 'dog-3',
            name: 'Thunder\'s Mighty Roar',
            callName: 'Thunder',
            age: 6,
            ownerId: exhibitorId,
            description: 'Master level competitor',
            dateOfBirth: '2018-01-10',
            gender: 'Male',
            breed: 'German Shepherd',
            sex: 'male',
            registrations: [{
              id: 'reg-3',
              organization: 'AKC',
              registeredName: 'Thunder\'s Mighty Roar',
              breed: 'German Shepherd',
              registrationNumber: 'HP11223344',
              status: 'Active'
            }]
          }
        },
        ringStatus: {
          classId: 'class-3',
          className: 'Container Masters',
          ringNumber: 1,
          judgeName: 'Ellen Heavner',
          judgeStatus: 'not-started',
          totalEntries: 12,
          completedEntries: 0,
          lastUpdated: now,
          onDeck: []
        },
        results: {
          id: 'result-1',
          entryId: 'entry-3',
          qualified: true,
          time: '00:45.23',
          placement: '1',
          score: '100',
          recordedBy: 'judge-1',
          recordedAt: new Date(now.getTime() - 3600000).toISOString()
        }
      }
    ],
    upcomingClasses: [],
    recentResults: [
      {
        result: {
          id: 'result-1',
          entryId: 'entry-3',
          qualified: true,
          time: '00:45.23',
          placement: '1',
          score: '100',
          recordedBy: 'judge-1',
          recordedAt: new Date(now.getTime() - 3600000).toISOString()
        },
        placement: 1,
        totalEntries: 12,
        titleProgress: {
          titleName: 'Container Master',
          currentLegs: 2,
          requiredLegs: 3,
          isNewLeg: true
        },
        class: {
          id: 'class-3',
          showId: 'show-1',
          trialId: 'trial-1',
          name: 'Container Masters',
          element: 'Container',
          level: 'Masters',
          maxEntries: 15,
          judgeName: 'Ellen Heavner',
          startTime: in3Hours.toISOString(),
          ringNumber: 1
        },
        trial: {
          id: 'trial-1',
          showId: 'show-1',
          name: 'Scent Work Day 1',
          date: now.toISOString(),
          startTime: '08:00',
          endTime: '17:00',
          location: 'Main Building',
          organization: 'AKC'
        }
      }
    ],
    notifications: [
      {
        id: 'notif-1',
        type: 'ring-call',
        severity: 'urgent',
        title: 'Get Ready for Ring 1!',
        message: 'You\'re 3rd up in Container Novice A. Storm #160 should head to Ring 1.',
        timestamp: new Date(now.getTime() - 300000),
        read: false,
        classId: 'class-1',
        entryId: 'entry-1'
      },
      {
        id: 'notif-2',
        type: 'result',
        severity: 'success',
        title: '1st Place! 🏆',
        message: 'Thunder qualified with 1st place in Container Masters!',
        timestamp: new Date(now.getTime() - 3600000),
        read: true,
        classId: 'class-3',
        entryId: 'entry-3'
      }
    ],
    stats: {
      totalEntriestoday: 3,
      completedToday: 1,
      qualifiedToday: 1,
      upcomingToday: 2,
      nextRingTime: in30Min,
      activeConflicts: 0
    }
  };
};

const getCheckInStatusBadge = (status: CheckInStatus) => {
  const statusConfig = {
    'not-opened': { label: 'Not Open', className: 'bg-gray-100 text-gray-700' },
    'pending': { label: 'Check In', className: 'bg-yellow-100 text-yellow-700' },
    'checked-in': { label: 'Checked In', className: 'bg-green-100 text-green-700' },
    'scratched': { label: 'Scratched', className: 'bg-red-100 text-red-700' },
    'absent': { label: 'Absent', className: 'bg-red-100 text-red-700' },
    'completed': { label: 'Completed', className: 'bg-blue-100 text-blue-700' }
  };

  const config = statusConfig[status];
  return <Badge className={config.className}>{config.label}</Badge>;
};

const getPlacementBadge = (placement: number) => {
  const placementConfig = {
    1: { label: '1st', className: 'bg-purple-600 text-white' },
    2: { label: '2nd', className: 'bg-red-600 text-white' },
    3: { label: '3rd', className: 'bg-yellow-600 text-white' },
    4: { label: '4th', className: 'bg-gray-300 text-gray-700' }
  };

  const config = placementConfig[placement as keyof typeof placementConfig] || 
    { label: `${placement}th`, className: 'bg-gray-200 text-gray-700' };
  
  return <Badge className={config.className}>{config.label}</Badge>;
};

export const ExhibitorDashboard: React.FC<ExhibitorDashboardProps> = ({
  exhibitorId = 'default-exhibitor-001',
  onClassSelect
}) => {
  const [dashboardData, setDashboardData] = useState<ExhibitorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading dashboard data
    const loadData = async () => {
      setLoading(true);
      // In production, this would be an API call
      await new Promise(resolve => setTimeout(resolve, 500));
      setDashboardData(generateMockDashboardData(exhibitorId));
      setLoading(false);
    };

    loadData();
  }, [exhibitorId]);

  if (loading || !dashboardData) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const unreadNotifications = dashboardData.notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Mobile Header */}
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">My Classes Today</h1>
            <p className="text-sm text-gray-600">{format(new Date(), 'EEEE, MMMM d')}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="relative"
            onClick={() => {/* Navigate to notifications */}}
          >
            <Bell className="h-5 w-5" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadNotifications}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="px-4 py-4 grid grid-cols-2 gap-3">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-700">{dashboardData.stats.upcomingToday}</p>
                <p className="text-sm text-blue-600">Upcoming</p>
              </div>
              <Clock className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-700">
                  {dashboardData.stats.qualifiedToday}/{dashboardData.stats.completedToday}
                </p>
                <p className="text-sm text-green-600">Qualified</p>
              </div>
              <Trophy className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Urgent Notifications */}
      {dashboardData.notifications.filter(n => !n.read && n.severity === 'urgent').map(notification => (
        <div key={notification.id} className="px-4 mb-3">
          <Alert className="bg-orange-50 border-orange-200">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-sm">
              <span className="font-semibold">{notification.title}</span>
              <br />
              {notification.message}
            </AlertDescription>
          </Alert>
        </div>
      ))}

      {/* Classes Tabs */}
      <Tabs defaultValue="upcoming" className="px-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-3 mt-4">
          {dashboardData.todaysClasses
            .filter(c => c.entry.checkInStatus !== 'completed')
            .map(classInfo => (
              <ClassCard 
                key={classInfo.entry.id} 
                classInfo={classInfo} 
                onClick={() => onClassSelect?.(classInfo)}
              />
            ))}
        </TabsContent>

        <TabsContent value="completed" className="space-y-3 mt-4">
          {dashboardData.todaysClasses
            .filter(c => c.entry.checkInStatus === 'completed')
            .map(classInfo => (
              <ClassCard 
                key={classInfo.entry.id} 
                classInfo={classInfo} 
                onClick={() => onClassSelect?.(classInfo)}
                showResult
              />
            ))}
        </TabsContent>

        <TabsContent value="all" className="space-y-3 mt-4">
          {dashboardData.todaysClasses.map(classInfo => (
            <ClassCard 
              key={classInfo.entry.id} 
              classInfo={classInfo} 
              onClick={() => onClassSelect?.(classInfo)}
              showResult={classInfo.entry.checkInStatus === 'completed'}
            />
          ))}
        </TabsContent>
      </Tabs>

      {/* Bottom Navigation Placeholder */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2">
        <div className="flex justify-around">
          <Button variant="ghost" size="sm" className="flex-1">
            <Calendar className="h-5 w-5" />
            <span className="text-xs mt-1">Schedule</span>
          </Button>
          <Button variant="ghost" size="sm" className="flex-1">
            <Dog className="h-5 w-5" />
            <span className="text-xs mt-1">My Dogs</span>
          </Button>
          <Button variant="ghost" size="sm" className="flex-1">
            <Trophy className="h-5 w-5" />
            <span className="text-xs mt-1">Results</span>
          </Button>
          <Button variant="ghost" size="sm" className="flex-1">
            <Bell className="h-5 w-5" />
            <span className="text-xs mt-1">Alerts</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

// Class Card Component
interface ClassCardProps {
  classInfo: ExhibitorClassInfo;
  onClick?: () => void;
  showResult?: boolean;
}

const ClassCard: React.FC<ClassCardProps> = ({ classInfo, onClick, showResult = false }) => {
  const { class: showClass, entry, ringStatus, results } = classInfo;
  const isActive = ringStatus.judgeStatus === 'active';
  const estimatedTime = entry.estimatedRingTime ? 
    formatDistanceToNow(new Date(entry.estimatedRingTime), { addSuffix: true }) : 
    null;

  return (
    <Card 
      className={`cursor-pointer transition-all ${
        isActive ? 'border-blue-400 shadow-md' : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4 relative">
        {/* Sync Status Indicator */}
        <div className="absolute top-3 left-3 z-10">
          <EntrySyncIndicator
            status="synced" // Would come from entry sync status
            entityId={entry.id}
            compact
            className="bg-white/90 backdrop-blur-sm rounded-full p-1"
          />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-3 pl-8">
          <div className="flex-1">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <span className="text-blue-600">🔵</span>
              {showClass.name}
            </h3>
            <p className="text-sm text-gray-600">Ring {showClass.ringNumber}</p>
          </div>
          {getCheckInStatusBadge(entry.checkInStatus)}
        </div>

        {/* Dog Info */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-bold text-lg">
              #{entry.armband}
            </div>
            <div>
              <p className="font-medium">{entry.dog?.callName || entry.dogCallName}</p>
              <p className="text-sm text-gray-600">{entry.dog?.registrations?.[0]?.breed || entry.breed}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>

        {/* Ring Status or Result */}
        {showResult && results ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {results.placement && getPlacementBadge(parseInt(results.placement))}
                <span className="font-medium flex items-center gap-1">
                  {results.qualified ? (
                    <><CheckCircle className="h-4 w-4 text-green-500" /> Qualified</>
                  ) : (
                    <><XCircle className="h-4 w-4 text-red-500" /> NQ</>
                  )}
                </span>
              </div>
              <span className="text-sm text-gray-600">{results.time}</span>
            </div>
          </div>
        ) : isActive && ringStatus.currentDog ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm font-medium text-blue-700 mb-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Now: #{ringStatus.currentDog.armband} | You're {entry.runningOrder}th
            </p>
            <p className="text-sm text-blue-600 flex items-center gap-1">
              <Clock className="h-3 w-3" /> {estimatedTime || `Est: ${ringStatus.onDeck.find(e => e.armband === entry.armband)?.estimatedMinutes || '?'} minutes`}
            </p>
          </div>
        ) : (
          <div className="text-sm text-gray-600">
            <p className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Starts: {format(new Date(showClass.startTime), 'h:mm a')}
            </p>
            <p>Judge: {showClass.judgeName}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExhibitorDashboard;