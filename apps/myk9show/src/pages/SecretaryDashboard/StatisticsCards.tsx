/**
 * Statistics cards section for SecretaryDashboard
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  ClipboardList,
  Users,
  Target,
  Timer,
  CheckCircle2,
  BarChart3,
  Zap,
} from 'lucide-react';
import type { DashboardStatistics } from './secretary-dashboard-types';

interface StatisticsCardsProps {
  statistics: DashboardStatistics;
  totalTrialsCount: number;
}

export const StatisticsCards: React.FC<StatisticsCardsProps> = ({
  statistics,
  totalTrialsCount,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Active Trials Card */}
      <Card className="relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-sm hover:-translate-y-2 group">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="pb-4 relative">
          <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm group-hover:shadow-md transition-all duration-300">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              Active Trials
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 relative">
          <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
            {statistics.activeTrials}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground font-medium">
              {statistics.activeTrials > 0
                ? `${statistics.activeTrials} in progress`
                : 'No active trials'}
            </p>
            {statistics.activeTrials > 0 && (
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 bg-success-green rounded-full animate-pulse" />
                <span className="text-xs text-success-green font-medium">Live</span>
              </div>
            )}
          </div>
          {statistics.activeTrials > 0 && (
            <Progress
              value={(statistics.activeTrials / totalTrialsCount) * 100}
              className="mt-3 h-1"
            />
          )}
        </CardContent>
      </Card>

      {/* Total Entries Card */}
      <Card className="relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2 group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="pb-4 relative">
          <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl shadow-sm group-hover:shadow-md transition-all duration-300">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              Total Entries
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 relative">
          <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
            {statistics.totalEntries}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground font-medium">
              {statistics.totalEntries > 0
                ? `${statistics.totalEntries} total entries`
                : 'No entries yet'}
            </p>
            {statistics.totalEntries > 0 && (
              <div className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3 text-blue-500" />
                <span className="text-xs text-blue-500 font-medium">Active</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Published Card */}
      <Card className="relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2 group">
        <div className="absolute inset-0 bg-gradient-to-br from-success-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="pb-4 relative">
          <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-xl shadow-sm group-hover:shadow-md transition-all duration-300">
                <Target className="h-5 w-5 text-success-green" />
              </div>
              Results Published
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 relative">
          <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
            {statistics.resultsPublished}%
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground font-medium">
              {statistics.totalEntries > 0
                ? `${statistics.resultsPublished}% completed`
                : 'No results to publish'}
            </p>
            {statistics.resultsPublished > 0 && (
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-success-green" />
                <span className="text-xs text-success-green font-medium">Processing</span>
              </div>
            )}
          </div>
          {statistics.totalEntries > 0 && (
            <Progress value={statistics.resultsPublished} className="mt-3 h-1" />
          )}
        </CardContent>
      </Card>

      {/* Avg Processing Card */}
      <Card className="relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2 group">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="pb-4 relative">
          <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-500/20 to-purple-500/10 rounded-xl shadow-sm group-hover:shadow-md transition-all duration-300">
                <Timer className="h-5 w-5 text-purple-500" />
              </div>
              Avg. Processing
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 relative">
          <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
            {statistics.avgProcessing}m
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground font-medium">
              {statistics.avgProcessing > 0 ? 'Per class average' : 'No data available'}
            </p>
            {statistics.avgProcessing > 0 && (
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-purple-500" />
                <span className="text-xs text-purple-500 font-medium">Tracking</span>
              </div>
            )}
          </div>
          {statistics.avgProcessing > 0 && (
            <div className="mt-3 flex gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i < Math.round(statistics.avgProcessing / 5)
                      ? 'bg-success-green'
                      : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
