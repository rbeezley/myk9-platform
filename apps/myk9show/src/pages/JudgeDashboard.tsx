import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthContext } from '@/hooks/useAuthContext';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { logger } from '@/services/LoggingService';
import { GlassCard } from '@/components/common/GlassCard';
import {
  Trophy,
  Clock,
  Users,
  CheckCircle2,
  Circle,
  AlertCircle,
  Calendar,
  ArrowRight,
  Timer,
  CalendarDays,
  CheckCircle,
  Eye,
} from 'lucide-react';
import { StaggeredGrid } from '@/components/layout/StaggeredGrid';
import { FadeIn } from '@/components/layout/FadeIn';

interface JudgeClass {
  id: string;
  showId: string;
  trialId: string;
  classId: string;
  name: string;
  element: string;
  level: string;
  scheduledTime: Date;
  ringNumber: number;
  totalEntries: number;
  completedEntries: number;
  status: 'pending' | 'in-progress' | 'completed';
}

const JudgeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [selectedTab, setSelectedTab] = useState('today');
  const [assignments, setAssignments] = useState<JudgeClass[]>([]);

  const loadJudgeData = async () => {
    // Mock data - replace with actual data from stores
    const mockClasses: JudgeClass[] = [
      {
        id: '1',
        showId: 'show-001',
        trialId: 'trial-001',
        classId: 'class-001',
        name: 'Interior Novice A',
        element: 'Interior',
        level: 'Novice',
        scheduledTime: new Date(Date.now() + 30 * 60000),
        ringNumber: 1,
        totalEntries: 24,
        completedEntries: 0,
        status: 'pending',
      },
      {
        id: '2',
        showId: 'show-001',
        trialId: 'trial-001',
        classId: 'class-002',
        name: 'Container Excellent',
        element: 'Container',
        level: 'Excellent',
        scheduledTime: new Date(Date.now() + 90 * 60000),
        ringNumber: 1,
        totalEntries: 18,
        completedEntries: 0,
        status: 'pending',
      },
    ];
    setAssignments(mockClasses);
  };

  // Load judge data and set up effects (ProtectedRoute gates access)
  useEffect(() => {
    queueMicrotask(() => {
      loadJudgeData();
      auditService.log({
        action: AuditAction.READ,
        entityType: 'judge_dashboard',
        entityId: user?.id || 'unknown',
        metadata: {
          page: 'judge_dashboard',
          loadTime: new Date().toISOString(),
        },
      });
    });
  }, [user?.id]);

  // Use assignments state instead of todaysClasses const
  const todaysClasses = assignments;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-[#34C759]" />;
      case 'in-progress':
        return <Timer className="h-5 w-5 text-[#007AFF] animate-pulse" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-success-green/10 text-success-green border-success-green/20 border">
            Completed
          </Badge>
        );
      case 'in-progress':
        return (
          <Badge className="bg-primary/10 text-primary border-primary/20 border">In Progress</Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border border">Pending</Badge>
        );
    }
  };

  const handleStartJudging = async (judgeClass: JudgeClass) => {
    try {
      // Audit log the start of judging
      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'judge_class',
        entityId: judgeClass.id,
        changes: {
          status: { from: judgeClass.status, to: 'in-progress' },
        },
        metadata: {
          action: 'start_judging',
          classId: judgeClass.classId,
          judgeId: user?.id,
        },
      });

      navigate(
        `/shows/${judgeClass.showId}/trials/${judgeClass.trialId}/classes/${judgeClass.classId}/judge`
      );
    } catch (error) {
      logger.error('Failed to start judging:', 'pages', {}, error as Error);
    }
  };

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Judge Dashboard
            </h1>
            <p className="text-muted-foreground text-lg font-medium">
              Manage your judging assignments
            </p>
          </div>
          <Button
            variant="outline"
            className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
          >
            <Calendar className="h-4 w-4 mr-2" />
            View Schedule
          </Button>
        </div>

        {/* Statistics Cards */}
        <StaggeredGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <GlassCard>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <Trophy className="h-5 w-5 text-primary" />
                  </div>
                  Today&apos;s Classes
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                8
              </div>
              <p className="text-sm text-muted-foreground font-medium">3 completed</p>
            </CardContent>
          </GlassCard>

          <GlassCard overlayGradient="from-blue-500/5">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  Total Entries
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                142
              </div>
              <p className="text-sm text-muted-foreground font-medium">57 judged</p>
            </CardContent>
          </GlassCard>

          <GlassCard overlayGradient="from-warning-orange/5">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-warning-orange/20 to-warning-orange/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <Clock className="h-5 w-5 text-warning-orange" />
                  </div>
                  Next Class
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                30m
              </div>
              <p className="text-sm text-muted-foreground font-medium">Interior Novice A</p>
            </CardContent>
          </GlassCard>

          <GlassCard overlayGradient="from-success-green/5">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <CheckCircle2 className="h-5 w-5 text-success-green" />
                  </div>
                  Completion Rate
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                95%
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 bg-success-green rounded-full animate-pulse" />
                <span className="text-sm text-success-green font-medium">On schedule</span>
              </div>
            </CardContent>
          </GlassCard>
        </StaggeredGrid>

        {/* Classes List */}
        <FadeIn>
          <Card className="bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-semibold">Judging Assignments</CardTitle>
              <CardDescription className="text-muted-foreground">
                Your scheduled classes for judging
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
                  <TabsTrigger
                    value="today"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Today
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

                <TabsContent value="today" className="space-y-4">
                  {todaysClasses.map(judgeClass => (
                    <div
                      key={judgeClass.id}
                      className="group relative overflow-hidden flex items-center justify-between p-4 sm:p-6 border border-border rounded-2xl bg-gradient-to-r from-card to-card/80 hover:from-card/95 hover:to-card/90 transition-all duration-500 hover:shadow-xl hover:-translate-y-1 active:scale-[0.99]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="relative flex items-center gap-4">
                        {getStatusIcon(judgeClass.status)}
                        <div>
                          <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors duration-300">
                            {judgeClass.name}
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span>Ring {judgeClass.ringNumber}</span>
                            <span>&bull;</span>
                            <span>
                              {judgeClass.scheduledTime.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <span>&bull;</span>
                            <span>
                              {judgeClass.completedEntries}/{judgeClass.totalEntries} entries
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="relative flex items-center gap-2">
                        {getStatusBadge(judgeClass.status)}
                        {judgeClass.status !== 'completed' && (
                          <Button
                            size="sm"
                            onClick={() => handleStartJudging(judgeClass)}
                            className="bg-primary text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                          >
                            {judgeClass.status === 'in-progress' ? 'Continue' : 'Start'} Judging
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {todaysClasses.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="mx-auto w-24 h-24 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center mb-6">
                        <Trophy className="h-12 w-12 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        No Classes Today
                      </h3>
                      <p className="text-muted-foreground max-w-sm text-center">
                        You have no classes scheduled for today. Check upcoming assignments below.
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="upcoming" className="mt-4">
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="mx-auto w-24 h-24 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-full flex items-center justify-center mb-6">
                      <Calendar className="h-12 w-12 text-blue-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      No Upcoming Classes
                    </h3>
                    <p className="text-muted-foreground max-w-sm text-center">
                      Your upcoming judging assignments will appear here when scheduled.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="completed" className="mt-4">
                  <div className="space-y-4">
                    {todaysClasses
                      .filter(c => c.status === 'completed')
                      .map(judgeClass => (
                        <div
                          key={judgeClass.id}
                          className="group relative overflow-hidden flex items-center justify-between p-4 sm:p-6 border border-border rounded-2xl bg-gradient-to-r from-card to-card/80 hover:from-card/95 hover:to-card/90 transition-all duration-500 hover:shadow-xl hover:-translate-y-1 active:scale-[0.99]"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-success-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <div className="relative flex items-center gap-4">
                            {getStatusIcon(judgeClass.status)}
                            <div>
                              <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors duration-300">
                                {judgeClass.name}
                              </h3>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                <span>Ring {judgeClass.ringNumber}</span>
                                <span>&bull;</span>
                                <span>{judgeClass.totalEntries} entries judged</span>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="relative border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Results
                          </Button>
                        </div>
                      ))}

                    {todaysClasses.filter(c => c.status === 'completed').length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16">
                        <div className="mx-auto w-24 h-24 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-full flex items-center justify-center mb-6">
                          <CheckCircle2 className="h-12 w-12 text-success-green" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          No Completed Classes
                        </h3>
                        <p className="text-muted-foreground max-w-sm text-center">
                          Completed judging assignments will appear here.
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </FadeIn>

        {/* Quick Actions */}
        <StaggeredGrid className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
          <GlassCard>
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                  <Timer className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="text-foreground group-hover:text-primary transition-colors duration-300">
                    Timer Practice
                  </div>
                  <div className="text-sm font-normal text-muted-foreground mt-1">
                    Practice with the timer system
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full font-semibold py-3 border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-300"
                variant="outline"
              >
                <Timer className="h-4 w-4 mr-2" />
                Open Timer Practice
              </Button>
            </CardContent>
          </GlassCard>

          <GlassCard overlayGradient="from-warning-orange/5">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-warning-orange/20 to-warning-orange/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                  <AlertCircle className="h-6 w-6 text-warning-orange" />
                </div>
                <div>
                  <div className="text-foreground group-hover:text-warning-orange transition-colors duration-300">
                    Quick Reference
                  </div>
                  <div className="text-sm font-normal text-muted-foreground mt-1">
                    Judging guidelines and rules
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full font-semibold py-3 border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-300"
                variant="outline"
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                View Guidelines
              </Button>
            </CardContent>
          </GlassCard>

          <GlassCard overlayGradient="from-success-green/5">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                  <Users className="h-6 w-6 text-success-green" />
                </div>
                <div>
                  <div className="text-foreground group-hover:text-success-green transition-colors duration-300">
                    Class Management
                  </div>
                  <div className="text-sm font-normal text-muted-foreground mt-1">
                    Manage entries and check-in status
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full font-semibold py-3 border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-300"
                variant="outline"
                disabled
              >
                <Users className="h-4 w-4 mr-2" />
                Integrated in Class View
              </Button>
            </CardContent>
          </GlassCard>
        </StaggeredGrid>
      </div>
    </div>
  );
};

export default JudgeDashboard;
