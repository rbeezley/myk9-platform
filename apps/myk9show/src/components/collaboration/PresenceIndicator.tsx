import React, { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPresence, collaborationHub } from '@/services/collaboration/CollaborationHubService';
import { Users, Edit, Clock, MapPin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PresenceIndicatorProps {
  showActiveCount?: boolean;
  showRoleBreakdown?: boolean;
  entityType?: string;
  entityId?: string;
  className?: string;
}

// Role icons for future use
// const roleIcons = {
//   admin: Trophy,
//   secretary: Edit,
//   judge: Gavel,
//   exhibitor: Eye
// };

const roleColors: Record<string, string> = {
  admin: 'bg-gradient-to-r from-yellow-400 to-orange-500',
  secretary: 'bg-gradient-to-r from-blue-400 to-blue-600',
  judge: 'bg-gradient-to-r from-purple-400 to-purple-600',
  exhibitor: 'bg-gradient-to-r from-green-400 to-green-600'
};

const statusColors: Record<string, string> = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  busy: 'bg-red-500'
};

const activityLabels: Record<string, string> = {
  viewing: 'Viewing',
  editing: 'Editing',
  scoring: 'Scoring',
  judging: 'Judging'
};

export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({
  showActiveCount = true,
  showRoleBreakdown = false,
  entityType,
  entityId,
  className = ''
}) => {
  const [activeUsers, setActiveUsers] = useState<UserPresence[]>([]);
  const [stats, setStats] = useState({
    activeUsers: 0,
    onlineJudges: 0,
    onlineSecretaries: 0,
    onlineExhibitors: 0
  });

  useEffect(() => {
    const updateUsers = () => {
      let users: UserPresence[];
      
      if (entityType && entityId) {
        users = collaborationHub.getActiveUsersForEntity(entityType, entityId);
      } else {
        users = collaborationHub.getActiveUsers();
      }
      
      setActiveUsers(users);
      
      const currentStats = collaborationHub.getCollaborationStats();
      setStats(currentStats);
    };

    // Initial load
    updateUsers();

    // Subscribe to presence updates
    const unsubscribe = collaborationHub.subscribe((event) => {
      if (event.type === 'presence') {
        updateUsers();
      }
    });

    // Refresh every 30 seconds
    const interval = setInterval(updateUsers, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [entityType, entityId]);

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatActivity = (user: UserPresence): string => {
    if (!user.activity) return 'Viewing';
    
    const label = activityLabels[user.activity.type] || user.activity.type;
    const details = user.activity.details ? ` ${user.activity.details}` : '';
    return `${label}${details}`;
  };

  const formatLocation = (user: UserPresence): string => {
    if (!user.currentLocation) return 'Unknown';
    
    const page = user.currentLocation.page.replace(/^\//, '').replace(/\//g, ' > ');
    const entity = user.currentLocation.entityType ? ` (${user.currentLocation.entityType})` : '';
    return page + entity;
  };

  const renderUserCard = (user: UserPresence) => (
    <Card key={user.id} className="mb-3 last:mb-0">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className={`text-white ${roleColors[user.role]}`}>
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div 
              className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-white rounded-full ${statusColors[user.status]}`}
              title={user.status}
            />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-medium text-sm truncate">{user.name}</p>
              <Badge variant="secondary" className="text-xs">
                {user.role}
              </Badge>
            </div>
            
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Edit className="w-3 h-3" />
                <span>{formatActivity(user)}</span>
              </div>
              
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{formatLocation(user)}</span>
              </div>
              
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Active {formatDistanceToNow(user.lastSeen)} ago</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderRoleBreakdown = () => (
    <div className="grid grid-cols-2 gap-2 mb-4">
      <div className="text-center p-2 bg-muted/50 rounded-lg">
        <div className="text-lg font-semibold text-purple-600">{stats.onlineJudges}</div>
        <div className="text-xs text-muted-foreground">Judges</div>
      </div>
      <div className="text-center p-2 bg-muted/50 rounded-lg">
        <div className="text-lg font-semibold text-blue-600">{stats.onlineSecretaries}</div>
        <div className="text-xs text-muted-foreground">Secretaries</div>
      </div>
    </div>
  );

  if (activeUsers.length === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={className}>
              <Users className="w-4 h-4 text-muted-foreground" />
              {showActiveCount && <span className="ml-1 text-muted-foreground">0</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>No active users</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const displayUsers = activeUsers.slice(0, 5); // Show first 5 users
  const remainingCount = Math.max(0, activeUsers.length - 5);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Avatar Stack */}
      <div className="flex -space-x-2">
        {displayUsers.map((user) => (
          <TooltipProvider key={user.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Avatar className="h-8 w-8 border-2 border-background">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className={`text-xs text-white ${roleColors[user.role]}`}>
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div 
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border border-background rounded-full ${statusColors[user.status]}`}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="text-sm">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-muted-foreground">{formatActivity(user)}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
        
        {remainingCount > 0 && (
          <Avatar className="h-8 w-8 border-2 border-background bg-muted">
            <AvatarFallback className="text-xs">
              +{remainingCount}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Active Count and Details */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <Users className="w-4 h-4" />
            {showActiveCount && <span className="ml-1">{activeUsers.length}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <Card className="border-0 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Active Users ({activeUsers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {showRoleBreakdown && renderRoleBreakdown()}
              
              <div className="max-h-60 overflow-y-auto">
                {activeUsers.map(renderUserCard)}
              </div>
              
              {activeUsers.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No active users</p>
                </div>
              )}
            </CardContent>
          </Card>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default PresenceIndicator;