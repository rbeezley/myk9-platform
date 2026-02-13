import React, { useMemo } from 'react';
import {
  Download,
  Upload,
  WifiOff,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';
import type { SyncMetrics } from '../../../types/analytics-types';
import { TimeSeriesChart } from './TimeSeriesChart';

const connectionStatuses = [
  { name: "Primary Server", status: "connected", latency: 12 },
  { name: "Backup Server", status: "connected", latency: 45 },
  { name: "CDN Edge", status: "connected", latency: 8 },
  { name: "WebSocket", status: "active", latency: 15 }
] as const;

function generateMockTimeSeries(multiplier: number, offset: number = 0) {
  const now = Date.now();
  return Array.from({ length: 24 }, (_, i) => ({
    time: new Date(now - (23 - i) * 3600000),
    value: Math.random() * multiplier + offset
  }));
}

interface NetworkTabProps {
  metrics: SyncMetrics;
}

const NetworkTab: React.FC<NetworkTabProps> = ({ metrics }) => {
  const bandwidthData = useMemo(() => generateMockTimeSeries(5, 1), []);
  const compressionData = useMemo(() => generateMockTimeSeries(20, 60), []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bandwidth Usage</CardTitle>
            <CardDescription>Data transfer over time</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              data={bandwidthData}
              label="MB per hour"
              color="#007AFF"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compression Ratio</CardTitle>
            <CardDescription>Data compression efficiency</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              data={compressionData}
              label="Compression %"
              color="#34C759"
            />
          </CardContent>
        </Card>
      </div>

      {/* Network Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Upload</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {(metrics.bandwidthUsed / 2 / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg: {((metrics.bandwidthUsed / 2 / metrics.totalSyncs) / 1024).toFixed(1)} KB/sync
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Download</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {(metrics.bandwidthUsed / 2 / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg: {((metrics.bandwidthUsed / 2 / metrics.totalSyncs) / 1024).toFixed(1)} KB/sync
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Offline Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {(metrics.offlineUsageTime / 60).toFixed(0)}m
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((metrics.offlineUsageTime / (24 * 60)) * 100).toFixed(1)}% of time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connection Status</CardTitle>
          <CardDescription>Current network connections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {connectionStatuses.map((connection) => (
              <div
                key={connection.name}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    connection.status === "connected" || connection.status === "active"
                      ? "bg-green-500"
                      : "bg-red-500"
                  )} />
                  <span className="text-sm font-medium">{connection.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {connection.latency}ms
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {connection.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export { NetworkTab };
