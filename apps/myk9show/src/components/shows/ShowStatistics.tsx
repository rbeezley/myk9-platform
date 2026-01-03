import React from 'react';
import { Card } from '@/components/ui/card';

interface ShowStatisticsProps {
  stats: {
    totalTrials: number;
    totalClasses: number;
    totalEntries: number;
    completedTrials: number;
    completedClasses: number;
    completedEntries: number;
  };
}

const ShowStatistics: React.FC<ShowStatisticsProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-card-secondary">
      <Card className="p-6 text-center bg-card-secondary">
        <div className="text-lg font-semibold mb-2 text-muted-foreground">Total Trials</div>
        <div className="text-3xl font-bold mb-1">{stats.totalTrials}</div>
        <div className="text-sm text-muted-foreground">Completed: {stats.completedTrials}</div>
      </Card>
      <Card className="p-6 text-center bg-card-secondary">
        <div className="text-lg font-semibold mb-2 text-muted-foreground">Total Classes</div>
        <div className="text-3xl font-bold mb-1">{stats.totalClasses}</div>
        <div className="text-sm text-muted-foreground">Completed: {stats.completedClasses}</div>
      </Card>
      <Card className="p-6 text-center bg-card-secondary">
        <div className="text-lg font-semibold mb-2 text-muted-foreground">Total Entries</div>
        <div className="text-3xl font-bold mb-1">{stats.totalEntries}</div>
        <div className="text-sm text-muted-foreground">Completed: {stats.completedEntries}</div>
      </Card>
    </div>
  );
};

export default ShowStatistics;
