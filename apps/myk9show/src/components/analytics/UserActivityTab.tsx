import React from 'react';
import {
  Line,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import type { ActivityHeatmapData, TimelineDataPoint } from './user-activity-types';

interface UserActivityTabProps {
  timelineData: TimelineDataPoint[];
  heatmapData: ActivityHeatmapData[];
}

export function UserActivityTab({ timelineData, heatmapData }: UserActivityTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            24-Hour Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="hour" tickFormatter={(hour) => `${hour}:00`} />
              <YAxis yAxisId="left" orientation="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip
                labelFormatter={(hour) => `${hour}:00 - ${Number(hour) + 1}:00`}
                formatter={(value, name) => [value, name === 'sessions' ? 'Sessions' : name === 'users' ? 'Active Users' : 'Sync Operations']}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="sessions" fill="#3b82f6" name="Sessions" />
              <Line yAxisId="right" type="monotone" dataKey="users" stroke="#10b981" strokeWidth={2} name="Active Users" />
              <Line yAxisId="right" type="monotone" dataKey="syncs" stroke="#f59e0b" strokeWidth={2} name="Sync Operations" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Weekly Activity Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-24 gap-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <React.Fragment key={day}>
                <div className="col-span-24 text-xs text-muted-foreground mb-1">{day}</div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const data = heatmapData.find(d => d.day === day && d.hour === hour);
                  const intensity = data ? Math.min(data.value / 5, 1) : 0;
                  return (
                    <div
                      key={`${day}-${hour}`}
                      className="aspect-square rounded-sm border"
                      style={{
                        backgroundColor: `rgba(59, 130, 246, ${intensity})`,
                        borderColor: 'rgba(0, 0, 0, 0.1)'
                      }}
                      title={`${day} ${hour}:00 - ${data?.sessions || 0} sessions`}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <span>Less</span>
            <div className="flex gap-1">
              {[0, 0.2, 0.4, 0.6, 0.8, 1].map(intensity => (
                <div
                  key={intensity}
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: `rgba(59, 130, 246, ${intensity})` }}
                />
              ))}
            </div>
            <span>More</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
