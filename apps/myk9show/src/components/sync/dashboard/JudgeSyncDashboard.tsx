import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface JudgeSyncDashboardProps {
  judgeId?: string;
}

export const JudgeSyncDashboard: React.FC<JudgeSyncDashboardProps> = ({ judgeId }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Judge Sync Dashboard</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Judge synchronization dashboard for {judgeId || 'all judges'}</p>
      </CardContent>
    </Card>
  );
};

export default JudgeSyncDashboard;