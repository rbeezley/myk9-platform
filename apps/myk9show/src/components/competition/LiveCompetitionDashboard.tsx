/**
 * Live Competition Dashboard Component
 * Phase 6.2: Live Competition Features
 * 
 * Main dashboard component for live competition features providing real-time
 * monitoring and control of competition status, entries, check-ins, and results.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { 
  Activity, 
  Users, 
  CheckCircle, 
  AlertTriangle, 
  Trophy,
  Clock,
  Settings,
  Play,
  Pause,
  RotateCcw,
  Bell
} from 'lucide-react';

import useLiveCompetition from '../../hooks/useLiveCompetition';
import LiveEntryStatus from './LiveEntryStatus';
import PresenceIndicators from './PresenceIndicators';
import { formatDistanceToNow } from 'date-fns';

export interface LiveCompetitionDashboardProps {
  showId: string;
  classId?: string;
  currentUser?: {
    userId: string;
    userName: string;
    role: 'judge' | 'secretary' | 'steward' | 'exhibitor' | 'admin' | 'observer';
  };
  onEntryClick?: (entryId: string) => void;
  onClassSelect?: (classId: string) => void;
  className?: string;
}

/**
 * Live Competition Dashboard Component
 */
export function LiveCompetitionDashboard({
  showId,
  classId,
  currentUser,
  onEntryClick,
  className = '',
}: LiveCompetitionDashboardProps) {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initialize live competition hook
  const { state, actions, isLoading, hasError, error } = useLiveCompetition({
    showId,
    ...(classId !== undefined && { classId }),
    autoStart: true,
    enableEntryStatus: true,
    enableCheckIns: true,
    enableResults: true,
    enableCollaborativeJudging: currentUser?.role === 'judge',
    enablePresence: true,
    ...(currentUser !== undefined && {
      currentUser: {
        userId: currentUser.userId,
        userName: currentUser.userName,
        role: currentUser.role,
        location: {
          page: 'competition-dashboard',
          section: 'overview',
          showId,
          ...(classId !== undefined && { classId }),
        },
        activity: {
          type: 'viewing',
          description: 'Monitoring live competition',
          startedAt: new Date(),
        },
      },
    }),
  });

  // Update location when tab changes
  useEffect(() => {
    if (currentUser) {
      actions.updateLocation({
        page: 'competition-dashboard',
        section: selectedTab,
        showId,
        classId,
      });
    }
  }, [selectedTab, showId, classId, currentUser, actions]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Initializing live competition...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (hasError) {
    return (
      <div className={`p-6 ${className}`}>
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Live Competition Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={actions.restart} variant="outline">
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Quick stats
  const stats = [
    {
      title: 'Active Users',
      value: state.competitionMetrics.activeUsers,
      icon: Users,
      description: `${state.competitionMetrics.activeJudges} judges online`,
      trend: 'stable',
    },
    {
      title: 'Total Entries',
      value: state.competitionMetrics.totalEntries,
      icon: Activity,
      description: `${state.competitionMetrics.checkedInEntries} checked in`,
      trend: 'up',
    },
    {
      title: 'Completed',
      value: state.competitionMetrics.completedEntries,
      icon: CheckCircle,
      description: `${((state.competitionMetrics.completedEntries / Math.max(state.competitionMetrics.totalEntries, 1)) * 100).toFixed(1)}% complete`,
      trend: 'up',
    },
    {
      title: 'Notifications',
      value: state.competitionMetrics.notificationsSent,
      icon: Bell,
      description: 'Total sent today',
      trend: 'stable',
    },
  ];

  // Recent activity
  const recentActivity = [
    ...state.ringEvents.slice(-5).map(event => ({
      id: event.entryId,
      type: 'ring' as const,
      title: `${event.armband} ${event.type.replace('-', ' ')}`,
      description: event.dogName,
      timestamp: event.timestamp,
      priority: event.metadata?.priority || 'normal',
    })),
    ...state.checkInNotifications.slice(-5).map(notification => ({
      id: notification.id,
      type: 'checkin' as const,
      title: notification.title,
      description: notification.message,
      timestamp: notification.timestamp,
      priority: notification.priority,
    })),
    ...state.resultsNotifications.slice(-5).map(notification => ({
      id: notification.id,
      type: 'results' as const,
      title: notification.title,
      description: notification.message,
      timestamp: notification.timestamp,
      priority: notification.priority,
    })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 10);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Competition</h1>
          <p className="text-muted-foreground">
            Real-time competition monitoring and management
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Service status indicator */}
          <Badge 
            variant={state.isActive ? 'default' : 'secondary'}
            className="flex items-center gap-1"
          >
            <div className={`h-2 w-2 rounded-full ${state.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
            {state.isActive ? 'Live' : 'Offline'}
          </Badge>

          {/* Control buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={state.isActive ? actions.stop : actions.start}
            disabled={isLoading}
          >
            {state.isActive ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Stop
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stat.description}
                    </p>
                  </div>
                  <Icon className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="checkins">Check-ins</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="presence">Presence</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {recentActivity.length > 0 ? (
                      recentActivity.map((activity) => (
                        <div 
                          key={activity.id}
                          className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                        >
                          <div className={`h-2 w-2 rounded-full mt-2 ${
                            activity.priority === 'critical' ? 'bg-red-500' :
                            activity.priority === 'high' ? 'bg-orange-500' :
                            'bg-blue-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {activity.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {activity.description}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {activity.type}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No recent activity</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Active Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Active Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {[...state.checkInNotifications, ...state.resultsNotifications]
                      .filter(n => !n.expiresAt || n.expiresAt > new Date())
                      .slice(0, 10)
                      .map((notification) => (
                        <div 
                          key={notification.id}
                          className="flex items-start gap-3 p-3 rounded-lg border"
                        >
                          <div className={`h-2 w-2 rounded-full mt-2 ${
                            notification.priority === 'critical' ? 'bg-red-500' :
                            notification.priority === 'high' ? 'bg-orange-500' :
                            'bg-blue-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {notification.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                            </p>
                          </div>
                          {notification.type === 'check-in' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => actions.acknowledgeNotification(notification.id)}
                            >
                              Ack
                            </Button>
                          )}
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Entries Tab */}
        <TabsContent value="entries">
          <LiveEntryStatus
            entryStatuses={state.entryStatuses}
            ringEvents={state.ringEvents}
            callNotifications={state.callNotifications}
            {...(onEntryClick !== undefined && { onEntryClick })}
            onUpdateStatus={actions.updateEntryRingStatus}
            showId={showId}
            {...(classId !== undefined && { classId })}
          />
        </TabsContent>

        {/* Check-ins Tab */}
        <TabsContent value="checkins" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Check-in Queue Status */}
            <Card>
              <CardHeader>
                <CardTitle>Check-in Queue Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.from(state.queueStatuses.values()).map((queue) => (
                    <div key={queue.classId} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{queue.className}</h4>
                        <Badge variant="outline">
                          {queue.checkedInCount}/{queue.totalEntries}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Pending</p>
                          <p className="font-medium">{queue.pendingCount}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Conflicts</p>
                          <p className="font-medium text-orange-600">{queue.conflictCount}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Late</p>
                          <p className="font-medium text-red-600">{queue.lateArrivals}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Check-ins */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Check-ins</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {state.recentCheckIns.slice(-20).reverse().map((checkIn) => (
                      <div 
                        key={checkIn.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                      >
                        <div className={`h-3 w-3 rounded-full ${
                          checkIn.checkInStatus === 'checked-in' ? 'bg-green-500' :
                          checkIn.checkInStatus === 'conflict' ? 'bg-red-500' :
                          'bg-gray-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {checkIn.armband} - {checkIn.dogName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {checkIn.exhibitorName} • {checkIn.className}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(checkIn.timestamp, { addSuffix: true })}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {checkIn.checkInStatus}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Results Tab */}
        <TabsContent value="results" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Scores */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Recent Scores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {state.recentScores.slice(-20).reverse().map((score) => (
                      <div 
                        key={score.id}
                        className="flex items-center gap-3 p-3 rounded-lg border"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">
                              {score.armband} - {score.dogName}
                            </p>
                            {score.score.qualified && (
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                                Q
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {score.ownerName} • {score.className}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Judge: {score.judgeName}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{score.score.totalScore}</p>
                          <p className="text-xs text-muted-foreground">
                            {score.score.time}s
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Class Results */}
            <Card>
              <CardHeader>
                <CardTitle>Class Results</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {Array.from(state.placementResults.values()).map((result) => (
                      <div key={result.classId} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">{result.className}</h4>
                          <div className="flex items-center gap-2">
                            <Badge variant={result.isOfficial ? 'default' : 'secondary'}>
                              {result.isOfficial ? 'Official' : 'Preliminary'}
                            </Badge>
                            <Badge variant="outline">
                              {result.qualifyingEntries}/{result.totalEntries} Q
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {result.placements.slice(0, 3).map((placement) => (
                            <div 
                              key={placement.entryId}
                              className="flex items-center justify-between text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="w-8 h-6 flex items-center justify-center">
                                  {placement.position}
                                </Badge>
                                <span>{placement.armband} - {placement.dogName}</span>
                              </div>
                              <span className="font-medium">{placement.finalScore}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Presence Tab */}
        <TabsContent value="presence">
          <PresenceIndicators
            onlineUsers={state.onlineUsers}
            presenceGroups={state.presenceGroups}
            activityIndicators={state.activityIndicators}
            analytics={state.presenceAnalytics}
            currentUser={state.currentUser}
            showFilters={true}
            showAnalytics={true}
          />
        </TabsContent>
      </Tabs>

      {/* Last Updated */}
      <div className="text-center text-xs text-muted-foreground">
        Last updated: {formatDistanceToNow(state.competitionMetrics.lastUpdate, { addSuffix: true })}
      </div>
    </div>
  );
}

export default LiveCompetitionDashboard;