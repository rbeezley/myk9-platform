import React from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Progress } from '../../ui/progress';
import { formatDistanceToNow } from 'date-fns';
import type { SyncMetrics } from '../../../types/analytics-types';
import { HealthGauge } from './HealthGauge';

// Mock data — generated once at module load, not during render
const MOCK_ACTIVE_CONNECTIONS = 8;

interface HealthOverviewCardProps {
  metrics: SyncMetrics;
}

const HealthOverviewCard: React.FC<HealthOverviewCardProps> = ({ metrics }) => {

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          System Health Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <HealthGauge score={metrics.syncHealthScore} label="Overall Health" />
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Success Rate</span>
                <span className="text-sm font-bold">{metrics.successRate}%</span>
              </div>
              <Progress value={metrics.successRate} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Conflict Resolution</span>
                <span className="text-sm font-bold">
                  {100 - metrics.conflictRate}%
                </span>
              </div>
              <Progress value={100 - metrics.conflictRate} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Compression Efficiency</span>
                <span className="text-sm font-bold">
                  {(metrics.compressionRatio * 100).toFixed(0)}%
                </span>
              </div>
              <Progress value={metrics.compressionRatio * 100} className="h-2" />
            </div>
          </div>
          <div className="space-y-2">
            <Badge
              variant={metrics.syncHealthScore >= 90 ? "default" : "destructive"}
              className="gap-1"
            >
              {metrics.syncHealthScore >= 90 ? (
                <CheckCircle className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              {metrics.syncHealthScore >= 90 ? "Healthy" : "Needs Attention"}
            </Badge>
            <p className="text-sm text-muted-foreground">
              Last sync: {formatDistanceToNow(new Date(), { addSuffix: true })}
            </p>
            <p className="text-sm text-muted-foreground">
              Active connections: {MOCK_ACTIVE_CONNECTIONS}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export { HealthOverviewCard };
