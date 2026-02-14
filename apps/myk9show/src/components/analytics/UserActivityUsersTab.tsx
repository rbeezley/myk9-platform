import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  Smartphone,
  Monitor,
  Tablet,
  Wifi,
  WifiOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserSession, UserMetrics } from './user-activity-types';

const Avatar = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("rounded-full bg-muted flex items-center justify-center", className)}>{children}</div>
);
const AvatarFallback = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <span className={cn("text-xs font-medium", className)} data-testid="avatar-fallback">{children}</span>
);

function LastActivityDisplay({ lastActivity }: { lastActivity: Date }) {
  const [minutesAgo, setMinutesAgo] = useState(() =>
    Math.floor((Date.now() - lastActivity.getTime()) / 60000)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setMinutesAgo(Math.floor((Date.now() - lastActivity.getTime()) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, [lastActivity]);

  return (
    <p className="text-xs text-muted-foreground mt-1">
      {minutesAgo}m ago
    </p>
  );
}

interface UserActivityUsersTabProps {
  filteredSessions: UserSession[];
  userMetrics: UserMetrics;
}

export function UserActivityUsersTab({ filteredSessions, userMetrics }: UserActivityUsersTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Active Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredSessions
              .filter(s => s.isOnline)
              .slice(0, 10)
              .map(session => (
              <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {session.userName.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{session.userName}</p>
                    <p className="text-xs text-muted-foreground">{session.userRole}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    <Badge variant={session.isOnline ? "default" : "secondary"}>
                      {session.isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {session.deviceType === 'mobile' && <Smartphone className="h-4 w-4" />}
                      {session.deviceType === 'tablet' && <Tablet className="h-4 w-4" />}
                      {session.deviceType === 'desktop' && <Monitor className="h-4 w-4" />}
                    </div>
                  </div>
                  <LastActivityDisplay lastActivity={session.lastActivity} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Engagement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Session Duration</span>
                <span>{userMetrics.averageSessionDuration.toFixed(0)}m avg</span>
              </div>
              <Progress value={(userMetrics.averageSessionDuration / 120) * 100} />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>User Retention</span>
                <span>{userMetrics.userRetention}%</span>
              </div>
              <Progress value={userMetrics.userRetention} />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Sync Activity</span>
                <span>{(userMetrics.syncOperations / userMetrics.totalSessions).toFixed(1)} per session</span>
              </div>
              <Progress value={Math.min(100, (userMetrics.syncOperations / userMetrics.totalSessions) * 10)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
