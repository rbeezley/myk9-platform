import {
  RadialBarChart,
  RadialBar,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import type { UserMetrics } from './user-activity-types';

interface UserActivityGeographyTabProps {
  userMetrics: UserMetrics;
}

export function UserActivityGeographyTab({ userMetrics }: UserActivityGeographyTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Geographic Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {userMetrics.locationStats.map((location) => (
              <div key={location.location} className="flex items-center justify-between">
                <span className="text-sm font-medium">{location.location}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${(location.users / Math.max(...userMetrics.locationStats.map(l => l.users))) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">{location.users}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <RadialBarChart data={userMetrics.locationStats.slice(0, 5).map((loc, index) => ({
              ...loc,
              fill: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index]
            }))}>
              <RadialBar dataKey="users" cornerRadius={10} fill="#8884d8" />
              <Tooltip />
            </RadialBarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
