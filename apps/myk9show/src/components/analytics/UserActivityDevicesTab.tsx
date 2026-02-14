import {
  PieChart,
  Pie,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserSession, UserMetrics } from './user-activity-types';

interface UserActivityDevicesTabProps {
  sessions: UserSession[];
  userMetrics: UserMetrics;
}

export function UserActivityDevicesTab({ sessions, userMetrics }: UserActivityDevicesTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Device Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={userMetrics.deviceBreakdown}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="count"
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
              >
                {userMetrics.deviceBreakdown.map((_entry, index) => {
                  const colors = ['#3b82f6', '#10b981', '#f59e0b'];
                  return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                })}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {['iOS', 'Android', 'Windows', 'macOS', 'Linux'].map((platform) => {
              const count = sessions.filter(s => s.platform === platform).length;
              const percentage = (count / sessions.length) * 100;

              return (
                <div key={platform} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{platform}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
