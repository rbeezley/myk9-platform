import React from 'react';
import {
  FileDown,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { cn } from '../../../lib/utils';
import type { TimeRange } from './types';

interface DashboardHeaderProps {
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
  onExport: () => void;
  onManualSync: () => void;
  isRefreshing: boolean;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  timeRange,
  onTimeRangeChange,
  onExport,
  onManualSync,
  isRefreshing,
}) => {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sync Monitoring</h1>
        <p className="text-muted-foreground">
          Real-time sync health metrics and performance monitoring
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Select value={timeRange} onValueChange={(v: TimeRange) => onTimeRangeChange(v)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last hour</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          className="gap-2"
        >
          <FileDown className="h-4 w-4" />
          Export
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onManualSync}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          Sync Now
        </Button>
      </div>
    </div>
  );
};

export { DashboardHeader };
