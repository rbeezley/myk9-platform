import React, { useMemo } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { formatDistanceToNow } from 'date-fns';
import { TimeSeriesChart } from './TimeSeriesChart';

function generateMockTimeSeries(multiplier: number, offset: number = 0) {
  const now = Date.now();
  return Array.from({ length: 24 }, (_, i) => ({
    time: new Date(now - (23 - i) * 3600000),
    value: Math.random() * multiplier + offset
  }));
}

function generateMockEvents() {
  const now = Date.now();
  return Array.from({ length: 5 }, (_, i) => ({
    recordCount: Math.floor(Math.random() * 100),
    timeAgo: formatDistanceToNow(new Date(now - i * 300000), { addSuffix: true }),
  }));
}

const OverviewTab: React.FC = () => {
  const activityData = useMemo(() => generateMockTimeSeries(100, 50), []);
  const successRateData = useMemo(() => generateMockTimeSeries(20, 80), []);
  const recentEvents = useMemo(() => generateMockEvents(), []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sync Activity</CardTitle>
            <CardDescription>Recent sync operations</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              data={activityData}
              label="Syncs per hour"
              color="#007AFF"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Success Rate Trend</CardTitle>
            <CardDescription>Sync success percentage over time</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              data={successRateData}
              label="Success rate %"
              color="#34C759"
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Sync Events</CardTitle>
          <CardDescription>Latest sync operations and their status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentEvents.map((event, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  {i % 3 === 0 ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : i % 3 === 1 ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {i % 3 === 0 ? "Sync completed" : i % 3 === 1 ? "Partial sync" : "Sync failed"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {i % 2 === 0 ? "Dogs collection" : "Shows collection"} •
                      {` ${event.recordCount} records`}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {event.timeAgo}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export { OverviewTab };
