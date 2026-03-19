/**
 * Trial management tabs section for SecretaryDashboard
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ClipboardList,
  Users,
  TrendingUp,
  Settings,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Target,
  Timer,
  ChevronRight,
  PlayCircle,
  FolderOpen,
  Play,
  CheckCircle,
  Eye,
  Download,
  Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import type { TrialOverview } from './secretary-dashboard-types';
import { getStatusBadge } from './secretaryDashboardUtils';

interface TrialManagementTabsProps {
  selectedTab: string;
  onTabChange: (value: string) => void;
  activeTrials: TrialOverview[];
  upcomingTrials: TrialOverview[];
  completedTrials: TrialOverview[];
  onManageTrial: (trial: TrialOverview) => void;
  onCreateShow: () => void;
}

export const TrialManagementTabs: React.FC<TrialManagementTabsProps> = ({
  selectedTab,
  onTabChange,
  activeTrials,
  upcomingTrials,
  completedTrials,
  onManageTrial,
  onCreateShow,
}) => {
  return (
    <Card className="bg-card border border-border rounded-xl shadow-sm backdrop-blur-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-semibold">Trial Management</CardTitle>
        <CardDescription className="text-muted-foreground">
          Overview of trials requiring secretary management
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs value={selectedTab} onValueChange={onTabChange}>
          <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
            <TabsTrigger
              value="active"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
            >
              <Play className="h-4 w-4" />
              Active
            </TabsTrigger>
            <TabsTrigger
              value="upcoming"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
            >
              <Calendar className="h-4 w-4" />
              Upcoming
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
            >
              <CheckCircle className="h-4 w-4" />
              Completed
            </TabsTrigger>
          </TabsList>

          {/* Active Trials Tab */}
          <TabsContent value="active" className="space-y-6 mt-6">
            {activeTrials.map(trial => {
              const progressPercentage =
                trial.totalClasses > 0 ? (trial.completedClasses / trial.totalClasses) * 100 : 0;
              const entriesProgressPercentage =
                trial.totalEntries > 0 ? (trial.processedEntries / trial.totalEntries) * 100 : 0;

              return (
                <div
                  key={trial.id}
                  className="group relative overflow-hidden p-8 border border-border rounded-2xl bg-gradient-to-r from-card to-card/80 hover:from-card/95 hover:to-card/90 transition-all duration-500 hover:shadow-xl hover:-translate-y-1"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="relative flex items-center justify-between">
                    <div className="flex-grow space-y-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors duration-300">
                          <PlayCircle className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-xl text-foreground group-hover:text-primary transition-colors duration-300">
                            {trial.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            {getStatusBadge(trial.status)}
                            <span className="text-sm text-muted-foreground">
                              Started {trial.date.toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-medium text-muted-foreground">
                              Classes Progress
                            </p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold">
                              {trial.completedClasses}
                              <span className="text-lg text-muted-foreground">
                                /{trial.totalClasses}
                              </span>
                            </p>
                            <Progress value={progressPercentage} className="mt-2 h-2" />
                            <p className="text-xs text-muted-foreground mt-1">
                              {Math.round(progressPercentage)}% complete
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-medium text-muted-foreground">
                              Entry Processing
                            </p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold">
                              {trial.processedEntries}
                              <span className="text-lg text-muted-foreground">
                                /{trial.totalEntries}
                              </span>
                            </p>
                            <Progress value={entriesProgressPercentage} className="mt-2 h-2" />
                            <p className="text-xs text-muted-foreground mt-1">
                              {Math.round(entriesProgressPercentage)}% processed
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-medium text-muted-foreground">Efficiency</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-success-green">94%</p>
                            <div className="flex items-center gap-1 mt-1">
                              <TrendingUp className="h-3 w-3 text-success-green" />
                              <span className="text-xs text-success-green font-medium">+12%</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Timer className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-medium text-muted-foreground">
                              Time Remaining
                            </p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold">2.5h</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Estimated completion
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="ml-8 flex flex-col gap-3">
                      <Button
                        onClick={() => onManageTrial(trial)}
                        className="px-6 py-3 text-base font-semibold"
                      >
                        Manage Trial
                        <ChevronRight className="h-5 w-5 ml-2" />
                      </Button>
                      <Button
                        variant="outline"
                        className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300"
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Quick Actions
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {activeTrials.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="bg-muted/50 rounded-full p-6 mb-4">
                  <FolderOpen className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Active Trials</h3>
                <p className="text-muted-foreground mb-6 max-w-sm text-center">
                  You don't have any active trials at the moment. Create a new show to get started.
                </p>
                <Button onClick={onCreateShow}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Show
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Upcoming Trials Tab */}
          <TabsContent value="upcoming" className="space-y-6 mt-6">
            {upcomingTrials.map(trial => (
              <div
                key={trial.id}
                className="group relative overflow-hidden p-6 border border-border rounded-2xl bg-gradient-to-r from-card to-card/80 hover:from-card/95 hover:to-card/90 transition-all duration-500 hover:shadow-sm hover:-translate-y-1"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors duration-300">
                      <Calendar className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-foreground group-hover:text-blue-600 transition-colors duration-300">
                        {trial.name}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span>Starts {trial.date.toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          <span>{trial.totalEntries} entries registered</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ClipboardList className="h-4 w-4" />
                          <span>{trial.totalClasses} classes scheduled</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {getStatusBadge(trial.status)}
                        <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-600 rounded-full text-xs font-medium">
                          <span>Ready for setup</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => onManageTrial(trial)}
                      className="border-blue-500/20 text-blue-600 hover:bg-blue-500/5 hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-300"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Prepare Trial
                    </Button>
                    <Button onClick={() => onManageTrial(trial)}>
                      Start Setup
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {upcomingTrials.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="bg-muted/50 rounded-full p-6 mb-4">
                  <Calendar className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Upcoming Trials</h3>
                <p className="text-muted-foreground mb-6 max-w-sm text-center">
                  You don't have any trials scheduled for the future. Schedule a new show to see it
                  here.
                </p>
                <Button onClick={onCreateShow}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Show
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Completed Trials Tab */}
          <TabsContent value="completed" className="space-y-6 mt-6">
            {completedTrials.map(trial => (
              <div
                key={trial.id}
                className="group relative overflow-hidden p-6 border border-border rounded-2xl bg-gradient-to-r from-card to-card/80 hover:from-card/95 hover:to-card/90 transition-all duration-500 hover:shadow-sm hover:-translate-y-1"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-success-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-success-green/10 rounded-xl group-hover:bg-success-green/20 transition-colors duration-300">
                      <CheckCircle2 className="h-6 w-6 text-success-green" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-foreground group-hover:text-success-green transition-colors duration-300">
                        {trial.name}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span>Completed on {format(trial.date, 'MMM d, yyyy')}</span>
                        <span>•</span>
                        <span>{trial.totalClasses} classes</span>
                        <span>•</span>
                        <span>{trial.totalEntries} entries</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="border-success-green/20 text-success-green hover:bg-success-green/5 hover:border-success-green/40"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Results
                    </Button>
                    <Button
                      variant="outline"
                      className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export Report
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {completedTrials.length === 0 && (
              <div className="text-center py-16">
                <div className="mx-auto w-24 h-24 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="h-12 w-12 text-success-green" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">All caught up!</h3>
                <p className="text-muted-foreground mb-6">
                  No completed trials to display at the moment.
                </p>
                <Button onClick={onCreateShow}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Show
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
