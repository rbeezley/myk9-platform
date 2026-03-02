/**
 * Quick actions section for SecretaryDashboard
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, AlertCircle } from 'lucide-react';
import type { DashboardStatistics, TrialOverview } from './secretary-dashboard-types';

interface QuickActionsSectionProps {
  statistics: DashboardStatistics;
  activeTrials: TrialOverview[];
  completedTrialsCount: number;
  showsCount: number;
}

export const QuickActionsSection: React.FC<QuickActionsSectionProps> = ({
  statistics,
  activeTrials,
  completedTrialsCount,
  showsCount,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {/* Result Entry Card */}
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="pb-6 relative">
          <CardTitle className="text-xl font-bold flex items-center gap-4">
            <div className="p-4 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="text-foreground group-hover:text-primary transition-colors duration-300">
                Result Entry
              </div>
              <div className="text-sm font-normal text-muted-foreground mt-1">
                Quick access to result entry forms
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pending entries</span>
              <Badge className="bg-primary/10 text-primary border-primary/20">
                {statistics.totalEntries - statistics.resultsPublished || 0}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active trials</span>
              <span className="font-medium text-success-green">{statistics.activeTrials || 0}</span>
            </div>
          </div>
          <Button className="w-full mt-6 font-semibold py-3">
            <FileText className="h-4 w-4 mr-2" />
            Enter Results
          </Button>
        </CardContent>
      </Card>

      {/* Export Reports Card */}
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2 hover:border-blue-500/30">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="pb-6 relative">
          <CardTitle className="text-xl font-bold flex items-center gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
              <Download className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <div className="text-foreground group-hover:text-blue-600 transition-colors duration-300">
                Export Reports
              </div>
              <div className="text-sm font-normal text-muted-foreground mt-1">
                Generate and download reports
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Reports ready</span>
              <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                {completedTrialsCount || 0}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total shows</span>
              <span className="font-medium">{showsCount || 0}</span>
            </div>
          </div>
          <Button className="w-full mt-6 font-semibold py-3">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        </CardContent>
      </Card>

      {/* Pending Actions Card */}
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2 hover:border-warning-orange/30">
        <div className="absolute inset-0 bg-gradient-to-br from-warning-orange/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="pb-6 relative">
          <CardTitle className="text-xl font-bold flex items-center gap-4">
            <div className="p-4 bg-gradient-to-br from-warning-orange/20 to-warning-orange/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300 relative">
              <AlertCircle className="h-6 w-6 text-warning-orange" />
              <div className="absolute -top-1 -right-1 h-3 w-3 bg-error-red rounded-full animate-pulse" />
            </div>
            <div>
              <div className="text-foreground group-hover:text-warning-orange transition-colors duration-300">
                Pending Actions
              </div>
              <div className="text-sm font-normal text-muted-foreground mt-1">
                Items requiring immediate attention
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          {activeTrials.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-warning-orange/5 rounded-lg border border-warning-orange/10">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 bg-warning-orange rounded-full" />
                  <span className="text-sm font-medium">Active trials</span>
                </div>
                <Badge className="bg-warning-orange/10 text-warning-orange border-warning-orange/20 font-bold">
                  {activeTrials.length}
                </Badge>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No pending actions</p>
              <p className="text-xs text-muted-foreground mt-1">All trials are up to date</p>
            </div>
          )}
          <Button className="w-full mt-6 font-semibold py-3">
            <AlertCircle className="h-4 w-4 mr-2" />
            View All Issues
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
