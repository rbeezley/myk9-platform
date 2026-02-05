import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface ScheduleStats {
  totalDuration: number;
  judgeCount: number;
  totalConflicts: number;
  startTime: Date | null;
  endTime: Date | null;
}

interface RunOrderQuickStatsProps {
  classCount: number;
  stats: ScheduleStats;
}

export const RunOrderQuickStats: React.FC<RunOrderQuickStatsProps> = ({
  classCount,
  stats,
}) => {
  const formatDuration = (minutes: number | undefined) => {
    if (!minutes) return '--';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatTime = (date: Date | null) => {
    return date ? date.toTimeString().slice(0, 5) : '--:--';
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{classCount}</div>
            <div className="text-sm text-muted-foreground">Classes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {formatDuration(stats.totalDuration)}
            </div>
            <div className="text-sm text-muted-foreground">Duration</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.judgeCount}</div>
            <div className="text-sm text-muted-foreground">Judges</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${stats.totalConflicts > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.totalConflicts}
            </div>
            <div className="text-sm text-muted-foreground">Conflicts</div>
          </div>
          <div className="text-center">
            <div className="text-sm">
              {formatTime(stats.startTime)} - {formatTime(stats.endTime)}
            </div>
            <div className="text-sm text-muted-foreground">Schedule</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
