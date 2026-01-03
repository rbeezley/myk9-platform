import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface EntrySyncMetricsProps {
  showId?: string;
}

export const EntrySyncMetrics: React.FC<EntrySyncMetricsProps> = ({ showId }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entry Sync Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Entry synchronization metrics for {showId || 'all shows'}</p>
      </CardContent>
    </Card>
  );
};

export default EntrySyncMetrics;