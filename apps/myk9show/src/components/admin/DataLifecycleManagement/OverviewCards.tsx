/**
 * Overview statistic cards displayed at the top of the Data Lifecycle Management dashboard.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Archive,
  HardDrive,
  Clock,
  Shield,
  Home,
  Users,
} from 'lucide-react';
import type { OverviewCardsProps } from './types';

export function OverviewCards({
  archiveStats,
  schedulerStatus,
  policyCount,
  deletedClubsCount,
  deletedDogsCount,
}: OverviewCardsProps) {
  return (
    <>
      {/* Top-level metric cards */}
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
            <HardDrive className="h-8 w-8 text-green-600 mr-3" />
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
              <p className="text-2xl font-bold">
                {schedulerStatus?.isRunning ? (
                  <Badge variant="default" className="bg-green-100 text-green-800">Running</Badge>
                ) : (
                  <Badge variant="secondary">Stopped</Badge>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <Shield className="h-8 w-8 text-purple-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Policies</p>
              <p className="text-2xl font-bold">{policyCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deleted Entities Overview Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <Home className="h-8 w-8 text-orange-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Deleted Clubs</p>
              <p className="text-2xl font-bold">{deletedClubsCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <Users className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Deleted Dogs</p>
              <p className="text-2xl font-bold">{deletedDogsCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
