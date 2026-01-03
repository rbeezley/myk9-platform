import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  collaborationHub, 
  CollaborationEvent, 
  NotificationEvent,
  CollaborationStats 
} from '@/services/collaboration/CollaborationHubService';
import { 
  Activity, 
  Bell, 
  Users, 
  Wifi, 
  WifiOff,
  Zap,
  TrendingUp
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface CollaborationStatusBarProps {
  className?: string;
  showDetailed?: boolean;
  position?: 'top' | 'bottom';
}

export const CollaborationStatusBar: React.FC<CollaborationStatusBarProps> = ({
  className = '',
  showDetailed = false,
  position = 'bottom'
}) => {
  void showDetailed; // Suppress unused variable warning
  const [stats, setStats] = useState<CollaborationStats>({
    activeUsers: 0,
    onlineJudges: 0,
    onlineSecretaries: 0,
    onlineExhibitors: 0,
    activeEdits: 0,
    recentUpdates: 0,
    notifications: 0
  });
  const [recentEvents, setRecentEvents] = useState<CollaborationEvent[]>([]);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    const updateStats = () => {
      const currentStats = collaborationHub.getCollaborationStats();
      setStats(currentStats);
      setLastUpdate(new Date());
    };

    const handleCollaborationEvent = (event: CollaborationEvent) => {
      setRecentEvents(prev => [event, ...prev.slice(0, 19)]); // Keep last 20 events
      updateStats();
    };

    const handleNotification = (notification: NotificationEvent) => {
      setNotifications(prev => [notification, ...prev.slice(0, 9)]); // Keep last 10 notifications
      updateStats();
    };

    // Initial load
    updateStats();
    setRecentEvents(collaborationHub.getEventHistory(20));
    setNotifications(collaborationHub.getNotifications(10));

    // Subscribe to events
    const unsubscribeEvents = collaborationHub.subscribe(handleCollaborationEvent);
    const unsubscribeNotifications = collaborationHub.subscribeToNotifications(handleNotification);

    // Health check interval
    const healthCheckInterval = setInterval(() => {
      setIsConnected(collaborationHub.isHealthy());
      updateStats();
    }, 10000);

    // Stats refresh interval
    const statsInterval = setInterval(updateStats, 5000);

    return () => {
      unsubscribeEvents();
      unsubscribeNotifications();
      clearInterval(healthCheckInterval);
      clearInterval(statsInterval);
    };
  }, []);

  const formatEventMessage = (event: CollaborationEvent): string => {
    switch (event.type) {
      case 'presence':
        return `${event.userName} joined`;
      case 'live_update':
        return `${event.data?.entityType || 'Item'} updated`;
      case 'edit_lock':
        return `${event.userName} started editing`;
      case 'notification':
        return (event.data?.title as string) || 'New notification';
      default:
        return 'Activity occurred';
    }
  };

  const getEventIcon = (event: CollaborationEvent) => {
    switch (event.type) {
      case 'presence':
        return Users;
      case 'live_update':
        return Activity;
      case 'edit_lock':
        return Activity;
      case 'notification':
        return Bell;
      default:
        return Activity;
    }
  };

  const renderConnectionStatus = () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-green-500" />
            ) : (
              <WifiOff className="w-3 h-3 text-red-500" />
            )}
            <span className={cn(
              'text-xs',
              isConnected ? 'text-green-600' : 'text-red-600'
            )}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {isConnected 
              ? `Real-time collaboration active • Last update ${formatDistanceToNow(lastUpdate)} ago`
              : 'Real-time collaboration unavailable'
            }
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const renderStatsOverview = () => (
    <div className="flex items-center gap-4 text-xs">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3 text-blue-500" />
              <span>{stats.activeUsers}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p className="font-medium">Active Users</p>
              <p>Judges: {stats.onlineJudges}</p>
              <p>Secretaries: {stats.onlineSecretaries}</p>
              <p>Exhibitors: {stats.onlineExhibitors}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-green-500" />
              <span>{stats.activeEdits}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Active edits in progress</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-orange-500" />
              <span>{stats.recentUpdates}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Recent updates (last 5 minutes)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {stats.notifications > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <Bell className="w-3 h-3 text-red-500" />
                <Badge variant="secondary" className="h-4 px-1 text-xs">
                  {stats.notifications}
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Unread notifications</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );

  const renderActivityFeed = () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
          <Activity className="w-3 h-3 mr-1" />
          Activity
          {recentEvents.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
              {recentEvents.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Card className="border-0 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Recent Activity</h4>
              <Badge variant="outline" className="text-xs">
                {recentEvents.length} events
              </Badge>
            </div>
            <ScrollArea className="h-60">
              {recentEvents.length > 0 ? (
                <div className="space-y-2">
                  {recentEvents.map((event, index) => {
                    const EventIcon = getEventIcon(event);
                    return (
                      <div key={`${event.id}-${index}`} className="flex items-start gap-2 p-2 rounded hover:bg-muted/50">
                        <EventIcon className="w-3 h-3 mt-0.5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {formatEventMessage(event)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(event.timestamp)} ago
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Activity className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No recent activity</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );

  const renderNotifications = () => {
    if (stats.notifications === 0) {
      return null;
    }

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs relative">
            <Bell className="w-3 h-3 mr-1" />
            Notifications
            <Badge variant="destructive" className="ml-1 h-4 px-1 text-xs">
              {stats.notifications}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <Card className="border-0 shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">Notifications</h4>
                <Badge variant="outline" className="text-xs">
                  {stats.notifications} unread
                </Badge>
              </div>
              <ScrollArea className="h-60">
                {notifications.length > 0 ? (
                  <div className="space-y-2">
                    {notifications.map((notification) => (
                      <div 
                        key={notification.id} 
                        className={cn(
                          "p-2 rounded border-l-2",
                          notification.read ? "bg-muted/30 border-muted" : "bg-background border-blue-500",
                          notification.priority === 'high' && "border-red-500",
                          notification.priority === 'medium' && "border-yellow-500"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium">{notification.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(notification.timestamp)} ago
                            </p>
                          </div>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Bell className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">No notifications</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className={cn(
      'flex items-center justify-between px-4 py-2 bg-card border-t border-border/50 backdrop-blur-sm',
      position === 'top' && 'border-t-0 border-b',
      className
    )}>
      <div className="flex items-center gap-4">
        {renderConnectionStatus()}
        <Separator orientation="vertical" className="h-4" />
        {renderStatsOverview()}
      </div>

      <div className="flex items-center gap-2">
        {renderActivityFeed()}
        {renderNotifications()}
        
        <Separator orientation="vertical" className="h-4" />
        
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Zap className="w-3 h-3" />
          <span>Live</span>
        </div>
      </div>
    </div>
  );
};

export default CollaborationStatusBar;