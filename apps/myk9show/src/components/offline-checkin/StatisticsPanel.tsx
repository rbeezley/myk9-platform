import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { CheckInStatistics } from '@/types/offline-checkin-types';

interface StatisticsPanelProps {
  statistics: CheckInStatistics;
}

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ statistics }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold">{statistics.totalEntries}</div>
          <div className="text-sm text-muted-foreground">Total Entries</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold text-green-600">{statistics.checkedInCount}</div>
          <div className="text-sm text-muted-foreground">Checked In</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold text-orange-600">{statistics.scratchedCount}</div>
          <div className="text-sm text-muted-foreground">Scratched</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold text-red-600">{statistics.conflictCount}</div>
          <div className="text-sm text-muted-foreground">Conflicts</div>
        </CardContent>
      </Card>
    </div>
  );
};
