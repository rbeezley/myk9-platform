/**
 * Multi-Area Timer Display Component
 *
 * Displays individual timers for each area in multi-area Scent Work classes.
 * Shows area status, individual times, and total elapsed time.
 */

import { Clock, CheckCircle2, XCircle, Lock, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

// Utilities
import { msToDisplay } from '@/lib/timeUtils';
import type { AreaStatus } from '@/types/scent-work-types';

export interface MultiAreaTimerDisplayProps {
  areaCount: number;
  currentAreaIndex: number;
  areaStatuses: AreaStatus[];
  areaTimes: number[];
  totalElapsedTime: number;
  totalTimeLimit: number;
  remainingTime: number;
  isRunning: boolean;
  onStartArea: (areaIndex: number) => void;
  onCompleteArea: () => void;
  onFailArea: () => void;
  className?: string;
}

/**
 * Multi-area timer display with individual area controls
 *
 * Features:
 * - Visual representation of each area with status
 * - Individual area times and controls
 * - Total time tracking with progress bar
 * - Area-specific start/complete/fail actions
 */
export function MultiAreaTimerDisplay({
  areaCount,
  currentAreaIndex,
  areaStatuses,
  areaTimes,
  totalElapsedTime,
  totalTimeLimit,
  remainingTime,
  isRunning: _isRunning,
  onStartArea,
  onCompleteArea,
  onFailArea,
  className,
}: MultiAreaTimerDisplayProps) {
  // Calculate progress percentage
  const progressPercentage = Math.min(100, (totalElapsedTime / totalTimeLimit) * 100);
  const isTimeWarning = remainingTime < 30000; // 30 seconds
  const isTimeCritical = remainingTime < 10000; // 10 seconds

  // Get status icon for area
  const getAreaIcon = (status: AreaStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'active':
        return <PlayCircle className="h-5 w-5 text-blue-600 animate-pulse" />;
      case 'ready':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'locked':
      default:
        return <Lock className="h-5 w-5 text-gray-400" />;
    }
  };

  // Get area card styling based on status
  const getAreaCardStyle = (status: AreaStatus, isCurrentArea: boolean) => {
    const baseClasses = 'transition-all duration-200';

    if (isCurrentArea && status === 'active') {
      return cn(baseClasses, 'border-2 border-blue-500 bg-info/10 ');
    }

    switch (status) {
      case 'completed':
        return cn(baseClasses, 'border-green-200 bg-success/10 ');
      case 'failed':
        return cn(baseClasses, 'border-red-200 bg-destructive/10 ');
      case 'ready':
        return cn(baseClasses, 'border-yellow-200 bg-warning/10 hover:shadow-md cursor-pointer');
      case 'locked':
      default:
        return cn(baseClasses, 'border-gray-200 bg-gray-50 dark:bg-gray-800 opacity-60');
    }
  };

  // Format area names
  const areaNames = ['Area 1', 'Area 2', 'Area 3'].slice(0, areaCount);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Total Time Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Total Time</span>
            </span>
            <Badge
              variant={isTimeCritical ? 'destructive' : isTimeWarning ? 'secondary' : 'default'}
              className="text-base font-mono"
            >
              {msToDisplay(totalElapsedTime, 'hundredths')} /{' '}
              {msToDisplay(totalTimeLimit, 'seconds')}
            </Badge>
          </CardTitle>
          <CardDescription>Remaining: {msToDisplay(remainingTime, 'seconds')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Progress
            value={progressPercentage}
            className={cn(
              'h-3 transition-colors',
              isTimeCritical ? 'bg-red-200' : isTimeWarning ? 'bg-yellow-200' : ''
            )}
          />
        </CardContent>
      </Card>

      {/* Individual Area Timers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {areaNames.map((areaName, index) => {
          const status = areaStatuses[index];
          const time = areaTimes[index];
          const isCurrentArea = currentAreaIndex === index;
          const canStart = status === 'ready' && !isCurrentArea;

          return (
            <Card
              key={index}
              className={getAreaCardStyle(status, isCurrentArea)}
              onClick={() => canStart && onStartArea(index)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-lg">
                  <span>{areaName}</span>
                  {getAreaIcon(status)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Time Display */}
                <div className="text-center">
                  <div className="text-2xl font-mono font-bold text-gray-900 dark:text-white">
                    {time > 0 ? msToDisplay(time, 'hundredths') : '--:--.--'}
                  </div>
                  {status === 'active' && (
                    <div className="text-sm text-gray-600 dark:text-gray-400 animate-pulse">
                      Timing...
                    </div>
                  )}
                </div>

                {/* Area Actions */}
                {status === 'ready' && !isCurrentArea && (
                  <Button
                    onClick={e => {
                      e.stopPropagation();
                      onStartArea(index);
                    }}
                    className="w-full"
                    size="sm"
                  >
                    Start {areaName}
                  </Button>
                )}

                {status === 'active' && isCurrentArea && (
                  <div className="flex gap-2">
                    <Button onClick={onCompleteArea} variant="default" size="sm" className="flex-1">
                      Complete
                    </Button>
                    <Button onClick={onFailArea} variant="destructive" size="sm" className="flex-1">
                      Fail
                    </Button>
                  </div>
                )}

                {/* Status Badge */}
                {(status === 'completed' || status === 'failed') && (
                  <Badge
                    variant={status === 'completed' ? 'default' : 'destructive'}
                    className="w-full justify-center"
                  >
                    {status === 'completed' ? 'Completed' : 'Failed'}
                  </Badge>
                )}

                {status === 'locked' && (
                  <div className="text-center text-sm text-gray-500">
                    Complete previous areas first
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Stats */}
      {areaStatuses.some(s => s === 'completed' || s === 'failed') && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-around text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {areaStatuses.filter(s => s === 'completed').length}
                </div>
                <div className="text-sm text-gray-600">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {areaStatuses.filter(s => s === 'failed').length}
                </div>
                <div className="text-sm text-gray-600">Failed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-600">
                  {areaStatuses.filter(s => s === 'locked' || s === 'ready').length}
                </div>
                <div className="text-sm text-gray-600">Remaining</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
