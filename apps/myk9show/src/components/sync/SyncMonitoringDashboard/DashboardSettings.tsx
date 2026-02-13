import React from 'react';
import { Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

interface DashboardSettingsProps {
  refreshInterval: number;
  onRefreshIntervalChange: (interval: number) => void;
}

const DashboardSettings: React.FC<DashboardSettingsProps> = ({
  refreshInterval,
  onRefreshIntervalChange,
}) => {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Dashboard Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto-refresh interval</p>
            <p className="text-xs text-muted-foreground">
              Dashboard updates every {refreshInterval / 1000} seconds
            </p>
          </div>
          <Select
            value={refreshInterval.toString()}
            onValueChange={(v) => onRefreshIntervalChange(parseInt(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5000">5 seconds</SelectItem>
              <SelectItem value="10000">10 seconds</SelectItem>
              <SelectItem value="30000">30 seconds</SelectItem>
              <SelectItem value="60000">1 minute</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};

export { DashboardSettings };
