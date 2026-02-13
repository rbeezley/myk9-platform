import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Progress } from '../../ui/progress';
import { TimeSeriesChart } from './TimeSeriesChart';

const performancePhases = [
  { phase: "Data Preparation", time: 0.8, percentage: 20 },
  { phase: "Network Transfer", time: 2.1, percentage: 52.5 },
  { phase: "Server Processing", time: 0.6, percentage: 15 },
  { phase: "Local Storage", time: 0.5, percentage: 12.5 }
] as const;

function generateMockTimeSeries(multiplier: number, offset: number = 0) {
  const now = Date.now();
  return Array.from({ length: 24 }, (_, i) => ({
    time: new Date(now - (23 - i) * 3600000),
    value: Math.random() * multiplier + offset
  }));
}

const PerformanceTab: React.FC = () => {
  const durationData = useMemo(() => generateMockTimeSeries(3, 2), []);
  const queueData = useMemo(() => generateMockTimeSeries(20), []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sync Duration</CardTitle>
            <CardDescription>Average time per sync operation</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              data={durationData}
              label="Duration (seconds)"
              color="#5856D6"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Queue Length</CardTitle>
            <CardDescription>Pending sync operations</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              data={queueData}
              label="Queue size"
              color="#FF9500"
            />
          </CardContent>
        </Card>
      </div>

      {/* Performance Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance Breakdown</CardTitle>
          <CardDescription>Time spent in each sync phase</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {performancePhases.map((phase) => (
              <div key={phase.phase} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{phase.phase}</span>
                  <span className="text-sm text-muted-foreground">
                    {phase.time}s ({phase.percentage}%)
                  </span>
                </div>
                <Progress value={phase.percentage} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export { PerformanceTab };
