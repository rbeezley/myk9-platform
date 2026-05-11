/**
 * Overview statistic cards displayed at the top of the Data Lifecycle Management dashboard.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Archive, HardDrive, Clock, Shield } from 'lucide-react';
import type { OverviewCardsProps } from './types';

export function OverviewCards({
  archiveStats,
  schedulerStatus,
  policyCount,
}: OverviewCardsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <Archive className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Archived Shows</p>
              <p className="text-2xl font-bold">{archiveStats?.totalArchived || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <HardDrive className="h-8 w-8 text-teal-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Storage Used</p>
              <p className="text-2xl font-bold">
                {archiveStats?.totalSizeMB ? `${archiveStats.totalSizeMB.toFixed(1)}MB` : '0MB'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <Clock className="h-8 w-8 text-orange-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Scheduler Status</p>
              <div className="text-2xl font-bold">
                {schedulerStatus?.isRunning ? (
                  <Badge variant="default" className="bg-teal-100 text-teal-800">
                    Running
                  </Badge>
                ) : (
                  <Badge variant="secondary">Stopped</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <Shield className="h-8 w-8 text-violet-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Policies</p>
              <p className="text-2xl font-bold">{policyCount}</p>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
