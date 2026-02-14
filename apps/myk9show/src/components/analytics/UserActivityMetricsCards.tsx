import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  Clock,
  UserCheck,
  Zap
} from 'lucide-react';
import type { UserMetrics } from './user-activity-types';

interface UserActivityMetricsCardsProps {
  userMetrics: UserMetrics;
}

export function UserActivityMetricsCards({ userMetrics }: UserActivityMetricsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Users</p>
              <p className="text-2xl font-bold">{userMetrics.activeUsers}</p>
              <p className="text-xs text-green-600">+{userMetrics.newUsers} new</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <UserCheck className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Engagement Score</p>
              <p className="text-2xl font-bold">{userMetrics.engagementScore.toFixed(0)}%</p>
              <Progress value={userMetrics.engagementScore} className="w-16 h-1 mt-1" />
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Avg Session</p>
              <p className="text-2xl font-bold">{userMetrics.averageSessionDuration.toFixed(0)}m</p>
              <p className="text-xs text-muted-foreground">
                {userMetrics.totalSessions} total sessions
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <Clock className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Sync Operations</p>
              <p className="text-2xl font-bold">{userMetrics.syncOperations}</p>
              <p className="text-xs text-muted-foreground">
                {(userMetrics.offlineUsage / 60).toFixed(1)}h offline
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
              <Zap className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
