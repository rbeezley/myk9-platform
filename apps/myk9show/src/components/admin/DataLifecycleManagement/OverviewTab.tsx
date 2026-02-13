/**
 * Overview tab panel – archive summary, scheduler status, and recent activity.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Archive,
  Activity,
  FileText,
  Play,
  Pause,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import type { OverviewTabProps } from './types';

export function OverviewTab({
  archiveStats,
  schedulerStatus,
  isLoading,
  onStartScheduler,
  onStopScheduler,
  onRunArchiveCheck,
}: OverviewTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Archive Summary */}
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              Archive Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {archiveStats ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Archives:</span>
                  <span className="font-medium">{archiveStats.totalArchived}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Storage Used:</span>
                  <span className="font-medium">{archiveStats.totalSizeMB.toFixed(2)}MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Compression:</span>
                  <span className="font-medium">
                    {(archiveStats.compressionRatio * 100).toFixed(0)}%
                  </span>
                </div>
                {archiveStats.oldestArchive && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Oldest:</span>
                    <span className="font-medium text-sm">{archiveStats.oldestArchive}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Loading archive statistics...</p>
            )}
          </CardContent>
        </Card>

        {/* Scheduler Status */}
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Scheduler Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {schedulerStatus ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  {schedulerStatus.isRunning ? (
                    <Badge className="bg-green-100 text-green-800">
                      <Play className="h-3 w-3 mr-1" />
                      Running
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Pause className="h-3 w-3 mr-1" />
                      Stopped
                    </Badge>
                  )}
                </div>

                {schedulerStatus.lastRunTime ? (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Last Run:</span>
                    <span className="font-medium text-sm">
                      {String(new Date(schedulerStatus.lastRunTime as string | number | Date).toLocaleString())}
                    </span>
                  </div>
                ) : null}

                {schedulerStatus.nextRunTime ? (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Next Run:</span>
                    <span className="font-medium text-sm">
                      {String(new Date(schedulerStatus.nextRunTime as string | number | Date).toLocaleString())}
                    </span>
                  </div>
                ) : null}

                <div className="flex gap-2 pt-2">
                  {schedulerStatus.isRunning ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="!border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                      onClick={onStopScheduler}
                    >
                      <Pause className="h-4 w-4 mr-2" />
                      Stop
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={onStartScheduler}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="!border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                    onClick={onRunArchiveCheck}
                    disabled={isLoading}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Run Now
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Loading scheduler status...</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm">Archive scheduler started</span>
              <span className="text-xs text-muted-foreground ml-auto">2 min ago</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-lg">
              <Archive className="h-4 w-4 text-blue-600" />
              <span className="text-sm">3 shows archived automatically</span>
              <span className="text-xs text-muted-foreground ml-auto">1 hour ago</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-lg">
              <Trash2 className="h-4 w-4 text-orange-600" />
              <span className="text-sm">Cleanup scan completed - 12 orphans found</span>
              <span className="text-xs text-muted-foreground ml-auto">6 hours ago</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
